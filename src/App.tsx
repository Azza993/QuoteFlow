import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useEffect } from 'react'
import { DataProvider } from './data/DataProvider'
import { TooltipProvider } from './components/ui/tooltip'
import { AppShell } from './components/AppShell'
import { LoadingState } from './components/LoadingState'
import { useData } from './hooks/use-data'
import { Dashboard } from './pages/Dashboard'
import { QuotesList } from './pages/QuotesList'
import { QuoteDetail } from './pages/QuoteDetail'
import { NewQuote } from './pages/NewQuote'
import { ScanNotes } from './pages/ScanNotes'
import { ReviewExtraction } from './pages/ReviewExtraction'
import { QuoteBuilder } from './pages/QuoteBuilder'
import { QuotePreview } from './pages/QuotePreview'
import { PriceBook } from './pages/PriceBook'
import { Customers } from './pages/Customers'
import { Settings } from './pages/Settings'
import { PublicQuote } from './pages/PublicQuote'
import { NotFound } from './pages/NotFound'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** Everything behind the contractor-facing shell. */
function ContractorRoutes() {
  const { loading, error } = useData()

  if (loading) {
    return (
      <AppShell>
        <LoadingState label="Loading your quotes…" />
      </AppShell>
    )
  }

  if (error) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-semibold">We couldn't load your data.</p>
          <p className="mt-1">{error}</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/quotes" element={<QuotesList />} />
        <Route path="/quotes/new" element={<NewQuote />} />
        <Route path="/quotes/:quoteId" element={<QuoteDetail />} />
        <Route path="/quotes/:quoteId/edit" element={<QuoteBuilder />} />
        <Route path="/quotes/:quoteId/preview" element={<QuotePreview />} />
        <Route path="/quotes/:quoteId/review" element={<ReviewExtraction />} />
        <Route path="/scan" element={<ScanNotes />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/price-book" element={<PriceBook />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </AppShell>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <TooltipProvider delayDuration={200}>
          <ScrollToTop />
          <Routes>
            {/* The customer-facing view is deliberately outside the app shell:
                no nav, no contractor tools, just the quote. */}
            <Route path="/q/:token" element={<PublicQuote />} />
            <Route path="*" element={<ContractorRoutes />} />
          </Routes>
          <Toaster position="top-center" richColors closeButton />
        </TooltipProvider>
      </DataProvider>
    </BrowserRouter>
  )
}
