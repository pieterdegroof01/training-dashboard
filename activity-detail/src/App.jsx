import { useState } from 'react'
import { activity } from './data.js'
import { ActivityDetailView } from './ActivityDetailView.jsx'
import s from './App.module.css'

export default function App() {
  const [theme, setTheme] = useState('light')
  const [layout, setLayout] = useState('desktop')

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  const toggleLayout = () => setLayout((l) => (l === 'desktop' ? 'phone' : 'desktop'))

  return (
    <div data-theme={theme} className={s.root}>
      {/* Dev-toolbar */}
      <div className={s.toolbar}>
        <span className={s.brand}>PeakForm · Activiteit detail</span>
        <div className={s.controls}>
          <button
            className={s.btn}
            onClick={toggleLayout}
            aria-label={`Schakel naar ${layout === 'desktop' ? 'telefoon' : 'desktop'}-layout`}
          >
            {layout === 'desktop' ? '📱 Telefoon' : '🖥 Desktop'}
          </button>
          <button
            className={s.btn}
            onClick={toggleTheme}
            aria-label={`Schakel naar ${theme === 'light' ? 'donker' : 'licht'} thema`}
          >
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
      </div>

      {/* Pagina-inhoud */}
      <div className={`${s.page} ${layout === 'phone' ? s.phoneWrap : ''}`}>
        <ActivityDetailView
          activity={activity}
          onBack={() => window.history.back()}
          layout={layout}
        />
      </div>
    </div>
  )
}
