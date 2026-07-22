import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/omucycle.db');

let db: Database.Database | null = null;

// 起動時の軽量マイグレーション（db:init はデモデータを再投入するため本番では使わない）
function migrate(d: Database.Database) {
  const ensureColumn = (table: string, column: string, def: string) => {
    const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.length > 0 && !cols.find((c) => c.name === column)) {
      d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    }
  };
  ensureColumn('tasks', 'due_time', 'TEXT'); // HH:MM（M365カレンダー連携を見据えた時刻。日付は due_date）
  ensureColumn('groups', 'is_personal', 'INTEGER DEFAULT 0'); // 個人スペース（隠しコンテナ。UIに出さない）
  d.exec(`UPDATE groups SET is_personal = 1 WHERE is_personal = 0
          AND id IN (SELECT DISTINCT group_id FROM projects WHERE is_personal = 1)`);
  // Directory連携（P1: 共有メールボックス。設計: document/omu-directory/2026-07-17_group-subscriptions-design.md）
  ensureColumn('groups', 'directory_group_code', 'TEXT');  // Directory groups.group_code（例 gr-joho-all）
  ensureColumn('groups', 'directory_group_name', 'TEXT');  // 表示名ミラー
  ensureColumn('groups', 'directory_synced_at', 'TEXT');
  ensureColumn('group_memberships', 'via', "TEXT DEFAULT 'manual'"); // manual | directory（ミラーは編集不可）
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
