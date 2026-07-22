import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { createNotification } from './notifications.js';

export const tasksRoutes = new Hono();

function notifyAssignees(opts: {
  taskId: string;
  assigneeIds: string[];
  excludeUserId?: string;
  kind: string;
  title: string;
  body?: string;
  actorUserId?: string;
}) {
  const db = getDb();
  const task = db.prepare(`
    SELECT t.id, t.group_id, t.project_id, t.task_number, p.name as project_name
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(opts.taskId) as any;
  if (!task) return;
  const seen = new Set<string>();
  for (const uid of opts.assigneeIds) {
    if (!uid || uid === opts.excludeUserId) continue;
    if (seen.has(uid)) continue;
    seen.add(uid);
    createNotification({
      user_id: uid,
      kind: opts.kind,
      ref_type: 'task',
      ref_id: opts.taskId,
      group_id: task.group_id,
      project_id: task.project_id,
      actor_user_id: opts.actorUserId,
      title: opts.title,
      body: opts.body,
    });
  }
}

function getTaskAssignees(taskId: string): string[] {
  const db = getDb();
  const t = db.prepare('SELECT assignee_id, assignee_ids FROM tasks WHERE id = ?').get(taskId) as any;
  if (!t) return [];
  const ids: string[] = [];
  if (t.assignee_id) ids.push(t.assignee_id);
  if (t.assignee_ids) {
    try {
      const parsed = JSON.parse(t.assignee_ids);
      if (Array.isArray(parsed)) ids.push(...parsed);
    } catch {}
  }
  return [...new Set(ids)];
}

const VALID_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
type Status = typeof VALID_STATUSES[number];

function recordHistory(
  taskId: string, userId: string, actionType: string,
  fieldName: string | null, oldValue: string | null, newValue: string | null
) {
  const db = getDb();
  db.prepare(`
    INSERT INTO task_history (id, task_id, user_id, action_type, field_name, old_value, new_value)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), taskId, userId, actionType, fieldName, oldValue, newValue);
}

// === 繰り返しの次回期限計算（Todoist流: 完了すると期限が次回に進む） ===
// 期限切れのまま完了した場合は今日を基準に次回を探す（溜まった過去分を量産しない）
function computeNextDue(
  ruleKind: string,
  ruleJson: { interval?: number; weekdays?: number[]; day_of_month?: number; month_of_year?: number },
  currentDue: string | null
): string | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
  };
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  const anchor = currentDue ? parse(currentDue) : today;
  const base = anchor > today ? anchor : today;
  const interval = Math.max(1, ruleJson.interval ?? 1);

  if (ruleKind === 'daily') return fmt(addDays(base, interval));

  if (ruleKind === 'weekly') {
    const weekdays = ruleJson.weekdays?.length ? ruleJson.weekdays : [anchor.getDay()];
    for (let i = 1; i <= interval * 7 + 7; i++) {
      const d = addDays(base, i);
      if (!weekdays.includes(d.getDay())) continue;
      if (interval === 1) return fmt(d);
      const wk = Math.floor((d.getTime() - anchor.getTime()) / (7 * 86400000));
      if (((wk % interval) + interval) % interval === 0) return fmt(d);
    }
    return fmt(addDays(base, interval * 7));
  }

  if (ruleKind === 'monthly') {
    const dom = ruleJson.day_of_month ?? anchor.getDate();
    for (let i = 0; i <= 36; i++) {
      const y = anchor.getFullYear();
      const m = anchor.getMonth() + i * interval;
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const d = new Date(y, m, Math.min(dom, daysInMonth));
      if (d > base) return fmt(d);
    }
    return null;
  }

  if (ruleKind === 'yearly') {
    const dom = ruleJson.day_of_month ?? anchor.getDate();
    const moy = (ruleJson.month_of_year ?? anchor.getMonth() + 1) - 1;
    for (let i = 0; i <= 5; i++) {
      const d = new Date(base.getFullYear() + i, moy, dom);
      if (d > base) return fmt(d);
    }
  }
  return null;
}

