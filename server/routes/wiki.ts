import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const wikiRoutes = new Hono();

// グループのWikiページツリー
wikiRoutes.get('/groups/:groupId/pages', (c) => {
  const db = getDb();
  return c.json(db.prepare(`
    SELECT id, group_id, parent_page_id, title, slug, icon, sort_order, archived, updated_at
    FROM wiki_pages
    WHERE group_id = ? AND archived = 0
    ORDER BY parent_page_id, sort_order, title
  `).all(c.req.param('groupId')));
});

wikiRoutes.get('/groups/:groupId/pages/by-slug/:slug', (c) => {
  const db = getDb();
  const page = db.prepare(`
    SELECT wp.*, u.name as updated_by_name
    FROM wiki_pages wp
    LEFT JOIN users u ON wp.updated_by = u.id
    WHERE wp.group_id = ? AND wp.slug = ?
  `).get(c.req.param('groupId'), c.req.param('slug'));
  if (!page) return c.json({ error: 'Page not found' }, 404);
  return c.json(page);
});

wikiRoutes.get('/pages/:id', (c) => {
  const db = getDb();
  const page = db.prepare(`
    SELECT wp.*, u.name as updated_by_name
    FROM wiki_pages wp
    LEFT JOIN users u ON wp.updated_by = u.id
    WHERE wp.id = ?
  `).get(c.req.param('id'));
  if (!page) return c.json({ error: 'Page not found' }, 404);
  return c.json(page);
});

wikiRoutes.post('/pages', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { group_id, parent_page_id, title, slug, content, icon, created_by } = body;
  if (!group_id || !title || !slug || !created_by) {
    return c.json({ error: 'group_id, title, slug, created_by are required' }, 400);
  }
  const id = uuidv4();
  try {
    db.prepare(`
      INSERT INTO wiki_pages (id, group_id, parent_page_id, title, slug, content, icon, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, group_id, parent_page_id ?? null, title, slug,
           content ?? '', icon ?? null, created_by, created_by);
    return c.json(db.prepare('SELECT * FROM wiki_pages WHERE id = ?').get(id), 201);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'slug already exists in this group' }, 409);
    }
    throw error;
  }
});

wikiRoutes.put('/pages/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { title, slug, content, icon, parent_page_id, sort_order, archived, updated_by } = body;

  const updates: string[] = [];
  const params: any[] = [];
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (slug !== undefined) { updates.push('slug = ?'); params.push(slug); }
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  if (icon !== undefined) { updates.push('icon = ?'); params.push(icon); }
  if (parent_page_id !== undefined) { updates.push('parent_page_id = ?'); params.push(parent_page_id); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
  if (archived !== undefined) { updates.push('archived = ?'); params.push(archived ? 1 : 0); }
  if (updated_by) { updates.push('updated_by = ?'); params.push(updated_by); }
  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  updates.push("updated_at = datetime('now')");
  params.push(id);

  try {
    const result = db.prepare(`UPDATE wiki_pages SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    if (result.changes === 0) return c.json({ error: 'Page not found' }, 404);
    return c.json(db.prepare('SELECT * FROM wiki_pages WHERE id = ?').get(id));
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'slug already exists' }, 409);
    }
    throw error;
  }
});

wikiRoutes.delete('/pages/:id', (c) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM wiki_pages WHERE id = ?').run(c.req.param('id'));
  if (result.changes === 0) return c.json({ error: 'Page not found' }, 404);
  return c.json({ success: true });
});
