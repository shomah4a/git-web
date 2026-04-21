/**
 * SVG のパン・ズーム制御 composable (ADR 0047)。
 *
 * d3-zoom を使い、背景ドラッグでパン、ホイールでズームを実現する。
 * transform 状態を ref で保持し、Vue テンプレートで <g> の transform に適用する。
 */

import type { Ref } from 'vue'
import type { D3ZoomEvent, ZoomBehavior } from 'd3-zoom'
import { zoom, zoomIdentity } from 'd3-zoom'
import { select } from 'd3-selection'
import { ref } from 'vue'

export type ViewportTransform = {
  readonly x: number
  readonly y: number
  readonly k: number
}

export type GraphViewport = {
  /** 現在の transform (x, y, k) */
  readonly transform: Ref<ViewportTransform>
  /** SVG 要素に d3-zoom をアタッチする。onMounted で呼ぶ。 */
  readonly attach: (svgElement: SVGSVGElement) => void
  /** d3-zoom をデタッチする。onBeforeUnmount で呼ぶ。 */
  readonly detach: () => void
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3

export function useGraphViewport(): GraphViewport {
  const transform = ref<ViewportTransform>({ x: 0, y: 0, k: 1 })
  let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null
  let svgEl: SVGSVGElement | null = null

  function attach(svgElement: SVGSVGElement): void {
    svgEl = svgElement

    zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        transform.value = {
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        }
      })

    const zb = zoomBehavior
    select(svgElement).call(zb)

    // 初期 transform を適用 (中央寄せのため少しオフセット)
    const rect = svgElement.getBoundingClientRect()
    const initialTransform = zoomIdentity.translate(rect.width / 2, 60)
    select(svgElement).call(zb.transform.bind(zb), initialTransform)
  }

  function detach(): void {
    if (svgEl !== null) {
      select(svgEl).on('.zoom', null)
    }
    zoomBehavior = null
    svgEl = null
  }

  return { transform, attach, detach }
}
