import type { Database as DB } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export function seedDemo(db: DB): void {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@example.com');
  if (existing) {
    console.log('  - demo data already exists, skipping');
    return;
  }

  // ───────── ユーザー ─────────
  const adminId = uuidv4();
  const user1Id = uuidv4();
  const user2Id = uuidv4();
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, name, auth_type) VALUES (?, ?, ?, ?)
  `);
  insertUser.run(adminId, 'admin@example.com', '管理者', 'guest');
  insertUser.run(user1Id, 'user1@example.com', '田中太郎', 'guest');
  insertUser.run(user2Id, 'user2@example.com', '鈴木花子', 'guest');

  // ───────── グループ ─────────
  const grpDxId = uuidv4();
  db.prepare(`
    INSERT INTO groups (id, name, slug, created_by) VALUES (?, ?, ?, ?)
  `).run(grpDxId, 'DX推進課', 'dx-suishin', adminId);

  const insertMembership = db.prepare(`
    INSERT INTO group_memberships (id, group_id, user_id, role) VALUES (?, ?, ?, ?)
  `);
  insertMembership.run(uuidv4(), grpDxId, adminId, 'owner');
  insertMembership.run(uuidv4(), grpDxId, user1Id, 'member');
  insertMembership.run(uuidv4(), grpDxId, user2Id, 'member');

  // ───────── プロジェクト ─────────
  const insertProject = db.prepare(`
    INSERT INTO projects (id, group_id, name, slug, prefix, description, icon, color, is_personal, owner_user_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const projAId = uuidv4();
  insertProject.run(projAId, grpDxId, '入学式準備', 'admission-ceremony', 'ADM',
    '令和7年度入学式の準備プロジェクト', '🎓', '#6366f1', 0, null, adminId);

  const projBId = uuidv4();
  insertProject.run(projBId, grpDxId, 'システム刷新', 'system-renewal', 'SYS',
    '基幹システムの段階的刷新', '⚙️', '#0ea5e9', 0, null, adminId);

  // 個人プロジェクト（My ボード用）
  const myProjAdminId = uuidv4();
  insertProject.run(myProjAdminId, grpDxId, 'My', 'my-admin', null,
    '個人ボード', '📌', '#f59e0b', 1, adminId, adminId);

  // ───────── サイクル ─────────
  const insertCycle = db.prepare(`
    INSERT INTO cycles (id, project_id, cycle_number, name, start_date, end_date, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const cycle1Id = uuidv4();
  insertCycle.run(cycle1Id, projAId, 1, '2026-W19 (5/4-5/10)', '2026-05-04', '2026-05-10', 'active', adminId);
  insertCycle.run(uuidv4(), projAId, 2, '2026-W20 (5/11-5/17)', '2026-05-11', '2026-05-17', 'upcoming', adminId);

  // ───────── タスク ─────────
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, project_id, cycle_id, group_id, parent_task_id, task_number, depth, title, description,
                       start_date, due_date, status, priority, assignee_id, assignee_ids, current_progress, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateProjCounter = db.prepare(`UPDATE projects SET next_task_number = ? WHERE id = ?`);

  // ADM プロジェクト
  const t1Id = uuidv4();
  insertTask.run(t1Id, projAId, cycle1Id, grpDxId, null, 1, 0,
    '式次第の作成', '令和6年度をベースに変更点を反映する',
    '2026-05-04', '2026-05-15', 'in_progress', 'urgent',
    adminId, JSON.stringify([adminId, user1Id]), 30, adminId);

  insertTask.run(uuidv4(), projAId, cycle1Id, grpDxId, t1Id, 2, 1,
    '来賓挨拶順の確認', null,
    null, '2026-05-12', 'not_started', 'important',
    user1Id, JSON.stringify([user1Id]), 0, adminId);

  insertTask.run(uuidv4(), projAId, null, grpDxId, null, 3, 0,
    '会場レイアウト確定', '実行委員と共有',
    null, '2026-05-20', 'not_started', 'normal',
    user2Id, JSON.stringify([user2Id]), 0, adminId);
  updateProjCounter.run(3, projAId);

  // SYS プロジェクト
  const sysT1 = uuidv4();
  insertTask.run(sysT1, projBId, null, grpDxId, null, 1, 0,
    '要件ヒアリング', null,
    null, '2026-05-30', 'in_progress', 'normal',
    adminId, JSON.stringify([adminId]), 50, adminId);
  updateProjCounter.run(1, projBId);

  // 進捗ログのサンプル
  const insertLog = db.prepare(`
    INSERT INTO task_progress_logs (id, task_id, user_id, progress_percent, note, status_at_log)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertLog.run(uuidv4(), t1Id, adminId, 30, 'ベース文書を取得、構成検討中', 'in_progress');
  insertLog.run(uuidv4(), sysT1, adminId, 50, 'A課のヒアリング完了、B課が来週', 'in_progress');

  // Wiki ページ（グループ単位）
  const insertWiki = db.prepare(`
    INSERT INTO wiki_pages (id, group_id, parent_page_id, title, slug, content, icon, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const wikiTopId = uuidv4();
  insertWiki.run(wikiTopId, grpDxId, null, 'DX推進課 ホーム', 'home',
    '# ようこそ\n\nDX推進課のWikiトップページです。', '🏠', 0, adminId, adminId);
  insertWiki.run(uuidv4(), grpDxId, wikiTopId, '業務フロー', 'workflows',
    '## 主な業務\n\n- 入学式準備\n- システム刷新\n', '📋', 1, adminId, adminId);

  console.log('  - users, groups, projects, cycles, tasks, wiki seeded');
}
