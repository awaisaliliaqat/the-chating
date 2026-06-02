import { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import s from './FeaturesHub.module.css'

/* ─── Card definitions ──────────────────────────────────────────────────────── */
const STATIC_CARDS = [
  {
    id:       'games',
    icon:     '🎮',
    title:    'Games',
    desc:     'Challenge friends to Tic-Tac-Toe or Rock Paper Scissors in real time.',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    glow:     'rgba(99,102,241,0.35)',
    path:     '/games',
    action:   'Play Now',
  },
  {
    id:       'appointments',
    icon:     '📅',
    title:    'Appointments',
    desc:     'Book time with friends, set meeting slots and never miss a catch-up.',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
    glow:     'rgba(14,165,233,0.35)',
    path:     '/events',
    action:   'Book Time',
  },
  {
    id:       'payments',
    icon:     '💳',
    title:    'Payments',
    desc:     'Send payment requests directly in chat. Split bills with ease.',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    glow:     'rgba(16,185,129,0.35)',
    path:     '/messages',
    action:   'Send Request',
  },
  {
    id:       'business',
    icon:     '🏪',
    title:    'Business Profiles',
    desc:     'Create or browse business profiles to promote services to your network.',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    glow:     'rgba(245,158,11,0.35)',
    path:     '/profile',
    action:   'View Profile',
  },
  {
    id:       'streaks',
    icon:     '🔥',
    title:    'Streaks',
    desc:     'Keep the conversation alive. See your top streaks with friends.',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
    glow:     'rgba(239,68,68,0.35)',
    path:     '/messages',
    action:   'View Streaks',
  },
  {
    id:       'translate',
    icon:     '🌍',
    title:    'Translate',
    desc:     'Translate messages instantly. Chat with friends in any language.',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
    glow:     'rgba(59,130,246,0.35)',
    path:     '/messages',
    action:   'Translate',
  },
  {
    id:       'reminders',
    icon:     '⏰',
    title:    'Reminders',
    desc:     'Set personal reminders and never forget important moments again.',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
    glow:     'rgba(236,72,153,0.35)',
    path:     '/extras',
    action:   'Set Reminder',
  },
  {
    id:       'stats',
    icon:     '📊',
    title:    'My Stats',
    desc:     'Explore your messaging habits, top friends and activity patterns.',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
    glow:     'rgba(139,92,246,0.35)',
    path:     '/extras',
    action:   'View Stats',
  },
  {
    id:       'live',
    icon:     '🔴',
    title:    'Live Streams',
    desc:     'Go live or tune in to active streams from people you follow.',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #ec4899 100%)',
    glow:     'rgba(239,68,68,0.35)',
    path:     '/live',
    action:   'Watch Live',
  },
]

/* ─── small helpers ─────────────────────────────────────────────────────────── */
function StatPill({ value, label }) {
  return (
    <div className={s.statPill}>
      <span className={s.statValue}>{value}</span>
      <span className={s.statLabel}>{label}</span>
    </div>
  )
}

function FeatureCard({ card, stat, onAction }) {
  return (
    <div
      className={s.card}
      style={{ '--card-glow': card.glow }}
    >
      {/* coloured gradient header band */}
      <div className={s.cardBand} style={{ background: card.gradient }}>
        <span className={s.cardIcon}>{card.icon}</span>
        {card.id === 'live' && stat?.liveCount > 0 && (
          <span className={s.liveDot} aria-label="live" />
        )}
      </div>

      <div className={s.cardBody}>
        <h3 className={s.cardTitle}>{card.title}</h3>
        <p className={s.cardDesc}>{card.desc}</p>

        {/* dynamic quick-stat area */}
        {stat && (
          <div className={s.statRow}>
            {stat.pills?.map(p => (
              <StatPill key={p.label} value={p.value} label={p.label} />
            ))}
          </div>
        )}
      </div>

      <div className={s.cardFooter}>
        <button
          className={s.actionBtn}
          style={{ background: card.gradient }}
          onClick={() => onAction(card.path)}
        >
          {card.action}
        </button>
      </div>
    </div>
  )
}

/* ─── Main page ─────────────────────────────────────────────────────────────── */
export default function FeaturesHub() {
  const { api, user } = useContext(AppContext)
  const navigate = useNavigate()

  const [stats,   setStats]   = useState(null)   // /messages/stats/mine
  const [games,   setGames]   = useState([])     // /games/active
  const [streams, setStreams] = useState([])     // /streams or /live/streams
  const [streaks, setStreaks] = useState([])     // /streaks/top or friends list
  const [remCount,setRemCount]= useState(null)   // upcoming reminder count from localStorage

  /* fetch data without blocking render — silently ignore failures */
  useEffect(() => {
    api('/messages/stats/mine').then(r => setStats(r.data)).catch(() => {})
    api('/games/active').then(r => setGames(r.data)).catch(() => {})
    api('/live-streams').then(r => setStreams(r.data)).catch(() => {})
    api('/streaks').then(r => {
      // backend returns rows sorted DESC by streak_count, take top 3
      setStreaks((r.data || []).slice(0, 3))
    }).catch(() => {})

    // Reminders are stored in localStorage by the ReminderWidget
    try {
      const stored = JSON.parse(localStorage.getItem('reminders') || '[]')
      const upcoming = stored.filter(r => r.datetime && new Date(r.datetime) > new Date())
      setRemCount(upcoming.length)
    } catch { setRemCount(0) }
  }, []) // eslint-disable-line

  /* build per-card stat objects */
  function buildStat(id) {
    switch (id) {
      case 'games':
        if (games.length === 0) return null
        return {
          pills: [
            { value: games.filter(g => g.status === 'active').length, label: 'Active' },
            { value: games.filter(g => g.current_turn === user?.id && g.status === 'active').length, label: 'Your Turn' },
          ],
        }
      case 'streaks': {
        if (streaks.length === 0) return null
        const top  = streaks[0]
        const name = (top?.friend_name ?? '—').split(' ')[0]
        const days = top?.streak_count ?? 0
        return { pills: [{ value: `🔥 ${days}`, label: `with ${name}` }] }
      }
      case 'live': {
        const liveCount = streams.length
        return liveCount > 0
          ? { pills: [{ value: liveCount, label: liveCount === 1 ? 'Live Now' : 'Live Now' }], liveCount }
          : null
      }
      case 'stats':
        if (!stats) return null
        return {
          pills: [
            { value: stats.total_sent     ?? '—', label: 'Sent'     },
            { value: stats.total_received ?? '—', label: 'Received' },
          ],
        }
      case 'reminders':
        if (remCount === null || remCount === 0) return null
        return { pills: [{ value: remCount, label: remCount === 1 ? 'Upcoming' : 'Upcoming' }] }
      default:
        return null
    }
  }

  const liveStreams = streams.slice(0, 3)

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <header className={s.header}>
        <div className={s.headerText}>
          <h1 className={s.pageTitle}>Features Hub</h1>
          <p className={s.pageSubtitle}>Everything THE CHATING has to offer, in one place.</p>
        </div>
        <span className={s.headerEmoji} aria-hidden="true">✨</span>
      </header>

      {/* ── Live streams preview strip (only if active) ── */}
      {liveStreams.length > 0 && (
        <section className={s.liveStrip} aria-label="Live now">
          <div className={s.stripHeader}>
            <span className={s.stripDot} />
            <span className={s.stripTitle}>Live Right Now</span>
            <button className={s.stripMore} onClick={() => navigate('/live')}>See all</button>
          </div>
          <div className={s.streamRow}>
            {liveStreams.map(st => (
              <button
                key={st.id}
                className={s.streamChip}
                style={{ background: st.thumb_color || 'linear-gradient(135deg,#6366f1,#ec4899)' }}
                onClick={() => navigate('/live')}
              >
                <span className={s.streamChipDot} />
                <span className={s.streamChipName}>{st.title || st.host_name || 'Live Stream'}</span>
                {st.viewer_count != null && (
                  <span className={s.streamChipViewers}>
                    {st.viewer_count >= 1000
                      ? (st.viewer_count / 1000).toFixed(1) + 'K'
                      : st.viewer_count} viewers
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Feature card grid ── */}
      <div className={s.grid}>
        {STATIC_CARDS.map(card => (
          <FeatureCard
            key={card.id}
            card={card}
            stat={buildStat(card.id)}
            onAction={path => navigate(path)}
          />
        ))}
      </div>

      {/* ── Footer tagline ── */}
      <footer className={s.footer}>
        <span>More features coming soon</span>
        <span className={s.footerDots}>· · ·</span>
      </footer>
    </div>
  )
}
