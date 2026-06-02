import { useState, useEffect, useRef, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'

export default function RefreshButton() {
  const { setUser, api } = useContext(AppContext)
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [pulling, setPulling] = useState(false)
  const startY = useRef(0)
  const threshold = 80

  // ── Refresh function ────────────────────────────────────────────────────
  async function doRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      // Refresh user data
      const r = await api('/me')
      setUser(r.data)
      // Force page reload of current route data
      window.dispatchEvent(new CustomEvent('app-refresh'))
    } catch { /* ignore */ }
    finally {
      setTimeout(() => { setRefreshing(false); setPullDistance(0) }, 600)
    }
  }

  // ── Pull-to-refresh on mobile ───────────────────────────────────────────
  useEffect(() => {
    function onTouchStart(e) {
      // Only allow pull when at very top of scroll
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop
      if (scrollTop <= 0) startY.current = e.touches[0].clientY
      else startY.current = 0
    }

    function onTouchMove(e) {
      if (!startY.current) return
      const dist = e.touches[0].clientY - startY.current
      if (dist > 0 && dist < threshold * 1.5) {
        e.preventDefault()
        setPulling(true)
        setPullDistance(Math.min(dist, threshold * 1.5))
      }
    }

    function onTouchEnd() {
      if (pullDistance >= threshold) doRefresh()
      else { setPullDistance(0); setPulling(false) }
      startY.current = 0
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove',  onTouchMove,  { passive: false })
    document.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove',  onTouchMove)
      document.removeEventListener('touchend',   onTouchEnd)
    }
  }, [pullDistance, refreshing]) // eslint-disable-line

  const pullProgress = Math.min(pullDistance / threshold, 1)

  return (
    <>
      {/* ── Pull-to-refresh indicator (mobile) ── */}
      {(pulling || refreshing) && pullDistance > 10 && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9000,
          pointerEvents: 'none',
          transform: `translateY(${Math.min(pullDistance - 10, 60)}px)`,
          transition: refreshing ? 'transform .3s ease' : 'none',
        }}>
          <div style={{
            background: 'var(--accent)',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(99,102,241,.4)',
            transition: 'transform .15s',
            transform: `rotate(${refreshing ? 'none' : pullProgress * 360 + 'deg'})`,
          }}>
            <span style={{
              fontSize: 18,
              animation: refreshing ? 'spin .7s linear infinite' : 'none',
              display: 'inline-block',
            }}>
              {refreshing ? '🔄' : pullProgress >= 1 ? '↑' : '↓'}
            </span>
          </div>
        </div>
      )}

      {/* ── Desktop refresh button (fixed top-right) ── */}
      <button
        onClick={doRefresh}
        disabled={refreshing}
        title="Refresh (get latest updates)"
        style={{
          position: 'fixed',
          top: 12,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: refreshing ? 'var(--accent)' : 'var(--bg-card)',
          border: '1px solid var(--border)',
          color: refreshing ? '#fff' : 'var(--text-muted)',
          fontSize: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: refreshing ? 'not-allowed' : 'pointer',
          zIndex: 800,
          boxShadow: '0 2px 8px rgba(0,0,0,.2)',
          transition: 'all .2s',
        }}
        onMouseEnter={e => { if (!refreshing) { e.currentTarget.style.background='var(--accent)'; e.currentTarget.style.color='#fff' } }}
        onMouseLeave={e => { if (!refreshing) { e.currentTarget.style.background='var(--bg-card)'; e.currentTarget.style.color='var(--text-muted)' } }}
      >
        <span style={{
          display: 'inline-block',
          animation: refreshing ? 'spin .7s linear infinite' : 'none',
        }}>
          🔄
        </span>
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
