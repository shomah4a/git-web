/**
 * SVG のパン・ズーム制御 composable (ADR 0047)。
 *
 * d3-zoom を使わず自前で実装する。
 * - 背景ドラッグでパン
 * - ホイールでズーム (ポインタ位置を中心にスケール)
 * - transform 状態を ref で保持し、Vue テンプレートで <g> の transform に適用
 */

import type { Ref } from 'vue'
import { ref } from 'vue'

export type ViewportTransform = {
  readonly x: number
  readonly y: number
  readonly k: number
}

export type GraphViewport = {
  /** 現在の transform (x, y, k) */
  readonly transform: Ref<ViewportTransform>
  /** ホイールイベントハンドラ (テンプレートから呼ぶ) */
  readonly onWheel: (event: WheelEvent) => void
  /** ポインタダウンハンドラ (テンプレートから呼ぶ) */
  readonly onPointerDown: (event: PointerEvent) => void
  /** 初期 transform を設定する。onMounted で呼ぶ。 */
  readonly initTransform: (svgElement: SVGSVGElement) => void
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
const ZOOM_SENSITIVITY = 0.002

export function useGraphViewport(): GraphViewport {
  const transform = ref<ViewportTransform>({ x: 0, y: 0, k: 1 })

  function initTransform(svgElement: SVGSVGElement): void {
    const rect = svgElement.getBoundingClientRect()
    transform.value = { x: rect.width / 2, y: 60, k: 1 }
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault()

    const t = transform.value
    // deltaY > 0 → ズームアウト, deltaY < 0 → ズームイン
    const factor = 1 - event.deltaY * ZOOM_SENSITIVITY
    const newK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k * factor))

    // ポインタ位置を中心にスケール
    const svgEl = event.currentTarget
    if (!(svgEl instanceof SVGSVGElement)) return
    const rect = svgEl.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top

    // ポインタ位置のグラフ座標を維持する変換
    const newX = pointerX - (pointerX - t.x) * (newK / t.k)
    const newY = pointerY - (pointerY - t.y) * (newK / t.k)

    transform.value = { x: newX, y: newY, k: newK }
  }

  function onPointerDown(event: PointerEvent): void {
    // ノードのクリックは stopPropagation されるので、ここに来るのは背景クリックのみ
    const startX = event.clientX
    const startY = event.clientY
    const startTransform = transform.value

    function onMove(e: PointerEvent): void {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      transform.value = {
        x: startTransform.x + dx,
        y: startTransform.y + dy,
        k: startTransform.k,
      }
    }

    function onUp(): void {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { transform, onWheel, onPointerDown, initTransform }
}
