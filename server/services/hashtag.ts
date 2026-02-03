/**
 * ハッシュタグ抽出ユーティリティ
 * Twitter風のハッシュタグを投稿内容から抽出する
 */

/**
 * 投稿内容からハッシュタグを抽出
 * 半角・全角#に対応、日本語ハッシュタグもサポート
 * @param content - 投稿内容
 * @returns ハッシュタグの配列（#なし、小文字化）
 */
export function extractHashtags(content: string): string[] {
  // ハッシュタグパターン:
  // - # または ＃ で始まる
  // - 最初の文字は英字、アンダースコア、または日本語文字
  // - 以降は英数字、アンダースコア、または日本語文字
  const pattern = /[#＃]([a-zA-Z_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF][a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]*)/g;

  const hashtags = new Set<string>();

  for (const match of content.matchAll(pattern)) {
    // 小文字化（日本語はそのまま）
    const tag = match[1].toLowerCase();
    hashtags.add(tag);
  }

  return Array.from(hashtags);
}

/**
 * 投稿内容のハッシュタグをリンク可能な形式に変換
 * @param content - 投稿内容
 * @returns ハッシュタグがマークアップされた内容
 */
export function highlightHashtags(content: string): string {
  const pattern = /[#＃]([a-zA-Z_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF][a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]*)/g;

  return content.replace(pattern, (match, tag) => {
    return `<hashtag>#${tag}</hashtag>`;
  });
}
