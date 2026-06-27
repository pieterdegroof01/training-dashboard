import { useState, useEffect } from 'react'
import { ActivityDetailView } from './ActivityDetailView.jsx'
import { transformApiResponse } from './dataTransform.js'
import s from './App.module.css'

function extractActivityId() {
  const m = window.location.pathname.match(/\/activity\/(\d+)/)
  return m ? m[1] : null
}

export default function App() {
  const [theme, setTheme]   = useState('light')
  const [layout, setLayout] = useState('desktop')
  const [activity, setActivity] = useState(null)
  const [error, setError]   = useState(null)
  const [aiText, setAiText] = useState(null)
  const [aiLoading, setAiLoading] = useState(true)

  const id = extractActivityId()
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')

  useEffect(() => {
    // Dev-only demo-modus: render met synthetische data zonder backend.
    if (demo) {
      import('./_demoData.js')
        .then(({ demoApi }) => {
          setActivity(transformApiResponse(demoApi))
          setAiText('Demo-modus: dit is synthetische data om de render te controleren. De coach-analyse komt in productie van de Anthropic-API.')
          setAiLoading(false)
        })
        .catch(e => setError(e.message))
      return
    }

    if (!id) { setError('Geen activiteit-ID gevonden in de URL.'); return }

    fetch(`/api/activity/${id}/detail`)
      .then(r => {
        if (!r.ok) throw new Error(`API fout: ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (!data.activity) throw new Error('Activiteit niet gevonden.')
        setActivity(transformApiResponse(data))
      })
      .catch(e => setError(e.message))
  }, [id, demo])

  useEffect(() => {
    if (!id || !activity) return
    setAiLoading(true)
    fetch(`/api/activity/${id}/analyse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computed: {} }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.text) setAiText(data.text) })
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [id, activity?.id])

  const toggleTheme  = () => setTheme(t  => t  === 'light' ? 'dark' : 'light')
  const toggleLayout = () => setLayout(l => l === 'desktop' ? 'phone' : 'desktop')

  const activityWithAi = activity ? { ...activity, ai: aiText, aiLoading } : null

  return (
    <div data-theme={theme} className={s.root}>
      <div className={s.toolbar}>
        <span className={s.brand}>PeakForm</span>
        <div className={s.controls}>
          <button className={s.btn} onClick={toggleLayout}>
            {layout === 'desktop' ? '📱 Telefoon' : '🖥 Desktop'}
          </button>
          <button className={s.btn} onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
      </div>

      <div className={`${s.page} ${layout === 'phone' ? s.phoneWrap : ''}`}>
        {error && (
          <div style={{ padding: '40px', color: 'var(--red)', fontFamily: 'var(--font-body)' }}>
            {error}
          </div>
        )}
        {!activity && !error && (
          <div style={{ padding: '40px', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
            Activiteit laden…
          </div>
        )}
        {activityWithAi && (
          <ActivityDetailView
            activity={activityWithAi}
            onBack={() => window.history.back()}
            layout={layout}
          />
        )}
      </div>
    </div>
  )
}
