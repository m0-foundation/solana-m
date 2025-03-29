import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Navbar } from './components/navbar'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Navbar />
  </StrictMode>,
)
