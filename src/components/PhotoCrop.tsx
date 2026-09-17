/**
 * Photo-crop traceability.
 *
 * Every value the extractor returns carries the image index and bounding box
 * it was read from. These two components turn that into something a
 * contractor can check at a glance: a zoomed crop of the handwriting, and the
 * same region highlighted on the full page.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoundingBox } from '@/types/domain'
import { cn } from '@/lib/utils'

interface Size {
  width: number
  height: number
}

/** Tracks the rendered size of an element. */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  const measure = useCallback(() => {
    const node = ref.current
    if (node) setSize({ width: node.clientWidth, height: node.clientHeight })
  }, [])

  useEffect(() => {
    const node = ref.current
    if (!node) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [measure])

  return [ref, size] as const
}

/** Grows a tight bbox so the crop shows a little of the surrounding page. */
function withPadding(bbox: BoundingBox, pad: number): BoundingBox {
  const [x, y, w, h] = bbox
  const px = w * pad
  const py = h * pad
  return [
    Math.max(0, x - px),
    Math.max(0, y - py),
    Math.min(1 - Math.max(0, x - px), w + px * 2),
    Math.min(1 - Math.max(0, y - py), h + py * 2),
  ]
}

export function PhotoCrop({
  src,
  bbox,
  className,
  padding = 0.25,
  alt = 'Crop of the source photo',
}: {
  src: string
  bbox: BoundingBox
  className?: string
  padding?: number
  alt?: string
}) {
  const [containerRef, container] = useElementSize<HTMLDivElement>()
  const [natural, setNatural] = useState<Size | null>(null)

  const [x, y, w, h] = withPadding(bbox, padding)

  // Fit the crop region inside the container without distorting it: scale the
  // whole image up until the region fills the box, then offset so the region's
  // centre lands on the container's centre.
  let style: React.CSSProperties = { visibility: 'hidden' }
  if (natural && container.width > 0 && container.height > 0 && w > 0 && h > 0) {
    const scale = Math.min(
      container.width / (w * natural.width),
      container.height / (h * natural.height),
    )
    const renderedWidth = natural.width * scale
    const renderedHeight = natural.height * scale
    style = {
      width: renderedWidth,
      height: renderedHeight,
      left: container.width / 2 - (x + w / 2) * renderedWidth,
      top: container.height / 2 - (y + h / 2) * renderedHeight,
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden rounded-lg bg-ink-100', className)}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute max-w-none"
        style={style}
        onLoad={(event) => {
          const img = event.currentTarget
          setNatural({ width: img.naturalWidth, height: img.naturalHeight })
        }}
      />
    </div>
  )
}

/** The full page with the extracted region ringed on it. */
export function PhotoWithHighlight({
  src,
  bbox,
  className,
  alt = 'Source photo',
}: {
  src: string
  bbox: BoundingBox | null
  className?: string
  alt?: string
}) {
  return (
    // Two elements on purpose: the outer one scrolls and clips, the inner one
    // is exactly the size of the image. The highlight's percentage offsets
    // resolve against its containing block, so it has to be the image wrapper
    // — against the clipping box they would be wrong whenever the image is
    // taller than the space it is shown in.
    <div className={cn('overflow-auto rounded-xl bg-ink-100', className)}>
      <div className="relative w-full">
        <img src={src} alt={alt} className="block w-full" />
        {bbox ? (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-md border-2 border-brand-500 bg-brand-400/15 shadow-[0_0_0_9999px_rgba(18,21,29,0.35)]"
            style={{
              left: `${bbox[0] * 100}%`,
              top: `${bbox[1] * 100}%`,
              width: `${bbox[2] * 100}%`,
              height: `${bbox[3] * 100}%`,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
