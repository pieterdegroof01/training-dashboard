import { useState, useEffect } from 'react'
import { ActivityDetailView } from './ActivityDetailView.jsx'
import { transformApiResponse } from './dataTransform.js'
import s from './App.module.css'

function extractActivityId() {
  const m = window.location.pathname.match(/\/activity\/(\d+)/)
  return m ? m[1] : null
}

export default function App() {
  const [theme, setTheme]   = useState(() => localStorage.getItem('pf-theme') || 'light')
  const [layout, setLayout] = useState(() => window.innerWidth < 768 ? 'phone' : 'desktop')
  const [activity, setActivity] = useState(null)
  const [error, setError]   = useState(null)
  const [aiText, setAiText] = useState(null)
  const [aiLoading, setAiLoading] = useState(true)

  const id = extractActivityId()
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')

  useEffect(() => {
    const handleResize = () => setLayout(window.innerWidth < 768 ? 'phone' : 'desktop')
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
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

  const activityWithAi = activity ? { ...activity, ai: aiText, aiLoading } : null

  return (
    <div data-theme={theme} className={s.root}>
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
            theme={theme}
          />
        )}
      </div>
    </div>
  )
}
