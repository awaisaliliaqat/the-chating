import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './CallDirectory.module.css'

export default function CallDirectory() {
  const { user, api, startCall, onlineUsers, addToast, micBlocked, setMicBlocked } = useContext(AppContext)

  const [friends,    setFriends]    = useState([])
  const [others,     setOthers]     = useState([])   // available non-friends
  const [search,     setSearch]     = useState('')
  const [callingId,  setCallingId]  = useState(null)
  const [permState,  setPermState]  = useState('unknown')
  const [permChecked,setPermChecked]= useState(false)

  // Check microphone permission on mount
  useEffect(() => {
    if (!navigator.permissions) { setPermChecked(true); return }
    navigator.permissions.query({ name: 'microphone' })
      .then(r => {
        setPermState(r.state)
        setPermChecked(true)
        r.onchange = () => setPermState(r.state)
      })
      .catch(() => setPermChecked(true))
  }, [])

  // Load friends + available others
  useEffect(() => {
    api('/friends').then(r => setFriends(r.data)).catch(() => {})
    api('/users/suggested').then(r => {
      // Only show non-friends who marked available
      setOthers(r.data.filter(u => u.available_for_calls && u.friendship_status !== 'accepted'))
    }).catch(() => {})
  }, []) // eslint-disable-line

  async function requestMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      setPermState('granted')
      setMicBlocked(false)
      addToast('✅ Microphone access granted! You can now make calls.', 'success')
    } catch {
      setPermState('denied')
      addToast('❌ Microphone blocked. Allow it in browser settings.', 'error')
    }
  }

  async function callUser(u, type) {
    setCallingId(u.id)
    setTimeout(() => setCallingId(null), 4000)
    startCall(u.id, type)
  }

  const q = search.toLowerCase()
  const filteredFriends = friends.filter(f =>
    !q || f.name.toLowerCase().includes(q) || (f.username || '').toLowerCase().includes(q)
  )
  const onlineFriends  = filteredFriends.filter(f => onlineUsers.has(f.id))
  const offlineFriends = filteredFriends.filter(f => !onlineUsers.has(f.id))

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.hero}>
        <div>
          <h1 className={s.heroTitle}>📞 Call</h1>
          <p className={s.heroSub}>{onlineFriends.length} friends online · {friends.length} total friends</p>
        </div>
      </div>

      {/* Mic permission banner */}
      {permChecked && permState !== 'granted' && (
        <div className={s.permBanner}>
          <div className={s.permLeft}>
            <span className={s.permIcon}>{permState === 'denied' ? '🚫' : '🎙️'}</span>
            <div>
              <div className={s.permTitle}>
                {permState === 'denied'
                  ? 'Microphone BLOCKED — tap to fix'
                  : 'Allow microphone to make calls'}
              </div>
              <div className={s.permSub}>
                {permState === 'denied'
                  ? 'Click the 🔒 padlock in address bar → Microphone → Allow → Refresh'
                  : 'Browser needs permission to use your microphone'}
              </div>
            </div>
          </div>
          {permState !== 'denied' && (
            <button className={s.permBtn} onClick={requestMicPermission}>Allow Mic</button>
          )}
          {permState === 'denied' && (
            <button className={s.permBtnFix} onClick={() =>
              addToast('🔒 padlock → Microphone → Allow → Refresh page', 'warning')
            }>How to fix</button>
          )}
        </div>
      )}

      {/* Search */}
      <div className={s.searchBox}>
        <span>🔍</span>
        <input
          className={s.searchInput}
          placeholder="Search friends…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button className={s.clearBtn} onClick={() => setSearch('')}>✕</button>}
      </div>

      {/* ── Online Friends ── */}
      {onlineFriends.length > 0 && (
        <section>
          <div className={s.sectionHead}>
            <span className={s.onlineDot} />
            Online Friends
            <span className={s.sectionCount}>{onlineFriends.length}</span>
          </div>
          <div className={s.friendList}>
            {onlineFriends.map(f => (
              <FriendCallCard
                key={f.id} user={f} online={true}
                callingId={callingId} onCall={callUser}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Offline Friends ── */}
      {offlineFriends.length > 0 && (
        <section>
          <div className={s.sectionHead} style={{ marginTop: onlineFriends.length > 0 ? 16 : 0 }}>
            <span className={s.offlineDot} />
            All Friends
            <span className={s.sectionCount}>{offlineFriends.length}</span>
          </div>
          <div className={s.friendList}>
            {offlineFriends.map(f => (
              <FriendCallCard
                key={f.id} user={f} online={false}
                callingId={callingId} onCall={callUser}
              />
            ))}
          </div>
        </section>
      )}

      {/* No friends */}
      {friends.length === 0 && (
        <div className={s.empty}>
          <div className={s.emptyIcon}>👥</div>
          <div className={s.emptyTitle}>No friends yet</div>
          <div className={s.emptySub}>Add friends first, then you can call them here</div>
        </div>
      )}

      {/* ── Others available to call ── */}
      {others.length > 0 && !search && (
        <section>
          <div className={s.sectionHead} style={{ marginTop: 20 }}>
            <span className={s.onlineDot} />
            Other People Available
            <span className={s.sectionCount}>{others.length}</span>
          </div>
          <div className={s.grid}>
            {others.map(u => (
              <div key={u.id} className={s.card}>
                <Avatar user={u} size={52} online={onlineUsers.has(u.id)} />
                <div className={s.cardName}>{u.name}</div>
                {u.username && <div className={s.cardUsername}>@{u.username}</div>}
                <div className={s.cardBtns}>
                  <button className={`${s.callBtn} ${s.audioBtn}`}
                    onClick={() => callUser(u, 'audio')}
                    disabled={callingId === u.id}>
                    📞 Audio
                  </button>
                  <button className={`${s.callBtn} ${s.videoBtn}`}
                    onClick={() => callUser(u, 'video')}
                    disabled={callingId === u.id}>
                    📹
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FriendCallCard({ user: f, online, callingId, onCall }) {
  const calling = callingId === f.id
  return (
    <div className={`${s.friendCard} ${online ? s.friendOnline : ''}`}>
      <Avatar user={f} size={46} online={online} />
      <div className={s.friendInfo}>
        <div className={s.friendName}>{f.name}</div>
        <div className={s.friendStatus}>
          {online
            ? <span className={s.onlineText}>🟢 Online now</span>
            : <span className={s.offlineText}>⚫ Offline</span>
          }
        </div>
      </div>
      <div className={s.callBtns}>
        <button
          className={`${s.callIconBtn} ${s.audioCall} ${calling ? s.calling : ''}`}
          onClick={() => onCall(f, 'audio')}
          disabled={calling}
          title="Audio call"
        >
          {calling ? '📲' : '📞'}
        </button>
        <button
          className={`${s.callIconBtn} ${s.videoCall} ${calling ? s.calling : ''}`}
          onClick={() => onCall(f, 'video')}
          disabled={calling}
          title="Video call"
        >
          📹
        </button>
      </div>
    </div>
  )
}
