// ローカル時刻基準の YYYY-MM-DD。
// toISOString()はUTCに変換されるため、JSTでは朝9時まで「今日」が前日になる罠がある。
// 「今日」判定は必ずこちらを使うこと
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
