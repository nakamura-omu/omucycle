import Database from 'better-sqlite3';
import { schema } from './schema.js';
import { seedDemo } from './seed.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/omucycle.db');

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const isReset = process.argv.includes('--reset');

if (isReset && fs.existsSync(dbPath)) {
  console.log('Removing existing database...');
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 移行: 旧 atlas_relations を破棄（汎用 atlas_links に置換）
const oldAtlasRel = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='atlas_relations'").get();
if (oldAtlasRel) {
  console.log('Migrating: dropping old atlas_relations table...');
  db.exec('DROP TABLE atlas_relations');
}

// 旧 sticky 機能（ProjectAtlas に統合）テーブルを削除
for (const t of ['sticky_relations', 'sticky_notes', 'sticky_groups', 'sticky_boards']) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
  if (exists) {
    console.log(`Dropping legacy table: ${t}`);
    db.exec(`DROP TABLE ${t}`);
  }
}

console.log('Applying schema...');
db.exec(schema);

// project_id カラム追加（既存テーブル）
function ensureColumn(table: string, column: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  if (cols.length > 0 && !cols.find(c => c.name === column)) {
    console.log(`Adding ${column} to ${table}...`);
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}
ensureColumn('users', 'omuid', 'TEXT'); // Directory正典IDへのポインタ（OMU365原則1）
ensureColumn('groups', 'is_personal', 'INTEGER DEFAULT 0'); // 個人スペース（隠しコンテナ。UIには出さない）
db.exec(`UPDATE groups SET is_personal = 1 WHERE is_personal = 0
         AND id IN (SELECT DISTINCT group_id FROM projects WHERE is_personal = 1)`);
ensureColumn('atlas_annotations', 'project_id', 'TEXT');
ensureColumn('atlas_links', 'project_id', 'TEXT');
ensureColumn('atlas_layout', 'project_id', 'TEXT');
ensureColumn('tasks', 'is_section', 'INTEGER DEFAULT 0');
ensureColumn('tasks', 'atlas_layout_mode', "TEXT DEFAULT 'free'");
ensureColumn('tasks', 'atlas_columns', 'INTEGER DEFAULT 2');

// atlas_layout に 'section' として登録されている既存タスクを is_section=1 に
const sectionLayoutNodes = db.prepare(`
  SELECT DISTINCT node_id FROM atlas_layout WHERE node_type = 'section'
`).all() as { node_id: string }[];
if (sectionLayoutNodes.length > 0) {
  const upd = db.prepare('UPDATE tasks SET is_section = 1 WHERE id = ? AND is_section = 0');
  for (const n of sectionLayoutNodes) upd.run(n.node_id);
  console.log(`Marked ${sectionLayoutNodes.length} tasks as is_section based on atlas_layout`);
}

console.log('Seeding demo data...');
seedDemo(db);

db.close();
console.log(`Database initialization complete: ${dbPath}`);
