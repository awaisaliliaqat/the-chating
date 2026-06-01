import { useState, useEffect, useContext, useRef } from 'react'
import { AppContext } from '../context/AppContext'
import s from './GifPicker.module.css'

const TRENDING = ['funny','happy','sad','love','wow','laugh','dance','party','cool','thanks']

export default function GifPicker({ onPick, onClose }) {
  const { api } = useContext(AppContext)
  const [query,  setQuery]  = useState('')
  const [gifs,   setGifs]   = useState([])
  const [loading,setLoading]= useState(false)
  const ref = useRef(null)

  useEffect(() => {
    document.addEventListener('mousedown', e => { if (ref.current && !ref.current.contains(e.target)) onClose?.() })
    loadGifs('trending')
  }, []) // eslint-disable-line

  async function loadGifs(q) {
    setLoading(true)
    try {
      const r = await api(`/gif/search?q=${encodeURIComponent(q)}&limit=20`)
      setGifs(r.data)
    } catch { setGifs([]) }
    finally { setLoading(false) }
  }

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) loadGifs(query)
  }

  return (
    <div ref={ref} className={s.picker}>
      <form onSubmit={handleSearch} className={s.searchRow}>
        <input className={s.input} placeholder="🔍 Search GIFs…" value={query}
          onChange={e => setQuery(e.target.value)} autoFocus />
        <button type="submit" className={s.goBtn}>Go</button>
      </form>
      <div className={s.trending}>
        {TRENDING.map(t => (
          <button key={t} className={s.tag} onClick={() => { setQuery(t); loadGifs(t) }}>{t}</button>
        ))}
      </div>
      <div className={s.grid}>
        {loading && <div className={s.loading}><span className="spinner" /></div>}
        {!loading && gifs.map(g => (
          <img key={g.id} src={g.preview} className={s.gif} alt={g.title}
            onClick={() => onPick(g.url)}
            loading="lazy" />
        ))}
        {!loading && gifs.length === 0 && <div className={s.empty}>No GIFs found</div>}
      </div>
      <div className={s.powered}>Powered by Tenor</div>
    </div>
  )
}
