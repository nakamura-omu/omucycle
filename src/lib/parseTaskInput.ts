// Todoist 風の自然言語からタスク属性を抽出する軽量パーサ

export interface ParsedTask {
  title: string
  due_date?: string         // YYYY-MM-DD
  priority?: 'urgent' | 'important' | 'normal' | 'none'
  projectHint?: string      // # 後の文字列
  labels?: string[]         // @label 後の文字列
}

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const WEEKDAY_MAP: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
}

export function parseTaskInput(input: string): ParsedTask {
  let title = input.trim()
  const r: ParsedTask = { title }

  // 期日: 今日 / 明日 / 明後日
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const replacements: { pattern: RegExp; date: () => Date }[] = [
    { pattern: /(今日|きょう)/, date: () => new Date(today) },
    { pattern: /(明日|あした|あす)/, date: () => { const d = new Date(today); d.setDate(d.getDate() + 1); return d } },
    { pattern: /(明後日|あさって)/, date: () => { const d = new Date(today); d.setDate(d.getDate() + 2); return d } },
    { pattern: /(来週)/, date: () => { const d = new Date(today); d.setDate(d.getDate() + 7); return d } },
    { pattern: /(来月)/, date: () => { const d = new Date(today); d.setMonth(d.getMonth() + 1); return d } },
  ]
  for (const r0 of replacements) {
    const m = title.match(r0.pattern)
    if (m) {
      r.due_date = fmt(r0.date())
      title = title.replace(m[0], '').trim()
      break
    }
  }

  // N日後 / N週後 / Nか月後
  if (!r.due_date) {
    const m = title.match(/(\d+)\s*(日|週|か月|ヶ月)後/)
    if (m) {
      const n = parseInt(m[1]!, 10)
      const d = new Date(today)
      if (m[2] === '日') d.setDate(d.getDate() + n)
      else if (m[2] === '週') d.setDate(d.getDate() + n * 7)
      else d.setMonth(d.getMonth() + n)
      r.due_date = fmt(d)
      title = title.replace(m[0], '').trim()
    }
  }

  // ○曜日
  if (!r.due_date) {
    const m = title.match(/(今週|来週)?\s*([日月火水木金土])曜日?/)
    if (m) {
      const target = WEEKDAY_MAP[m[2]!]!
      const d = new Date(today)
      const cur = d.getDay()
      let diff = target - cur
      if (m[1] === '来週') {
        diff = diff <= 0 ? diff + 14 : diff + 7
      } else {
        if (diff <= 0) diff += 7
      }
      d.setDate(d.getDate() + diff)
      r.due_date = fmt(d)
      title = title.replace(m[0], '').trim()
    }
  }

  // MM/DD or MM月DD日
  if (!r.due_date) {
    const m = title.match(/(\d{1,2})[\/月](\d{1,2})日?/)
    if (m) {
      const month = parseInt(m[1]!, 10)
      const day = parseInt(m[2]!, 10)
      const d = new Date(today)
      d.setMonth(month - 1); d.setDate(day)
      if (d < today) d.setFullYear(d.getFullYear() + 1)
      r.due_date = fmt(d)
      title = title.replace(m[0], '').trim()
    }
  }

  // 優先度: !1〜!4 / p1〜p4
  const pm = title.match(/(?:^|\s)([!p])([1-4])(?:\s|$)/i)
  if (pm) {
    const p = parseInt(pm[2]!, 10)
    r.priority = (['urgent', 'important', 'normal', 'none'] as const)[p - 1]!
    title = title.replace(pm[0], ' ').trim()
  }

  // プロジェクト: #名前
  const projm = title.match(/#(\S+)/)
  if (projm) {
    r.projectHint = projm[1]
    title = title.replace(projm[0], '').trim()
  }

  // ラベル: @名前 (複数可)
  const labels: string[] = []
  let labelMatch: RegExpExecArray | null
  const labelRe = /@(\S+)/g
  while ((labelMatch = labelRe.exec(title)) !== null) {
    labels.push(labelMatch[1]!)
  }
  if (labels.length > 0) {
    r.labels = labels
    title = title.replace(/@\S+/g, '').trim()
  }

  // 連続スペースを単一に
  title = title.replace(/\s+/g, ' ').trim()
  r.title = title
  return r
}
