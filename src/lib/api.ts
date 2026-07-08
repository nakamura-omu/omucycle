const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, init)
}