// タスク詳細取得（子タスク・進捗ログ・繰り返し含む）
tasksRoutes.get('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const task = db.prepare(`
    SELECT t.*,
           u.name as assignee_name, u.omuid as assignee_omuid,
           creator.name as created_by_name,
           g.name as group_name, g.slug as group_slug,
           p.name as project_name, p.slug as project_slug, p.prefix as project_prefix,
           c.name as cycle_name, c.cycle_number as cycle_number
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users creator ON t.created_by = creator.id
    JOIN groups g ON t.group_id = g.id
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN cycles c ON t.cycle_id = c.id
    WHERE t.id = ?
  `).get(id);

  if (!task) return c.json({ error: 'Task not found' }, 404);

  const children = db.prepare(`
    SELECT t.*, u.name as assignee_name, u.omuid as assignee_omuid
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.parent_task_id = ?
    ORDER BY t.sort_order ASC, t.created_at ASC
  `).all(id);

  const recurrence = db.prepare(`
    SELECT * FROM task_recurrences WHERE task_id = ? AND active = 1
  `).get(id);

  const recentLogs = db.prepare(`
    SELECT pl.*, u.name as user_name
    FROM task_progress_logs pl
    JOIN users u ON pl.user_id = u.id
    WHERE pl.task_id = ?
    ORDER BY pl.created_at DESC
    LIMIT 20
  `).all(id);

  return c.json({ ...task, children, recurrence, recent_progress_logs: recentLogs });
});

// タスク作成
tasksRoutes.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const {
    project_id, title, description, start_date, due_date, due_time,
    status = 'not_started', priority = 'normal',
    assignee_id, assignee_ids, created_by, parent_task_id, cycle_id, labels,
    is_section = false,
  } = body;

  if (!project_id || !title || !created_by) {
    return c.json({ error: 'project_id, title, and created_by are required' }, 400);
  }
  if (!VALID_STATUSES.includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const project = db.prepare(`SELECT id, group_id, next_task_number FROM projects WHERE id = ?`)
    .get(project_id) as { id: string; group_id: string; next_task_number: number } | undefined;
  if (!project) return c.json({ error: 'Project not found' }, 404);

  let depth = 0;
  if (parent_task_id) {
    const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(parent_task_id) as any;
    if (parent) {
      depth = parent.depth + 1;
      if (depth > 4) return c.json({ error: 'Maximum task depth (5 levels) exceeded' }, 400);
    }
  }

  const id = uuidv4();
  const taskNumber = (project.next_task_number ?? 0) + 1;

  db.transaction(() => {
    db.prepare(`
      INSERT INTO tasks (
        id, project_id, cycle_id, group_id, parent_task_id, task_number, depth, is_section,
        title, description, start_date, due_date, due_time, status, priority,
        assignee_id, assignee_ids, labels, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, project_id, cycle_id ?? null, project.group_id,
      parent_task_id ?? null, taskNumber, depth, is_section ? 1 : 0,
      title, description ?? null, start_date ?? null, due_date ?? null, due_time ?? null,
      status, priority,
      assignee_id ?? null,
      assignee_ids ? JSON.stringify(assignee_ids) : null,
      labels ? JSON.stringify(labels) : null,
      created_by
    );
    db.prepare(`UPDATE projects SET next_task_number = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(taskNumber, project_id);
  })();

  const assignees = getTaskAssignees(id);
  if (assignees.length > 0) {
    notifyAssignees({
      taskId: id,
      assigneeIds: assignees,
      excludeUserId: created_by,
      kind: 'task_assigned',
      title: `担当タスクが追加されました: ${title}`,
      actorUserId: created_by,
    });
  }

  return c.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id), 201);
});

// プロジェクト間移設（サイドバーへのD&D等）。
// サブツリーごと移動し、移動先でtask_numberを再採番。cycle_idは移動先に存在しないためリセット。
// トップのparent_task_idは外す（セクション/親は移動元の文脈なので持ち込まない）
tasksRoutes.post('/:id/move-to-project', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { project_id } = body;
  if (!project_id) return c.json({ error: 'project_id is required' }, 400);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  if (!task) return c.json({ error: 'Task not found' }, 404);
  if (task.project_id === project_id) return c.json({ moved: false, task });

  const project = db.prepare('SELECT id, group_id, next_task_number FROM projects WHERE id = ?')
    .get(project_id) as { id: string; group_id: string; next_task_number: number } | undefined;
  if (!project) return c.json({ error: 'Project not found' }, 404);

  // サブツリー（非セクションの子孫）を収集
  const subtree: any[] = [];
  const collect = (parentId: string, depth: number) => {
    const children = db.prepare('SELECT * FROM tasks WHERE parent_task_id = ?').all(parentId) as any[];
    for (const ch of children) { subtree.push({ ...ch, _newDepth: depth }); collect(ch.id, depth + 1); }
  };
  collect(id, 1);

  const prev = { project_id: task.project_id, group_id: task.group_id,
                 parent_task_id: task.parent_task_id, cycle_id: task.cycle_id };

  let n = project.next_task_number ?? 0;
  const moveOne = db.prepare(`
    UPDATE tasks SET project_id = ?, group_id = ?, cycle_id = NULL, task_number = ?,
                     parent_task_id = ?, depth = ?, updated_at = datetime('now')
    WHERE id = ?`);
  const tx = db.transaction(() => {
    moveOne.run(project.id, project.group_id, ++n, null, 0, id);
    for (const ch of subtree) {
      moveOne.run(project.id, project.group_id, ++n, ch.parent_task_id, ch._newDepth, ch.id);
    }
    db.prepare(`UPDATE projects SET next_task_number = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(n, project.id);
  });
  tx();

  return c.json({
    moved: true,
    previous: prev, // クライアントのUndo用（元プロジェクトへ再move）
    task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(id),
  });
});

