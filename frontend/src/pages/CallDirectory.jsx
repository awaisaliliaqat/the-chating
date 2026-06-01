import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './CallDirectory.module.css'

export default function CallDirectory() {
  const { user, api, startCall, availableUsers, onlineUsers, addToast, micBlocked, setMicBlocked } = useContext(AppContext)
  const [permChecked, setPermChecked] = useState(false)
  const [permState,   setPermState]   = useState('unknown') // 'granted'|'denied'|'prompt'|'unknown'

  // Check microphone permission on mount
  useEffect(() => {
    if (!navigator.permissions) { setPermChecked(true); return }
    navigator.permissions.query({ name: 'microphone' })
      .then(r => { setPermState(r.state); setPermChecked(true); r.onchange = () => setPermState(r.state) })
      .catch(() => setPermChecked(true))
  }, [])

  async function requestMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      setPermState('granted')
      setMicBlocked(false)
      addToast('✅ Microphone access granted! You can now make calls.', 'success')
    } catch(err) {
      setPermState('denied')
      addToast('❌ Microphone blocked. Please allow it in browser settings.', 'error')
    }
  }

  const [available,    setAvailable]    = useState(false)
  const [users,        setUsers]        = useState([])
  const [toggling,     setToggling]     = useState(false)
  const [callingId,    setCallingId]    = useState(null)
  const [filter,       setFilter]       = useState('all')   // all | audio | video
  const [search,       setSearch]       = useState('')

  // Load initial list
  useEffect(() => {
    api('/users/available').then(r => setUsers(r.data)).catch(() => {})
    // Sync my own availability from server
    api('/me').then(r => setAvailable(!!r.data.available_for_calls)).catch(() => {})
  }, []) // eslint-disable-line

  // Live updates from socket
  useEffect(() => {
    const list = Array.from(availableUsers.values())
    if (list.length > 0 || availableUsers.size === 0) {
      setUsers(prev => {
        // Merge: remove users who went offline, add/update available ones
        const unavailableIds = new Set()
        prev.forEach(u => { if (!availableUsers.has(u.id) && u.id !== user?.id) unavailableIds.add(u.id) })
        const merged = prev.filter(u => !unavailableIds.has(u.id))
        list.forEach(u => {
          if (!merged.find(x => x.id === u.id)) merged.push(u)
        })
        return merged
      })
    }
  }, [availableUsers]) // eslint-disable-line

  async function toggleAvailability() {
    setToggling(true)
    try {
      const r = await api('/users/availability', { method: 'PUT', data: { available: !available } })
      setAvailable(r.data.available)
      if (r.data.available) {
        addToast('You are now available for calls 📞', 'success')
      } else {
        addToast('You are no longer available', 'info')
      }
    } catch { addToast('Failed to update status', 'error') }
    finally { setToggling(false) }
  }

  async function callUser(u, type) {
    setCallingId(u.id)
    setTimeout(() => setCallingId(null), 3000)
    startCall(u.id, type)
  }

  function randomCall(type) {
    const eligible = users.filter(u => onlineUsers.has(u.id) || u.is_online)
    if (eligible.length === 0) { addToast('No one available right now. Try again soon!', 'info'); return }
    const pick = eligible[Math.floor(Math.random() * eligible.length)]
    addToast(`Calling ${pick.name}…`, 'info')
    callUser(pick, type)
  }

  const filtered = users.filter(u => {
    if (u.id === user?.id) return false
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) &&
        !(u.username||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const onlineCount = filtered.filter(u => onlineUsers.has(u.id) || u.is_online).length

  return (
    <div className={s.page}>
      {/* ── Hero header ── */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <h1 className={s.heroTitle}>📞 Call Directory</h1>
          <p className={s.heroSub}>
            {filtered.length} people available · {onlineCount} online now
          </p>
        </div>

        {/* Your availability toggle */}
        <div className={s.availableCard}>
          <div className={s.availableInfo}>
            <div className={s.availableLabel}>Your status</div>
            <div className={`${s.availableStatus} ${available ? s.statusOn : s.statusOff}`}>
              {available ? '🟢 Available for calls' : '⚫ Not available'}
            </div>
          </div>
          <button
            className={`${s.toggleBtn} ${available ? s.toggleOn : s.toggleOff}`}
            onClick={toggleAvailability}
            disabled={toggling}
          >
            {toggling
              ? <span className="spinner" />
              : available ? 'Go Unavailable' : 'Go Available'
            }
          </button>
        </div>
      </div>

      {/* ── Mic permission banner ── */}
      {permChecked && permState !== 'granted' && (
        <div className={s.permBanner}>
          <div className={s.permLeft}>
            <span className={s.permIcon}>{permState === 'denied' ? '🚫' : '🎙️'}</span>
            <div>
              <div className={s.permTitle}>
                {permState === 'denied'
                  ? 'Microphone is BLOCKED — calls will not work'
                  : 'Microphone permission needed for calls'}
              </div>
              <div className={s.permSub}>
                {permState === 'denied'
                  ? 'Click the 🔒 padlock in your browser address bar → Microphone → Allow'
                  : 'Click the button to allow microphone access so you can make calls'}
              </div>
            </div>
          </div>
          {permState !== 'denied' && (
            <button className={s.permBtn} onClick={requestMicPermission}>
              Allow Microphone
            </button>
          )}
          {permState === 'denied' && (
            <button className={s.permBtnFix} onClick={() => {
              addToast('Click the 🔒 padlock → Microphone → Allow → Refresh page', 'warning')
            }}>
              How to fix?
            </button>
          )}
        </div>
      )}

      {/* ── Action bar ── */}
      <div className={s.actionBar}>
        <div className={s.searchBox}>
          <span>🔍</span>
          <input
            className={s.searchInput}
            placeholder="Search by name or @username…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className={s.randomBtns}>
          <button className={s.randomAudio} onClick={() => randomCall('audio')}>
            🎲 Random Audio Call
          </button>
          <button className={s.randomVideo} onClick={() => randomCall('video')}>
            🎲 Random Video Call
          </button>
        </div>
      </div>

      {/* ── Info banner ── */}
      {!available && (
        <div className={s.infoBanner}>
          💡 Toggle <strong>Go Available</strong> above so others can call you too. You can still call anyone on this page anytime.
        </div>
      )}

      {/* ── Users grid ── */}
      {filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📵</div>
          <div className={s.emptyTitle}>
            {search ? `No results for "${search}"` : 'No one available right now'}
          </div>
          <div className={s.emptySub}>
            {!search && 'Be the first! Toggle "Go Available" above and others can call you.'}
          </div>
        </div>
      ) : (
        <div className={s.grid}>
          {filtered.map(u => {
            const isOnline  = onlineUsers.has(u.id) || u.is_online
            const isCalling = callingId === u.id
            return (
              <div key={u.id} className={`${s.card} ${isOnline ? s.cardOnline : s.cardOffline}`}>
                {/* Online indicator */}
                <div className={s.cardStatus}>
                  {isOnline
                    ? <span className={s.onlinePill}>🟢 Online</span>
                    : <span className={s.offlinePill}>⚫ Away</span>
                  }
                </div>

                {/* Avatar */}
                <div className={s.cardAvatar}>
                  <Avatar user={u} size={64} online={isOnline} />
                </div>

                {/* Info */}
                <div className={s.cardName}>{u.name}</div>
                {u.username && <div className={s.cardUsername}>@{u.username}</div>}
                {u.bio && <div className={s.cardBio}>{u.bio}</div>}

                {/* Call buttons */}
                <div className={s.cardBtns}>
                  <button
                    className={`${s.callBtn} ${s.audioBtn} ${isCalling ? s.calling : ''}`}
                    onClick={() => callUser(u, 'audio')}
                    disabled={isCalling}
                  >
                    {isCalling ? '📲 Calling…' : '📞 Audio'}
                  </button>
                  <button
                    className={`${s.callBtn} ${s.videoBtn} ${isCalling ? s.calling : ''}`}
                    onClick={() => callUser(u, 'video')}
                    disabled={isCalling}
                  >
                    📹 Video
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
