// OMU-Directory クライアント（box/notifyと同流儀・5分キャッシュ）。
// 人・所属の正典はDirectory（OMU365原則1）。Cycleは氏名をキャッシュ表示するだけで、
// 正典との同期はログイン時リフレッシュ（server/index.ts）に任せる。
// DIRECTORY_API_KEY 未設定時は全関数が空振り（開発環境でも壊れない）。

const BASE = process.env.DIRECTORY_BASE_URL || 'http://127.0.0.1:3230';
const API_KEY = process.env.DIRECTORY_API_KEY || '';
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: any }>();

async function get(path: string): Promise<any> {
  if (!API_KEY) throw new Error('DIRECTORY_API_KEY not set');
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': API_KEY } });
    if (!res.ok) throw new Error(`directory ${path} -> ${res.status}`);
    const value = await res.json();
    cache.set(path, { at: Date.now(), value });
    return value;
  } catch (err) {
    if (hit) return hit.value;
    throw err;
  }
}

export interface DirectoryUser {
  omuid: string;
  display_name: string | null;
  mail: string | null;
  department: string | null;
  category?: string | null;
}

/** 名簿検索（メンバー候補用） */
export async function searchUsers(q: string, limit = 20): Promise<DirectoryUser[]> {
  try {
    const data = await get(`/users?q=${encodeURIComponent(q)}&limit=${limit}`);
    return data.users ?? [];
  } catch {
    return [];
  }
}

export async function getUser(omuid: string): Promise<DirectoryUser | null> {
  try {
    return await get(`/users/${encodeURIComponent(omuid)}`);
  } catch {
    return null;
  }
}

/** 正典の表示名（取れなければnull。呼び出し側はローカルキャッシュ名で続行する） */
export async function displayName(omuid: string): Promise<string | null> {
  return (await getUser(omuid))?.display_name ?? null;
}

export function isConfigured(): boolean {
  return !!API_KEY;
}

// ══ グループ連携（P1: 共有メールボックス） ══

export interface DirectoryGroup {
  group_code: string;
  mail: string | null;
  display_name: string | null;
  member_count?: number;
}

export interface DirectoryGroupMember {
  omuid: string;
  display_name: string | null;
  mail: string | null;
  department: string | null;
  title?: string | null;
}

/** 共有メールボックス検索（グループ連携先の候補） */
export async function searchGroups(q: string, limit = 20): Promise<DirectoryGroup[]> {
  try {
    const data = await get(`/groups?q=${encodeURIComponent(q)}&limit=${limit}`);
    return data.groups ?? [];
  } catch {
    return [];
  }
}

export async function getGroup(code: string): Promise<DirectoryGroup | null> {
  try {
    return await get(`/groups/${encodeURIComponent(code)}`);
  } catch {
    return null;
  }
}

/** 共有メールボックスの実メンバー（Directoryが日次同期済みのキャッシュ）。失敗はthrow（呼び出し側で判断） */
export async function getGroupMembers(code: string): Promise<DirectoryGroupMember[]> {
  const data = await get(`/groups/${encodeURIComponent(code)}/members`);
  return data.members ?? [];
}