// タスク更新
tasksRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const userId = body.updated_by;

  const oldTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  if (!oldTask) return c.json({ error: 'Task not found' }, 404);

  const allowed = [
    'title', 'description', 'start_date', 'due_date', 'due_time', 'status', 'priority',
    'assignee_id', 'assignee_ids', 'labels', 'cycle_id', 'parent_task_id', 'is_section',
    'atlas_layout_mode', 'atlas_columns',
  ];
  const updates: string[] = [];
  const params: any[] = [];
  const changes: { field: string; oldValue: any; newValue: any }[] = [];

  for (const f of allowed) {
    if (body[f] !== undefined) {
      const newValue = (f === 'assignee_ids' || f === 'labels') && body[f] != null
        ? JSON.stringify(body[f]) : body[f];
      const oldValue = oldTask[f];
      if (f === 'status' && !VALID_STATUSES.includes(newValue)) {
        return c.json({ error: 'Invalid status' }, 400);
      }
      if (f === 'parent_task_id' && newValue) {
        // 自分自身を親にできない
        if (newValue === id) return c.json({ error: 'Cannot be own parent' }, 400);
      }
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({ field: f, oldValue, newValue });
      }
      updates.push(`${f} = ?`);
      params.push(newValue);
    }
  }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  // parent_task_id が変わったら depth を再計算
  if (body.parent_task_id !== undefined) {
    let depth = 0;
    if (body.parent_task_id) {
      const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(body.parent_task_id) as any;
      if (parent) {
        depth = parent.depth + 1;
        if (depth > 4) return c.json({ error: 'Max task depth exceeded' }, 400);
      }
    }
    updates.push('depth = ?');
    params.push(depth);
  }

  if (body.status === 'completed' && oldTask.status !== 'completed') {
    updates.push(`completed_at = datetime('now')`);
  } else if (body.status && body.status !== 'completed' && oldTask.status === 'completed') {
    updates.push(`completed_at = NULL`);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  if (userId) {
    for (const ch of changes) {
      recordHistory(id, userId, 'update', ch.field,
        ch.oldValue != null ? String(ch.oldValue) : null,
        ch.newValue != null ? String(ch.newValue) : null);
    }
  }

  // 担当者の変化があれば、新しく追加された担当者に通知
  const assigneeChanged = changes.find(c => c.field === 'assignee_id' || c.field === 'assignee_ids');
  if (assigneeChanged) {
    const oldIds = new Set<string>();
    const newIds = new Set<string>();
    if (oldTask.assignee_id) oldIds.add(oldTask.assignee_id);
    try { (JSON.parse(oldTask.assignee_ids || '[]') as string[]).forEach(x => oldIds.add(x)); } catch {}
    for (const id2 of getTaskAssignees(id)) newIds.add(id2);
    const added = [...newIds].filter(x => !oldIds.has(x));
    if (added.length > 0) {
      const updatedTask = db.prepare('SELECT title FROM tasks WHERE id = ?').get(id) as { title: string };
      notifyAssignees({
        taskId: id,
        assigneeIds: added,
        excludeUserId: userId,
        kind: 'task_assigned',
        title: `タスクの担当に追加されました: ${updatedTask.title}`,
        actorUserId: userId,
      });
    }
  }

  return c.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
});

