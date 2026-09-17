import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ImagePlus, Loader2, ScanLine, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getExtractor, type ExtractionImage } from '@/ai'
import { DEMO_NOTE_IMAGES } from '@/data/demo/seed'
import { newId } from '@/lib/utils'
import { nowIso } from '@/lib/dates'
import type { NoteScan } from '@/types/domain'

interface Page {
  id: string
  url: string
  /** Set for files the user picked; absent for the built-in demo pages. */
  file?: File
  /** Object URLs need revoking; demo URLs must not be. */
  revocable: boolean
}

export function ScanNotes() {
  const navigate = useNavigate()
  const { createQuote, saveNoteScan, priceBook, customers } = useData()

  const [pages, setPages] = useState<Page[]>([])
  const [working, setWorking] = useState(false)
  const [step, setStep] = useState<string>('')
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)

  // Object URLs live as long as the page list does.
  useEffect(() => {
    return () => {
      for (const page of pages) if (page.revocable) URL.revokeObjectURL(page.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const added = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({
        id: newId(),
        url: URL.createObjectURL(file),
        file,
        revocable: true,
      }))
    if (added.length === 0) {
      toast.error('Those files are not photos.')
      return
    }
    setPages((current) => [...current, ...added])
  }

  const removePage = (id: string) => {
    setPages((current) => {
      const page = current.find((p) => p.id === id)
      if (page?.revocable) URL.revokeObjectURL(page.url)
      return current.filter((p) => p.id !== id)
    })
  }

  const useSampleNotes = () => {
    setPages(
      DEMO_NOTE_IMAGES.map((url) => ({ id: newId(), url, revocable: false })),
    )
  }

  const run = async () => {
    if (pages.length === 0) return
    setWorking(true)
    try {
      setStep('Reading your handwriting…')
      const images: ExtractionImage[] = await Promise.all(
        pages.map(async (page) => ({
          url: page.url,
          base64: page.file ? await toBase64(page.file) : undefined,
          mimeType: page.file?.type,
        })),
      )

      // The contractor's own price book and customer list help the extractor
      // match abbreviations on the page to wording they already use.
      const outcome = await (await getExtractor()).extract({
        images,
        hints: {
          knownItemNames: priceBook.map((item) => item.name),
          knownCustomerNames: customers.map((customer) => customer.name),
        },
      })

      setStep('Setting up your quote…')
      // A quote is created up front so the extraction always has somewhere to
      // live — even a partial read leaves the contractor with a draft to work
      // from rather than nothing.
      const quote = await createQuote({ source: 'scan' })

      const scan: NoteScan = {
        id: newId(),
        quote_id: quote.id,
        image_urls: pages.map((page) => page.url),
        raw_extraction_json: outcome.result,
        status: 'needs_review',
        created_at: nowIso(),
      }
      await saveNoteScan(scan)

      if (outcome.warning) toast.warning(outcome.warning, { duration: 8000 })
      navigate(`/quotes/${quote.id}/review`, { replace: true })
    } catch {
      toast.error(
        "Something went wrong reading those notes. Your photos are still here — try again, or start the quote manually.",
      )
      setWorking(false)
      setStep('')
    }
  }

  if (working) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
        <div className="relative flex size-20 items-center justify-center rounded-3xl bg-brand-50">
          <ScanLine className="size-9 text-brand-600" />
          <Loader2 className="absolute size-20 animate-spin text-brand-300" strokeWidth={1} />
        </div>
        <h1 className="mt-6 text-xl font-bold text-ink-900">{step || 'Working…'}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          You'll get a chance to check everything before any of it is priced.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl pb-24 md:pb-0">
      <PageHeader
        title="Scan notes"
        subtitle="Photograph each page of your site notes. Multiple pages are fine."
        back={{ to: '/quotes/new', label: 'New quote' }}
      />

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {pages.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center px-6 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Camera className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-ink-900">Add your first page</h2>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">
              Lay the page flat and get the whole thing in frame. Don't worry about neat
              handwriting — you'll check everything on the next screen.
            </p>
            <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
              <Button size="lg" onClick={() => cameraInput.current?.click()}>
                <Camera /> Take a photo
              </Button>
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                <ImagePlus /> Choose from library
              </Button>
              <Button variant="ghost" onClick={useSampleNotes}>
                <Sparkles /> Try it with sample notes
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pages.map((page, index) => (
              <li key={page.id} className="group relative">
                <img
                  src={page.url}
                  alt={`Page ${index + 1}`}
                  className="aspect-[3/4] w-full rounded-xl border border-ink-200 bg-white object-cover"
                />
                <span className="absolute left-2 top-2 rounded-md bg-ink-900/80 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removePage(page.id)}
                  aria-label={`Remove page ${index + 1}`}
                  className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-red-600 shadow-sm transition-colors hover:bg-white"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => cameraInput.current?.click()}
                className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-300 text-ink-500 transition-colors hover:border-brand-400 hover:text-brand-600"
              >
                <Camera className="size-6" />
                <span className="text-sm font-medium">Add page</span>
              </button>
            </li>
          </ul>

          <div className="hidden md:block">
            <Button size="lg" className="w-full" onClick={run}>
              <Wand2 /> Read {pages.length} page{pages.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      )}

      {pages.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[4.5rem] z-20 border-t border-ink-200 bg-white/95 p-3 backdrop-blur md:hidden">
          <Button size="lg" className="w-full" onClick={run}>
            <Wand2 /> Read {pages.length} page{pages.length === 1 ? '' : 's'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      // Strip the `data:<mime>;base64,` prefix — backends want the payload.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Could not read that photo.'))
    reader.readAsDataURL(file)
  })
}
