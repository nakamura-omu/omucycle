import { ref, type Ref } from 'vue'

export interface ZoomPanState {
  scale: Ref<number>
  panX: Ref<number>
  panY: Ref<number>
  isPanning: Ref<boolean>
  setupHandlers: (containerEl: HTMLElement | null) => void
  cleanup: () => void
  reset: () => void
  zoomBy: (factor: number, pivotX?: number, pivotY?: number) => void
  /** スクリーン座標 → ワールド座標（コンテンツ内座標） */
  toWorld: (screenX: number, screenY: number, containerRect: DOMRect) => { x: number; y: number }
  /** 指定矩形が画面に収まるよう scale/pan を設定 */
  fitTo: (bbox: { x: number; y: number; w: number; h: number }, padding?: number) => void
}

export function useZoomPan(opts?: { minScale?: number; maxScale?: number }): ZoomPanState {
  const minScale = opts?.minScale ?? 0.1
  const maxScale = opts?.maxScale ?? 5

  const scale = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const isPanning = ref(false)
  const isSpaceDown = ref(false)

  let container: HTMLElement | null = null
  let panStart: { x: number; y: number; panX: number; panY: number } | null = null

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v))
  }

  function zoomBy(factor: number, pivotX = 0, pivotY = 0) {
    const oldScale = scale.value
    const newScale = clamp(oldScale * factor, minScale, maxScale)
    if (newScale === oldScale) return
    // ピボット位置を保つように pan を調整
    // world = (screen - pan) / scale
    // 新しい pan = screen - world * newScale
    const worldX = (pivotX - panX.value) / oldScale
    const worldY = (pivotY - panY.value) / oldScale
    panX.value = pivotX - worldX * newScale
    panY.value = pivotY - worldY * newScale
    scale.value = newScale
  }

  function reset() {
    scale.value = 1
    panX.value = 0
    panY.value = 0
  }

  function fitTo(bbox: { x: number; y: number; w: number; h: number }, padding = 40) {
    if (!container) return
    if (bbox.w <= 0 || bbox.h <= 0) return
    const rect = container.getBoundingClientRect()
    const availW = Math.max(100, rect.width - padding * 2)
    const availH = Math.max(100, rect.height - padding * 2)
    const sx = availW / bbox.w
    const sy = availH / bbox.h
    const s = clamp(Math.min(sx, sy), minScale, Math.min(maxScale, 1.5))  // 拡大しすぎないよう 1.5 倍上限
    scale.value = s
    // 中央寄せ
    panX.value = (rect.width - bbox.w * s) / 2 - bbox.x * s
    panY.value = (rect.height - bbox.h * s) / 2 - bbox.y * s
  }

  function toWorld(screenX: number, screenY: number, rect: DOMRect) {
    return {
      x: (screenX - rect.left - panX.value) / scale.value,
      y: (screenY - rect.top - panY.value) / scale.value,
    }
  }

  function onWheel(e: WheelEvent) {
    if (!container) return
    // Cmd/Ctrl + wheel または ピンチ → ズーム
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      zoomBy(factor, px, py)
    } else {
      // 通常ホイール → パン
      e.preventDefault()
      panX.value -= e.deltaX
      panY.value -= e.deltaY
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' && !e.repeat) {
      isSpaceDown.value = true
      if (container) container.style.cursor = 'grab'
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      isSpaceDown.value = false
      if (container) container.style.cursor = ''
    }
  }

  function onMouseDown(e: MouseEvent) {
    if (!container) return
    // 中ボタン or スペース押下中 → パン
    if (e.button === 1 || (e.button === 0 && isSpaceDown.value)) {
      e.preventDefault()
      isPanning.value = true
      panStart = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
      container.style.cursor = 'grabbing'
      document.addEventListener('mousemove', onPanMove)
      document.addEventListener('mouseup', onPanEnd)
    }
  }
  function onPanMove(e: MouseEvent) {
    if (!panStart) return
    panX.value = panStart.panX + (e.clientX - panStart.x)
    panY.value = panStart.panY + (e.clientY - panStart.y)
  }
  function onPanEnd() {
    isPanning.value = false
    panStart = null
    if (container) container.style.cursor = isSpaceDown.value ? 'grab' : ''
    document.removeEventListener('mousemove', onPanMove)
    document.removeEventListener('mouseup', onPanEnd)
  }

  function setupHandlers(el: HTMLElement | null) {
    container = el
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  }

  function cleanup() {
    if (container) {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('mousedown', onMouseDown)
    }
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }

  return {
    scale, panX, panY, isPanning,
    setupHandlers, cleanup, reset, zoomBy, toWorld, fitTo,
  }
}