// タスク削除
tasksRoutes.delete('/:id', (c) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(c.req.param('id'));
  if (result.changes === 0) return c.json({ error: 'Task not found' }, 404);
  return c.json({ success: true });
});

// === ステータス変更 ===
tasksRoutes.patch('/:id/status', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { status, updated_by } = body;

  if (!VALID_STATUSES.includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const task = db.prepare('SELECT status, due_date FROM tasks WHERE id = ?')
    .get(id) as { status: Status; due_date: string | null } | undefined;
  if (!task) return c.json({ error: 'Task not found' }, 404);

  // 繰り返しタスクの完了 → 完了にせず期限を次回に進める（Todoist流）
  if (status === 'completed' && task.status !== 'completed') {
    const rec = db.prepare(
      'SELECT * FROM task_recurrences WHERE task_id = ? AND active = 1'
    ).get(id) as { id: string; rule_kind: string; rule_json: string } | undefined;
    if (rec) {
      let ruleJson: any = {};
      try { ruleJson = JSON.parse(rec.rule_json); } catch {}
      const nextDue = computeNextDue(rec.rule_kind, ruleJson, task.due_date);
      if (nextDue) {
        db.transaction(() => {
          db.prepare(`
            UPDATE tasks SET due_date = ?, status = 'not_started', updated_at = datetime('now')
            WHERE id = ?
          `).run(nextDue, id);
          db.prepare(`
            UPDATE task_recurrences SET next_due = ?, last_generated_at = datetime('now')
            WHERE id = ?
          `).run(nextDue, rec.id);
        })();
        if (updated_by) {
          recordHistory(id, updated_by, 'recurred', 'due_date', task.due_date, nextDue);
        }
        return c.json({
          success: true, status: 'not_started',
          recurred: true, next_due: nextDue, previous_due: task.due_date,
        });
      }
    }
  }

  const completionUpdate = status === 'completed'
    ? `, completed_at = datetime('now')`
    : task.status === 'completed' ? `, completed_at = NULL` : '';

  db.prepare(`
    UPDATE tasks SET status = ?, updated_at = datetime('now') ${completionUpdate} WHERE id = ?
  `).run(status, id);

  if (updated_by && task.status !== status) {
    recordHistory(id, updated_by, 'status_change', 'status', task.status, status);
  }

  return c.json({ success: true, status });
});

