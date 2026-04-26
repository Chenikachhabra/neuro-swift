import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './App.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Toaster
      position='top-right'
      richColors
      toastOptions={{
        style: {
          background: '#0f0f1e',
          color: '#f0f4ff',
          border: '1px solid #1a1a2e',
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px'
        }
      }}
    />
    <App />
  </StrictMode>
)
