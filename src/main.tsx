import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import App from './App.tsx'
import { keepAppFresh } from './pwa'
import './styles/tokens.css'
import './styles/global.css'
import './styles/util.css'

// A new build must never sit behind a stale service worker (see src/pwa.ts).
keepAppFresh()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
