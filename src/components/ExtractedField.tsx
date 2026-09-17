import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import type { ExtractedField as ExtractedFieldType } from '@/types/domain'
import { ConfidenceMark, confidenceLevel } from './ConfidenceMark'
import { PhotoCrop, PhotoWithHighlight } from './PhotoCrop'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Label } from './ui/label'
import { cn } from '@/lib/utils'

/**
 * An extracted value, wrapped so it is always editable and always traceable:
 * tapping the thumbnail opens the exact crop of the photo the value was read
 * from, plus the full page with that region ringed.
 */
export function ExtractedFieldRow({
  label,
  field,
  images,
  children,
  className,
}: {
  label: string
  field: Pick<ExtractedFieldType<unknown>, 'confidence' | 'source_image_index' | 'source_bbox'> & {
    value: unknown
  }
  images: string[]
  /** The editable control. Always rendered — nothing here is read-only. */
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const level = confidenceLevel(field.confidence, field.value !== null && field.value !== '')
  const imageIndex = field.source_image_index
  const source =
    imageIndex !== null && field.source_bbox && images[imageIndex]
      ? { url: images[imageIndex], bbox: field.source_bbox, index: imageIndex }
      : null

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <ConfidenceMark level={level} withLabel />
      </div>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>

        {source ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Show where "${label}" came from`}
            className="shrink-0 overflow-hidden rounded-lg border border-ink-200 transition-colors hover:border-brand-400"
          >
            <PhotoCrop src={source.url} bbox={source.bbox} className="size-11" />
          </button>
        ) : (
          <span
            title="No source on the page"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-ink-200 text-ink-300"
          >
            <ImageIcon className="size-4" />
          </span>
        )}
      </div>

      {source ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>
                Read from page {source.index + 1} of your notes.
              </DialogDescription>
            </DialogHeader>

            <PhotoCrop
              src={source.url}
              bbox={source.bbox}
              padding={0.4}
              className="h-32 w-full border border-ink-200"
              alt={`Close-up of the handwriting for ${label}`}
            />
            <p className="mb-3 mt-2 text-xs text-ink-500">
              The highlighted area on the full page:
            </p>
            <PhotoWithHighlight
              src={source.url}
              bbox={source.bbox}
              className="max-h-[45vh]"
              alt={`Page ${source.index + 1} of your notes`}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
