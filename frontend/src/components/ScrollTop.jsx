import { useState, useEffect } from 'react'

export default function ScrollTop({ scrollRef }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = scrollRef?.current || window
    const onScroll = () => {
      const top = scrollRef?.current
        ? scrollRef.current.scrollTop
        : window.scrollY
      setVisible(top > 300)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef])

  function scrollToTop() {
    const el = scrollRef?.current
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!visible) return null

  return (
    <button
      onClick={scrollToTop}
      style={{
        position: 'fixed',
        bottom: 80,
        right: 20,
        width: 42,
        height: 42,
        borderRadius: '50%',
        background: 'var(--accent)',
        color: '#fff',
        border: 'none',
        fontSize: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(99,102,241,.4)',
        cursor: 'pointer',
        zIndex: 700,
        transition: 'opacity .2s, transform .2s',
        opacity: 0.9,
      }}
      title="Scroll to top"
    >
      ↑
    </button>
  )
}
