import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import '@syena/ds/styles.css'
import './styles.css'

import App from './App.tsx'
import { UpdatePrompt } from './components/UpdatePrompt'
import { stripTrailingSlash } from './lib/basePath'
import { registerServiceWorker } from './pwa/register'

// Vite's BASE_URL always has a trailing slash; react-router's basename should not
// (except for the bare "/" root case).
const basename = stripTrailingSlash(import.meta.env.BASE_URL)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
      <UpdatePrompt />
    </BrowserRouter>
  </StrictMode>,
)

registerServiceWorker()
