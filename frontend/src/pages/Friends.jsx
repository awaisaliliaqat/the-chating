import { useState, useEffect, useContext, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { getSocket } from '../utils/socket'
import Avatar from '../components/Avatar'
import s from './Friends.module.css'

export default function Friends() {
  const { api, onlineUsers, startCall, user, setUser, addToast } = useContext(AppContext)
  const navigate = useNavigate()

  const [tab,       setTab]       = useState('find')   // find | friends | requests
  const [friends,   setFriends]   = useState([])
  const [requests,  setRequests]  = useState({ incoming: [], outgoing: [] })
  const [suggested, setSuggested] = useState([])       // all users (no search needed)
  const [search,    setSearch]    = useState('')
  const [loadingMap, setLoadingMap] = useState({})     // { userId: true/false }
  const [initialLoading, setInitialLoading] = useState(true)

  // ── Load data ─────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    try {
      const [fr, req, sug] = await Promise.all([
        api('/friends'),
        api('/friends/requests'),
        api('/users/suggested'),
      ])
      setFriends(fr.data)
      setRequests(req.data)
      setSuggested(sug.data)
    } catch { /* silent */ }
    finally { setInitialLoading(false) }
  }, []) // eslint-disable-line

  useEffect(() => { reload() }, []) // eslint-disable-line

  // ── Real-time socket events ───────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    // Someone accepted OUR request → move them to friends list
    const onAccepted = (u) => {
      setRequests(p => ({ ...p, outgoing: p.outgoing.filter(r => r.id !== u.id) }))
      setFriends(p => p.find(f => f.id === u.id) ? p : [...p, u])
      setSuggested(p => p.map(x => x.id === u.id
        ? { ...x, friendship_status: 'accepted' } : x))
      setUser(u2 => ({ ...u2, friends_count: (u2.friends_count || 0) + 1 }))
    }

    // Someone sent US a request → update their card + add to incoming
    const onRequest = (fromUser) => {
      setSuggested(p => p.map(x => x.id === fromUser.id
        ? { ...x, friendship_status: 'pending', friendship_mine: false, friendship_id: fromUser.f_id || x.friendship_id }
        : x))
      setRequests(p => ({
        ...p,
        incoming: p.incoming.find(r => r.id === fromUser.id)
          ? p.incoming
          : [...p.incoming, { ...fromUser, f_id: fromUser.f_id }]
      }))
      setUser(u => ({ ...u, pending_requests: (u.pending_requests || 0) + 1 }))
    }

    socket.on('friend_accepted', onAccepted)
    socket.on('friend_request',  onRequest)
    return () => {
      socket.off('friend_accepted', onAccepted)
      socket.off('friend_request',  onRequest)
    }
  }, []) // eslint-disable-line

  // ── Helper: set loading state per user ───────────────────────────────────
  const setLoading = (id, val) =>
    setLoadingMap(p => ({ ...p, [id]: val }))

  // ── Actions ───────────────────────────────────────────────────────────────
  async function sendRequest(targetId) {
    setLoading(targetId, true)
    try {
      await api(`/friends/request/${targetId}`, { method: 'POST' })
      setSuggested(p => p.map(u => u.id === targetId
        ? { ...u, friendship_status: 'pending', friendship_mine: true }
        : u))
      addToast('Friend request sent!', 'success')
    } catch(e) {
      addToast(e.response?.data?.message || 'Could not send request', 'error')
    } finally { setLoading(targetId, false) }
  }

  async function cancelRequest(targetId) {
    setLoading(targetId, true)
    try {
      await api(`/friends/${targetId}/cancel`, { method: 'DELETE' })
      setSuggested(p => p.map(u => u.id === targetId
        ? { ...u, friendship_status: null, friendship_mine: null }
        : u))
      setRequests(p => ({ ...p, outgoing: p.outgoing.filter(r => r.id !== targetId) }))
    } finally { setLoading(targetId, false) }
  }

  async function acceptRequest(fid, userId) {
    setLoading(userId, true)
    try {
      await api(`/friends/${fid}/accept`, { method: 'POST' })
      const accepted = requests.incoming.find(r => r.f_id === fid)
      if (accepted) {
        setFriends(p => [...p, accepted])
        setRequests(p => ({ ...p, incoming: p.incoming.filter(r => r.f_id !== fid) }))
        setSuggested(p => p.map(u => u.id === userId
          ? { ...u, friendship_status: 'accepted' } : u))
        setUser(u => ({
          ...u,
          pending_requests: Math.max(0, (u.pending_requests || 0) - 1),
          friends_count:    (u.friends_count || 0) + 1,
        }))
        addToast('Friend request accepted!', 'success')
      }
    } finally { setLoading(userId, false) }
  }

  async function declineRequest(fid, userId) {
    setLoading(userId, true)
    try {
      await api(`/friends/${fid}/decline`, { method: 'POST' })
      setRequests(p => ({ ...p, incoming: p.incoming.filter(r => r.f_id !== fid) }))
      setSuggested(p => p.map(u => u.id === userId
        ? { ...u, friendship_status: null, friendship_mine: null }
        : u))
      setUser(u => ({ ...u, pending_requests: Math.max(0, (u.pending_requests || 0) - 1) }))
    } finally { setLoading(userId, false) }
  }

  async function removeFriend(targetId) {
    if (!window.confirm('Remove this friend?')) return
    setLoading(targetId, true)
    try {
      await api(`/friends/${targetId}/remove`, { method: 'DELETE' })
      setFriends(p => p.filter(f => f.id !== targetId))
      setSuggested(p => p.map(u => u.id === targetId
        ? { ...u, friendship_status: null, friendship_mine: null }
        : u))
      setUser(u => ({ ...u, friends_count: Math.max(0, (u.friends_count || 0) - 1) }))
      addToast('Friend removed', 'info')
    } finally { setLoading(targetId, false) }
  }

  // ── Filtered lists ────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim()
  const filteredFriends = friends.filter(f =>
    !q || f.name.toLowerCase().includes(q) || (f.email || '').toLowerCase().includes(q)
  )
  const filteredSuggested = suggested.filter(u =>
    !q || u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
  )

  const pendingCount = requests.incoming.length

  // ── Action button for a user card ─────────────────────────────────────────
  function ActionBtn({ u }) {
    const busy = loadingMap[u.id]
    if (u.friendship_status === 'accepted') return (
      <button className={`${s.btn} ${s.msgBtn}`}
        onClick={() => navigate(`/messages/${u.id}`)}>
        💬 Message
      </button>
    )
    if (u.friendship_status === 'pending' && u.friendship_mine) return (
      <button className={`${s.btn} ${s.pendingBtn}`}
        onClick={() => cancelRequest(u.id)} disabled={busy}>
        {busy ? <span className="spinner" /> : '⏳ Pending'}
      </button>
    )
    if (u.friendship_status === 'pending' && !u.friendship_mine) return (
      <div className={s.twoBtn}>
        <button className={`${s.btn} ${s.acceptBtn}`}
          onClick={() => acceptRequest(u.friendship_id, u.id)} disabled={busy}>
          {busy ? <span className="spinner" /> : '✓ Accept'}
        </button>
        <button className={`${s.btn} ${s.declineBtn}`}
          onClick={() => declineRequest(u.friendship_id, u.id)} disabled={busy}>
          ✕
        </button>
      </div>
    )
    return (
      <button className={`${s.btn} ${s.addBtn}`}
        onClick={() => sendRequest(u.id)} disabled={busy}>
        {busy ? <span className="spinner" /> : '+ Add Friend'}
      </button>
    )
  }

  if (initialLoading) return (
    <div className={s.loading}><span className="spinner" style={{width:32,height:32,borderWidth:3}} /></div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={s.page}>

      {/* ── Page header ── */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.title}>Friends</h1>
          <p className={s.subtitle}>{friends.length} friends · {onlineUsers.size} people online</p>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className={s.tabBar}>
        <button
          className={`${s.tabBtn} ${tab === 'find' ? s.tabActive : ''}`}
          onClick={() => setTab('find')}
        >
          🔍 Find People
        </button>
        <button
          className={`${s.tabBtn} ${tab === 'friends' ? s.tabActive : ''}`}
          onClick={() => setTab('friends')}
        >
          👥 My Friends
          {friends.length > 0 && <span className={s.tabCount}>{friends.length}</span>}
        </button>
        <button
          className={`${s.tabBtn} ${tab === 'requests' ? s.tabActive : ''}`}
          onClick={() => setTab('requests')}
        >
          📨 Requests
          {pendingCount > 0 && <span className={`${s.tabCount} ${s.tabAlert}`}>{pendingCount}</span>}
        </button>
      </div>

      {/* ── Search bar (visible on find + friends tabs) ── */}
      {(tab === 'find' || tab === 'friends') && (
        <div className={s.searchRow}>
          <div className={s.searchBox}>
            <span className={s.searchIcon}>🔍</span>
            <input
              className={s.searchInput}
              placeholder={tab === 'find' ? 'Search by name or email…' : 'Filter friends…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus={tab === 'find'}
            />
            {search && (
              <button className={s.clearBtn} onClick={() => setSearch('')}>✕</button>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ FIND PEOPLE TAB ══════════════ */}
      {tab === 'find' && (
        <div className={s.content}>
          {/* Online people first */}
          {!search && (
            <div className={s.sectionHead}>
              <span className={s.sectionDot} />
              People online now
              <span className={s.sectionCount}>
                {filteredSuggested.filter(u => onlineUsers.has(u.id)).length}
              </span>
            </div>
          )}

          {filteredSuggested.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyEmoji}>🔍</div>
              <div className={s.emptyTitle}>No results for "{search}"</div>
              <div className={s.emptySub}>Try a different name or email</div>
            </div>
          ) : (
            <div className={s.grid}>
              {/* Sort: online first, then alphabetical */}
              {[...filteredSuggested]
                .sort((a, b) => {
                  const ao = onlineUsers.has(a.id) ? 0 : 1
                  const bo = onlineUsers.has(b.id) ? 0 : 1
                  if (ao !== bo) return ao - bo
                  return a.name.localeCompare(b.name)
                })
                .map(u => (
                  <div key={u.id} className={`${s.userCard} ${u.friendship_status === 'accepted' ? s.isFriend : ''}`}>
                    <div className={s.cardTop}>
                      <Avatar user={u} size={54} online={onlineUsers.has(u.id)} />
                      {onlineUsers.has(u.id) && (
                        <span className={s.onlinePill}>● Online</span>
                      )}
                    </div>
                    <div className={s.cardName}>{u.name}</div>
                    <div className={s.cardEmail}>{u.email}</div>
                    {u.bio && <div className={s.cardBio}>{u.bio}</div>}
                    <div className={s.cardFoot}>
                      <ActionBtn u={u} />
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* ══════════════ MY FRIENDS TAB ══════════════ */}
      {tab === 'friends' && (
        <div className={s.content}>
          {filteredFriends.length === 0 && !search ? (
            <div className={s.empty}>
              <div className={s.emptyEmoji}>👥</div>
              <div className={s.emptyTitle}>No friends yet</div>
              <div className={s.emptySub}>Find people and send them a friend request!</div>
              <button className={`${s.btn} ${s.addBtn}`} style={{marginTop:8}} onClick={() => setTab('find')}>
                + Find People
              </button>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyEmoji}>🔍</div>
              <div className={s.emptyTitle}>No friends match "{search}"</div>
            </div>
          ) : (
            <div className={s.list}>
              {filteredFriends.map(f => (
                <div key={f.id} className={s.friendRow}>
                  <Avatar user={f} size={48} online={onlineUsers.has(f.id)} />
                  <div className={s.friendInfo}>
                    <div className={s.friendName}>{f.name}</div>
                    <div className={s.friendSub}>
                      {onlineUsers.has(f.id)
                        ? <span className={s.onlineText}>● Active now</span>
                        : <span>{f.phone || f.email || 'Friend'}</span>
                      }
                    </div>
                  </div>
                  <div className={s.friendActions}>
                    <button
                      className={s.actionIcon}
                      onClick={() => navigate(`/messages/${f.id}`)}
                      title="Message"
                    >💬</button>
                    <button
                      className={s.actionIcon}
                      onClick={() => startCall(f.id, 'audio')}
                      title="Audio call"
                    >📞</button>
                    <button
                      className={s.actionIcon}
                      onClick={() => startCall(f.id, 'video')}
                      title="Video call"
                    >📹</button>
                    <button
                      className={`${s.actionIcon} ${s.removeIcon}`}
                      onClick={() => removeFriend(f.id)}
                      disabled={loadingMap[f.id]}
                      title="Remove friend"
                    >
                      {loadingMap[f.id] ? <span className="spinner" style={{width:14,height:14}} /> : '🗑'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ REQUESTS TAB ══════════════ */}
      {tab === 'requests' && (
        <div className={s.content}>
          {/* Incoming */}
          {requests.incoming.length > 0 && (
            <div className={s.reqSection}>
              <div className={s.reqSectionTitle}>
                📥 Incoming Requests
                <span className={s.reqCount}>{requests.incoming.length}</span>
              </div>
              <div className={s.list}>
                {requests.incoming.map(r => (
                  <div key={r.f_id} className={s.reqCard}>
                    <Avatar user={r} size={48} online={onlineUsers.has(r.id)} />
                    <div className={s.friendInfo}>
                      <div className={s.friendName}>{r.name}</div>
                      <div className={s.friendSub}>{r.email}</div>
                    </div>
                    <div className={s.reqActions}>
                      <button
                        className={`${s.btn} ${s.acceptBtn}`}
                        onClick={() => acceptRequest(r.f_id, r.id)}
                        disabled={loadingMap[r.id]}
                      >
                        {loadingMap[r.id] ? <span className="spinner" /> : '✓ Accept'}
                      </button>
                      <button
                        className={`${s.btn} ${s.declineBtn2}`}
                        onClick={() => declineRequest(r.f_id, r.id)}
                        disabled={loadingMap[r.id]}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outgoing */}
          {requests.outgoing.length > 0 && (
            <div className={s.reqSection}>
              <div className={s.reqSectionTitle}>
                📤 Sent Requests
                <span className={s.reqCount}>{requests.outgoing.length}</span>
              </div>
              <div className={s.list}>
                {requests.outgoing.map(r => (
                  <div key={r.f_id} className={s.reqCard}>
                    <Avatar user={r} size={48} online={onlineUsers.has(r.id)} />
                    <div className={s.friendInfo}>
                      <div className={s.friendName}>{r.name}</div>
                      <div className={s.friendSub}>{r.email}</div>
                    </div>
                    <div className={s.reqActions}>
                      <button
                        className={`${s.btn} ${s.pendingBtn}`}
                        onClick={() => cancelRequest(r.id)}
                        disabled={loadingMap[r.id]}
                      >
                        {loadingMap[r.id] ? <span className="spinner" /> : '⏳ Cancel'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {requests.incoming.length === 0 && requests.outgoing.length === 0 && (
            <div className={s.empty}>
              <div className={s.emptyEmoji}>📭</div>
              <div className={s.emptyTitle}>No pending requests</div>
              <div className={s.emptySub}>When someone sends you a request, it'll show up here</div>
              <button className={`${s.btn} ${s.addBtn}`} style={{marginTop:8}} onClick={() => setTab('find')}>
                + Find People
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
