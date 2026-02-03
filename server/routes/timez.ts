import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { extractHashtags } from '../services/hashtag.js';

export const timezRoutes = new Hono();

// 投稿一覧取得
timezRoutes.get('/posts', (c) => {
  const db = getDb();
  const groupId = c.req.query('group_id');
  const jobInstanceId = c.req.query('job_instance_id');
  const hashtag = c.req.query('hashtag');

  let sql = `
    SELECT
      p.*,
      u.name as user_name,
      (SELECT COUNT(*) FROM timez_comments WHERE post_id = p.id) as comment_count
    FROM timez_posts p
    JOIN users u ON p.user_id = u.id
  `;

  const params: any[] = [];

  if (groupId) {
    // グループタイムライン: 同じグループのメンバーの投稿
    sql += `
      WHERE p.user_id IN (
        SELECT user_id FROM group_memberships WHERE group_id = ?
      )
    `;
    params.push(groupId);
  } else if (jobInstanceId) {
    // 業務プロジェクトタイムライン: 同じ業務インスタンスのタスク担当者の投稿
    sql += `
      WHERE p.user_id IN (
        SELECT DISTINCT assignee_id FROM tasks
        WHERE job_instance_id = ? AND assignee_id IS NOT NULL
      )
    `;
    params.push(jobInstanceId);
  } else if (hashtag) {
    // ハッシュタグフィルタ
    sql += `
      JOIN timez_hashtags h ON p.id = h.post_id
      WHERE h.hashtag = ?
    `;
    params.push(hashtag.toLowerCase());
  }

  sql += ` ORDER BY p.created_at DESC LIMIT 100`;

  const posts = db.prepare(sql).all(...params) as any[];

  // hashtagsをJSONからパース
  const parsedPosts = posts.map(p => ({
    ...p,
    hashtags: p.hashtags ? JSON.parse(p.hashtags) : [],
  }));

  return c.json(parsedPosts);
});

// 投稿詳細取得（コメント含む）
timezRoutes.get('/posts/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const post = db.prepare(`
    SELECT
      p.*,
      u.name as user_name
    FROM timez_posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(id) as any;

  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  // コメント取得
  const comments = db.prepare(`
    SELECT
      c.*,
      u.name as user_name
    FROM timez_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(id);

  return c.json({
    ...post,
    hashtags: post.hashtags ? JSON.parse(post.hashtags) : [],
    comments,
  });
});

// 投稿作成
timezRoutes.post('/posts', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { user_id, content } = body;

  if (!user_id || !content) {
    return c.json({ error: 'user_id and content are required' }, 400);
  }

  // ハッシュタグ抽出
  const hashtags = extractHashtags(content);
  const id = uuidv4();

  // トランザクションで投稿とハッシュタグを同時に保存
  const transaction = db.transaction(() => {
    // 投稿を保存
    db.prepare(`
      INSERT INTO timez_posts (id, user_id, content, hashtags)
      VALUES (?, ?, ?, ?)
    `).run(id, user_id, content, JSON.stringify(hashtags));

    // ハッシュタグを保存（トレンド計算用）
    const insertHashtag = db.prepare(`
      INSERT INTO timez_hashtags (id, post_id, hashtag)
      VALUES (?, ?, ?)
    `);
    for (const tag of hashtags) {
      insertHashtag.run(uuidv4(), id, tag);
    }
  });

  try {
    transaction();
  } catch (error) {
    console.error('Failed to create post:', error);
    return c.json({ error: 'Failed to create post' }, 500);
  }

  // 作成した投稿を取得して返す
  const post = db.prepare(`
    SELECT
      p.*,
      u.name as user_name,
      0 as comment_count
    FROM timez_posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(id) as any;

  return c.json({
    ...post,
    hashtags,
  }, 201);
});

// 投稿削除
timezRoutes.delete('/posts/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  // 投稿を削除（CASCADE で関連データも削除）
  const result = db.prepare('DELETE FROM timez_posts WHERE id = ?').run(id);

  if (result.changes === 0) {
    return c.json({ error: 'Post not found' }, 404);
  }

  return c.json({ success: true });
});

// コメント追加
timezRoutes.post('/posts/:postId/comments', async (c) => {
  const db = getDb();
  const postId = c.req.param('postId');
  const body = await c.req.json();
  const { user_id, content } = body;

  if (!user_id || !content) {
    return c.json({ error: 'user_id and content are required' }, 400);
  }

  // 投稿が存在するか確認
  const post = db.prepare('SELECT id FROM timez_posts WHERE id = ?').get(postId);
  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO timez_comments (id, post_id, user_id, content)
    VALUES (?, ?, ?, ?)
  `).run(id, postId, user_id, content);

  const comment = db.prepare(`
    SELECT
      c.*,
      u.name as user_name
    FROM timez_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(id);

  return c.json(comment, 201);
});

// コメント削除
timezRoutes.delete('/posts/:postId/comments/:commentId', (c) => {
  const db = getDb();
  const commentId = c.req.param('commentId');

  const result = db.prepare('DELETE FROM timez_comments WHERE id = ?').run(commentId);

  if (result.changes === 0) {
    return c.json({ error: 'Comment not found' }, 404);
  }

  return c.json({ success: true });
});

// トレンドハッシュタグ取得
timezRoutes.get('/trending', (c) => {
  const db = getDb();
  const period = c.req.query('period') || '24h';

  let dateFilter: string;
  switch (period) {
    case '7d':
      dateFilter = "datetime('now', '-7 days')";
      break;
    case '24h':
    default:
      dateFilter = "datetime('now', '-24 hours')";
      break;
  }

  const trending = db.prepare(`
    SELECT
      hashtag,
      COUNT(*) as count
    FROM timez_hashtags
    WHERE created_at >= ${dateFilter}
    GROUP BY hashtag
    ORDER BY count DESC
    LIMIT 10
  `).all();

  return c.json({
    period,
    trending,
  });
});
