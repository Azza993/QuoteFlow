import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

const redirect = sessionStorage.getItem('quoteflow:github-pages-redirect')
if (redirect && redirect.startsWith('/QuoteFlow/')) {
  sessionStorage.removeItem('quoteflow:github-pages-redirect')
  window.history.replaceState(null, '', redirect)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
