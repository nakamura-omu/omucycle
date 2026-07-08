import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '../db/connection.js'
import { v4 as uuidv4 } from 'uuid'

export const aiRoutes = new Hono()

const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `あなたは OmuCycle というタスク・プロジェクト管理システムの中で動く AI アシスタントです。

# ユーザーを助ける形
- ユーザーの自然言語の依頼を理解し、必要に応じてツールを使ってデータを読み書きします
- 「タスクを作る」「タスクを完了にする」「議事録からタスク化」「進捗の整理」「やるべきことの提案」など何でも引き受けます
- 議事録を貼られたら → 行動項目を抜き出し、適切なプロジェクト/セクション/期限/優先度を推定してタスクを作る
- 質問されたら → ツールでデータを取得して具体的な数字や名前を出して回答
- 不確かな点はユーザーに簡潔に確認する

# システム構造（重要）
- Group（ワークスペース）の中に Project（カテゴリ）がある
- Task は project_id 必須。parent_task_id で階層。is_section=true でセクション扱い
- ステータスは 'not_started'（やること）か 'completed'（完了）の2値だけ
- 優先度は 'urgent' / 'important' / 'normal' / 'none'
- 個人プロジェクトは is_personal=1（インボックス相当）

# 出力ガイド
- 短く、要点を最初に。だらだら説明しない
- 何個もタスクを作ったときは、最後に「○個追加しました」と要約
- 同じことを2回確認しない
- 失敗したら原因を一言で説明

# ツール使用上の注意
- create_task の前に、適切な project_id がわからなければ list_projects で確認する
- ユーザーが「俺のインボックスに」と言ったら、現在のユーザーの個人プロジェクト（is_personal=1, owner_user_id=自分）を使う
- 大量にタスクを作る前に、件数と先頭2-3個を提示してユーザー確認を取る`

// === ツール定義 ===
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_groups',
    description: '現在のユーザーが所属するグループ一覧を取得',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_projects',
    description: 'プロジェクト一覧。group_id を指定すれば限定。include_personal=true で個人プロジェクト（インボックス）も含める',
    input_schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: 'グループID（オプション）' },
        include_personal: { type: 'boolean', description: '個人プロジェクトを含むか' },
      },
    },
  },
  {
    name: 'list_sections',
    description: '指定プロジェクトのセクション一覧（is_section=1 のタスク）',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'list_tasks',
    description: 'タスク一覧。フィルタ可能。assigned_to_me=true で現在のユーザーが担当のタスクだけ',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        group_id: { type: 'string' },
        cycle_id: { type: 'string' },
        assigned_to_me: { type: 'boolean' },
        only_incomplete: { type: 'boolean', description: 'true なら未完了のみ' },
        due_before: { type: 'string', description: 'YYYY-MM-DD 以前が期限' },
        due_after: { type: 'string' },
        text_search: { type: 'string', description: 'タイトルに含まれる文字列' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_task',
    description: 'タスクの詳細（コメント・子タスク含む）',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
  {
    name: 'create_task',
    description: '新規タスク作成。is_section=true でセクション。parent_task_id で子タスク',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        start_date: { type: 'string' },
        priority: { type: 'string', enum: ['urgent', 'important', 'normal', 'none'] },
        parent_task_id: { type: 'string' },
        is_section: { type: 'boolean' },
        labels: { type: 'array', items: { type: 'string' } },
        assign_to_me: { type: 'boolean', description: '現在のユーザーをアサイン' },
      },
      required: ['project_id', 'title'],
    },
  },
  {
    name: 'update_task',
    description: 'タスクの属性を更新',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        due_date: { type: 'string' },
        start_date: { type: 'string' },
        priority: { type: 'string', enum: ['urgent', 'important', 'normal', 'none'] },
        parent_task_id: { type: 'string', description: 'null 文字列で外す' },
        labels: { type: 'array', items: { type: 'string' } },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'set_task_status',
    description: 'タスクの完了/未完了を切り替え',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['not_started', 'completed'] },
      },
      required: ['task_id', 'status'],
    },
  },
  {
    name: 'add_comment',
    description: 'タスクにコメント追加',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['task_id', 'content'],
    },
  },
  {
    name: 'today',
    description: '今日の日付（YYYY-MM-DD）',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'current_user_inbox_project',
    description: '現在のユーザーの個人プロジェクト（インボックス）の project_id を取得',
    input_schema: { type: 'object', properties: {} },
  },
]

