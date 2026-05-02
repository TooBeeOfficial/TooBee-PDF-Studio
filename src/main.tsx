import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { PdfProvider } from './context/PdfContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PdfProvider>
      <App />
    </PdfProvider>
  </React.StrictMode>,
)
