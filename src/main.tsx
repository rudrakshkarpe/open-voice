import { createRoot } from 'react-dom/client'
import './styles.css'

function App() {
  return <main className="boot-screen">OpenVoice studio is warming up…</main>
}

createRoot(document.getElementById('root')!).render(<App />)