// === ツール実行 ===
async function executeTool(name: string, input: any, userId: string): Promise<any> {
  const db = getDb()

  switch (name) {
    case 'today':
      return { date: new Date().toISOString().slice(0, 10) }

    case 'list_groups': {
      const rows = db.prepare(`
        SELECT g.id, g.name, g.slug FROM groups g
        JOIN group_memberships m ON m.group_id = g.id
        WHERE m.user_id = ?
        ORDER BY g.created_at
      `).all(userId)
      return { groups: rows }
    }

    case 'list_projects': {
      const conds: string[] = []
      const params: any[] = []
      if (input.group_id) { conds.push('group_id = ?'); params.push(input.group_id) }
      if (!input.include_personal) conds.push('is_personal = 0')
      conds.push('archived = 0')
      const where = conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : ''
      const rows = db.prepare(`
        SELECT p.id, p.name, p.slug, p.icon, p.is_personal, p.group_id, g.name as group_name
        FROM projects p
        JOIN groups g ON p.group_id = g.id
        ${where}
        ORDER BY p.sort_order, p.created_at
      `).all(...params)
      return { projects: rows }
    }

    case 'list_sections': {
      const rows = db.prepare(`
        SELECT id, title, sort_order FROM tasks
        WHERE project_id = ? AND is_section = 1
        ORDER BY sort_order, created_at
      `).all(input.project_id)
      return { sections: rows }
    }

    case 'list_tasks': {
      const conds: string[] = []
      const params: any[] = []
      if (input.project_id) { conds.push('t.project_id = ?'); params.push(input.project_id) }
      if (input.group_id) { conds.push('t.group_id = ?'); params.push(input.group_id) }
      if (input.cycle_id) { conds.push('t.cycle_id = ?'); params.push(input.cycle_id) }
      if (input.assigned_to_me) {
        conds.push('(t.assignee_id = ? OR t.assignee_ids LIKE ?)')
        params.push(userId, `%"${userId}"%`)
      }
      if (input.only_incomplete) conds.push("t.status != 'completed'")
      if (input.due_before) { conds.push('t.due_date <= ?'); params.push(input.due_before) }
      if (input.due_after) { conds.push('t.due_date >= ?'); params.push(input.due_after) }
      if (input.text_search) { conds.push('t.title LIKE ?'); params.push(`%${input.text_search}%`) }
      conds.push('t.is_section = 0')
      const where = conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : ''
      const limit = Math.min(input.limit ?? 50, 200)
      const rows = db.prepare(`
        SELECT t.id, t.title, t.status, t.priority, t.due_date, t.start_date,
               t.task_number, t.parent_task_id,
               t.project_id, p.name as project_name,
               u.name as assignee_name
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        LEFT JOIN users u ON t.assignee_id = u.id
        ${where}
        ORDER BY t.due_date IS NULL, t.due_date, t.priority
        LIMIT ?
      `).all(...params, limit)
      return { tasks: rows, count: rows.length }
    }

    case 'get_task': {
      const t = db.prepare(`
        SELECT t.*, p.name as project_name, u.name as assignee_name
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        LEFT JOIN users u ON t.assignee_id = u.id
        WHERE t.id = ?
      `).get(input.task_id) as any
      if (!t) return { error: 'Task not found' }
      const children = db.prepare(`SELECT id, title, status FROM tasks WHERE parent_task_id = ?`).all(input.task_id)
      const comments = db.prepare(`
        SELECT c.content, c.created_at, u.name as user_name
        FROM task_comments c JOIN users u ON c.user_id = u.id
        WHERE c.task_id = ? ORDER BY c.created_at
      `).all(input.task_id)
      return { ...t, children, comments }
    }

    case 'create_task': {
      const project = db.prepare(`SELECT group_id, next_task_number FROM projects WHERE id = ?`)
        .get(input.project_id) as any
      if (!project) return { error: 'Project not found' }
      const taskNumber = (project.next_task_number ?? 0) + 1
      const id = uuidv4()
      let depth = 0
      if (input.parent_task_id) {
        const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(input.parent_task_id) as any
        if (parent) depth = parent.depth + 1
      }
      db.transaction(() => {
        db.prepare(`
          INSERT INTO tasks (id, project_id, group_id, parent_task_id, task_number, depth, is_section,
                             title, description, start_date, due_date, status, priority,
                             assignee_id, assignee_ids, labels, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?, ?)
        `).run(
          id, input.project_id, project.group_id,
          input.parent_task_id ?? null, taskNumber, depth,
          input.is_section ? 1 : 0,
          input.title, input.description ?? null,
          input.start_date ?? null, input.due_date ?? null,
          input.priority ?? 'normal',
          input.assign_to_me ? userId : null,
          input.assign_to_me ? JSON.stringify([userId]) : null,
          input.labels ? JSON.stringify(input.labels) : null,
          userId,
        )
        db.prepare(`UPDATE projects SET next_task_number = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(taskNumber, input.project_id)
      })()
      return { id, task_number: taskNumber, title: input.title }
    }

    case 'update_task': {
      const allowed = ['title', 'description', 'due_date', 'start_date', 'priority', 'parent_task_id']
      const updates: string[] = []
      const params: any[] = []
      for (const k of allowed) {
        if (input[k] !== undefined) {
          updates.push(`${k} = ?`)
          params.push(input[k] === 'null' ? null : input[k])
        }
      }
      if (input.labels !== undefined) {
        updates.push('labels = ?')
        params.push(JSON.stringify(input.labels))
      }
      if (updates.length === 0) return { error: 'No updates' }
      updates.push("updated_at = datetime('now')")
      params.push(input.task_id)
      db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params)
      return { ok: true }
    }

    case 'set_task_status': {
      const completedClause = input.status === 'completed' ? `, completed_at = datetime('now')` : `, completed_at = NULL`
      db.prepare(`UPDATE tasks SET status = ? ${completedClause}, updated_at = datetime('now') WHERE id = ?`)
        .run(input.status, input.task_id)
      return { ok: true }
    }

    case 'add_comment': {
      const id = uuidv4()
      db.prepare(`INSERT INTO task_comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)`)
        .run(id, input.task_id, userId, input.content)
      return { id }
    }

    case 'current_user_inbox_project': {
      const ensure = (globalThis as any).__ensurePersonalSpace as ((id: string, name: string) => any) | undefined
      if (!ensure) return { error: 'unavailable' }
      const u = db.prepare(`SELECT name FROM users WHERE id = ?`).get(userId) as { name: string } | undefined
      const ids = ensure(userId, u?.name || 'user')
      return { project_id: ids.projectId, group_id: ids.groupId }
    }
  }
  return { error: 'Unknown tool: ' + name }
}

// === メインエンドポイント ===
aiRoutes.post('/chat', async (c) => {
  const user = c.get('currentUser') as { id: string; name: string } | undefined
  if (!user) return c.json({ error: 'Not authenticated' }, 401)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return c.json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  const body = await c.req.json()
  const messages: Anthropic.MessageParam[] = body.messages || []
  const ctx = body.context || {}  // 現在の画面情報など

  const client = new Anthropic({ apiKey })

  return stream(c, async (s) => {
    s.onAbort(() => { /* client closed */ })

    // システムプロンプトに現在のコンテキストを足す
    const sys: Anthropic.TextBlockParam[] = [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ]
    sys.push({
      type: 'text',
      text: `# 現在のユーザー\n名前: ${user.name}\nID: ${user.id}\n\n# 現在の画面コンテキスト\n${JSON.stringify(ctx, null, 2)}\n\n# 今日: ${new Date().toISOString().slice(0, 10)}`,
    })

    const writeEvent = async (event: string, data: any) => {
      await s.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    let conversation = [...messages]
    let safety = 0
    while (safety++ < 10) {
      let assistantBlocks: Anthropic.ContentBlock[] = []
      try {
        const streamResp = await client.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          system: sys,
          tools: TOOLS,
          messages: conversation,
        })

        for await (const evt of streamResp) {
          if (evt.type === 'content_block_start') {
            if (evt.content_block.type === 'text') {
              await writeEvent('text_start', { index: evt.index })
            } else if (evt.content_block.type === 'tool_use') {
              await writeEvent('tool_start', { index: evt.index, id: evt.content_block.id, name: evt.content_block.name })
            }
          } else if (evt.type === 'content_block_delta') {
            if (evt.delta.type === 'text_delta') {
              await writeEvent('text_delta', { index: evt.index, text: evt.delta.text })
            } else if (evt.delta.type === 'input_json_delta') {
              await writeEvent('tool_input_delta', { index: evt.index, partial_json: evt.delta.partial_json })
            }
          }
        }
        const finalMsg = await streamResp.finalMessage()
        assistantBlocks = finalMsg.content as Anthropic.ContentBlock[]
        conversation.push({ role: 'assistant', content: assistantBlocks })

        if (finalMsg.stop_reason !== 'tool_use') {
          await writeEvent('done', { stop_reason: finalMsg.stop_reason })
          break
        }
      } catch (e: any) {
        await writeEvent('error', { message: String(e?.message || e) })
        break
      }

      // ツール実行
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const blk of assistantBlocks) {
        if (blk.type !== 'tool_use') continue
        await writeEvent('tool_run', { id: blk.id, name: blk.name, input: blk.input })
        try {
          const result = await executeTool(blk.name, blk.input, user.id)
          await writeEvent('tool_result', { id: blk.id, name: blk.name, result })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: blk.id,
            content: JSON.stringify(result).slice(0, 8000),  // 過大入力防止
          })
        } catch (e: any) {
          const errMsg = String(e?.message || e)
          await writeEvent('tool_result', { id: blk.id, name: blk.name, result: { error: errMsg } })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: blk.id,
            content: JSON.stringify({ error: errMsg }),
            is_error: true,
          })
        }
      }
      conversation.push({ role: 'user', content: toolResults })
      // ループへ（次の応答へ）
    }
  }, async (err, s) => {
    await s.write(`event: error\ndata: ${JSON.stringify({ message: String(err.message) })}\n\n`)
  })
})
