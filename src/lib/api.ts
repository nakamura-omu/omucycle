const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

// SSOセッション切れはnginxがログイン画面へのリダイレクトで返すため、
// APIのつもりのfetchがHTMLを掴んだら失効とみなし共通シェルのバナーに委ねる
function checkSession(res: Response): Response {
  const expired =
    res.status === 401 ||
    (res.redirected && /login|auth|signin/i.test(res.url)) ||
    (res.ok && (res.headers.get('content-type') ?? '').includes('text/html'))
  if (expired) (window as any).OmuShell?.sessionExpired()
  return res
}

export function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, init).then(checkSession)
}
