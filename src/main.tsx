import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { StoreProvider } from './lib/store'
import './index.css'
import './evidence.css'
import './depth.css'
import './skeleton.css'

// HashRouter keeps routing in the URL fragment (e.g. /#/graph), so a full
// reload of any route always serves index.html — no server rewrite needed
// and no 404s on deep links, on any static host.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>
  </React.StrictMode>,
)

// Register the service worker in production only (keeps dev HMR clean).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