// === 優先度変更 ===
tasksRoutes.patch('/:id/priority', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { priority, updated_by } = body;

  if (!['urgent', 'important', 'normal', 'none'].includes(priority)) {
    return c.json({ error: 'Invalid priority' }, 400);
  }

  const task = db.prepare('SELECT priority FROM tasks WHERE id = ?').get(id) as { priority: string } | undefined;
  if (!task) return c.json({ error: 'Task not found' }, 404);

  db.prepare(`UPDATE tasks SET priority = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(priority, id);

  if (updated_by && task.priority !== priority) {
    recordHistory(id, updated_by, 'priority_change', 'priority', task.priority, priority);
  }
  return c.json({ success: true, priority });
});

// === 並び替え ===
tasksRoutes.patch('/:id/reorder', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { parent_task_id, sort_order } = body;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  if (!task) return c.json({ error: 'Task not found' }, 404);

  let newDepth = 0;
  if (parent_task_id !== undefined && parent_task_id !== null) {
    if (parent_task_id === id) return c.json({ error: 'Cannot set self as parent' }, 400);
    const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(parent_task_id) as any;
    if (!parent) return c.json({ error: 'Parent task not found' }, 404);
    newDepth = parent.depth + 1;
    if (newDepth > 4) return c.json({ error: 'Max depth exceeded' }, 400);
  }

  const updates: string[] = [];
  const params: any[] = [];
  if (parent_task_id !== undefined) {
    updates.push('parent_task_id = ?', 'depth = ?');
    params.push(parent_task_id, newDepth);
  }
  if (sort_order !== undefined) {
    updates.push('sort_order = ?');
    params.push(sort_order);
  }
  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  updates.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return c.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
});

tasksRoutes.post('/reorder-bulk', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { tasks } = body;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return c.json({ error: 'tasks array is required' }, 400);
  }

  const transaction = db.transaction(() => {
    for (const t of tasks) {
      // parent_task_id はキーが明示されたときだけ変更する
      // （sort_order だけの並び替えで親が NULL に飛ばないように。null 指定=トップへ移動）
      if (!Object.prototype.hasOwnProperty.call(t, 'parent_task_id')) {
        db.prepare(`
          UPDATE tasks SET sort_order = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(t.sort_order ?? 0, t.id);
        continue;
      }
      if (t.parent_task_id === t.id) throw new Error('SELF_PARENT');
      let depth = 0;
      if (t.parent_task_id) {
        const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(t.parent_task_id) as any;
        if (parent) depth = parent.depth + 1;
      }
      if (depth > 4) throw new Error('MAX_DEPTH');
      db.prepare(`
        UPDATE tasks SET sort_order = ?, parent_task_id = ?, depth = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(t.sort_order ?? 0, t.parent_task_id ?? null, depth, t.id);
    }
  });

  try {
    transaction();
    return c.json({ success: true, updated: tasks.length });
  } catch (error: any) {
    if (error.message === 'MAX_DEPTH') return c.json({ error: '最大階層を超えています' }, 400);
    return c.json({ error: 'Failed to reorder tasks' }, 500);
  }
});

// === 進捗ログ ===
tasksRoutes.get('/:id/progress-logs', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  return c.json(db.prepare(`
    SELECT pl.*, u.name as user_name
    FROM task_progress_logs pl
    JOIN users u ON pl.user_id = u.id
    WHERE pl.task_id = ?
    ORDER BY pl.created_at DESC
  `).all(id));
});

tasksRoutes.post('/:id/progress-logs', async (c) => {
  const db = getDb();
  const taskId = c.req.param('id');
  const body = await c.req.json();
  const { user_id, progress_percent, note } = body;

  if (!user_id) return c.json({ error: 'user_id is required' }, 400);
  if (progress_percent == null && !note) {
    return c.json({ error: 'either progress_percent or note is required' }, 400);
  }
  if (progress_percent != null && (progress_percent < 0 || progress_percent > 100)) {
    return c.json({ error: 'progress_percent must be 0-100' }, 400);
  }

  const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: Status } | undefined;
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const id = uuidv4();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO task_progress_logs (id, task_id, user_id, progress_percent, note, status_at_log)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, taskId, user_id, progress_percent ?? null, note ?? null, task.status);

    if (progress_percent != null) {
      db.prepare(`UPDATE tasks SET current_progress = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(progress_percent, taskId);
    }
  })();

  // 進捗ログ通知（担当者宛、本人除外）
  const assignees = getTaskAssignees(taskId);
  notifyAssignees({
    taskId, assigneeIds: assignees, excludeUserId: user_id,
    kind: 'progress_update',
    title: progress_percent != null
      ? `進捗 ${progress_percent}% が記録されました`
      : '進捗メモが追加されました',
    body: note ?? undefined,
    actorUserId: user_id,
  });

  return c.json(db.prepare(`
    SELECT pl.*, u.name as user_name
    FROM task_progress_logs pl
    JOIN users u ON pl.user_id = u.id
    WHERE pl.id = ?
  `).get(id), 201);
});

// === 繰り返し ===
tasksRoutes.put('/:id/recurrence', async (c) => {
  const db = getDb();
  const taskId = c.req.param('id');
  const body = await c.req.json();
  const { rule_text, rule_kind, rule_json, next_due, active = true } = body;

  if (!rule_text || !rule_kind || !rule_json) {
    return c.json({ error: 'rule_text, rule_kind, rule_json are required' }, 400);
  }

  const existing = db.prepare(`SELECT id FROM task_recurrences WHERE task_id = ?`)
    .get(taskId) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE task_recurrences
      SET rule_text = ?, rule_kind = ?, rule_json = ?, next_due = ?, active = ?
      WHERE id = ?
    `).run(rule_text, rule_kind, JSON.stringify(rule_json), next_due ?? null, active ? 1 : 0, existing.id);
  } else {
    db.prepare(`
      INSERT INTO task_recurrences (id, task_id, rule_text, rule_kind, rule_json, next_due, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), taskId, rule_text, rule_kind, JSON.stringify(rule_json), next_due ?? null, active ? 1 : 0);
  }

  return c.json(db.prepare(`SELECT * FROM task_recurrences WHERE task_id = ?`).get(taskId));
});

tasksRoutes.delete('/:id/recurrence', (c) => {
  const db = getDb();
  db.prepare(`DELETE FROM task_recurrences WHERE task_id = ?`).run(c.req.param('id'));
  return c.json({ success: true });
});

// === 履歴 ===
tasksRoutes.get('/:id/history', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  return c.json(db.prepare(`
    SELECT th.*, u.name as user_name
    FROM task_history th
    JOIN users u ON th.user_id = u.id
    WHERE th.task_id = ?
    ORDER BY th.created_at DESC
  `).all(id));
});

// === コメント ===
tasksRoutes.get('/:id/comments', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const comments = db.prepare(`
    SELECT tc.*, u.name as user_name
    FROM task_comments tc
    JOIN users u ON tc.user_id = u.id
    WHERE tc.task_id = ?
    ORDER BY tc.created_at ASC
  `).all(id) as any[];

  for (const cm of comments) {
    cm.reactions = db.prepare(`
      SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
      FROM comment_reactions WHERE comment_id = ? GROUP BY emoji
    `).all(cm.id).map((r: any) => ({
      emoji: r.emoji, count: r.count,
      user_ids: r.user_ids ? r.user_ids.split(',') : [],
    }));
  }
  return c.json(comments);
});

tasksRoutes.post('/:id/comments', async (c) => {
  const db = getDb();
  const taskId = c.req.param('id');
  const body = await c.req.json();
  const { user_id, content, is_ai_generated = false } = body;
  if (!user_id || !content) return c.json({ error: 'user_id and content are required' }, 400);

  const id = uuidv4();
  db.prepare(`
    INSERT INTO task_comments (id, task_id, user_id, content, is_ai_generated)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, taskId, user_id, content, is_ai_generated ? 1 : 0);

  db.prepare(`UPDATE tasks SET updated_at = datetime('now') WHERE id = ?`).run(taskId);

  // コメント通知
  const assignees = getTaskAssignees(taskId);
  notifyAssignees({
    taskId, assigneeIds: assignees, excludeUserId: user_id,
    kind: 'comment',
    title: 'コメントが追加されました',
    body: content.length > 100 ? content.slice(0, 100) + '…' : content,
    actorUserId: user_id,
  });

  return c.json(db.prepare(`
    SELECT tc.*, u.name as user_name
    FROM task_comments tc JOIN users u ON tc.user_id = u.id
    WHERE tc.id = ?
  `).get(id), 201);
});

tasksRoutes.post('/comments/:commentId/reactions', async (c) => {
  const db = getDb();
  const commentId = c.req.param('commentId');
  const body = await c.req.json();
  const { user_id, emoji } = body;
  if (!user_id || !emoji) return c.json({ error: 'user_id and emoji are required' }, 400);

  const existing = db.prepare(`
    SELECT id FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?
  `).get(commentId, user_id, emoji) as { id: string } | undefined;

  if (existing) {
    db.prepare('DELETE FROM comment_reactions WHERE id = ?').run(existing.id);
    return c.json({ action: 'removed', emoji });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO comment_reactions (id, comment_id, user_id, emoji) VALUES (?, ?, ?, ?)
  `).run(id, commentId, user_id, emoji);
  return c.json({ action: 'added', emoji, id }, 201);
});
