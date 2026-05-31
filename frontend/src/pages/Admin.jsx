import { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './Admin.module.css'

const TABS = ['🚨 Flagged','👤 Users','🟢 Online','💬 Messages','📢 Broadcast','📊 Stats']

const ADMIN_EMAILS = ['aariz123awais@gmail.com']
const isAdmin = (email) => ADMIN_EMAILS.includes(email?.toLowerCase())

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString([], { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })
}
function timeAgo(dt) {
  if (!dt) return 'Never'
  const diff = (Date.now() - new Date(dt+'Z')) / 1000
  if (diff < 60)    return 'Just now'
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}
function MiniBar({ value, max, color='var(--accent)' }) {
  const pct = max ? Math.round((value/max)*100) : 0
  return <div className={s.miniBarWrap}><div className={s.miniBar} style={{width:`${pct}%`,background:color}}/></div>
}

// TABS already defined above

export default function Admin() {
  const { user, api, addToast, badWordAlerts, setBadWordAlerts } = useContext(AppContext)
  const navigate = useNavigate()

  const [tab,      setTab]      = useState('🚨 Flagged')

  // Flagged tab state
  const [flags,       setFlags]       = useState([])
  const [flagsTotal,  setFlagsTotal]  = useState(0)
  const [flagsPage,   setFlagsPage]   = useState(1)
  const [onlyNew,     setOnlyNew]     = useState(true)
  const [flagsLoading,setFlagsLoading]= useState(false)
  const [stats,    setStats]    = useState(null)
  const [users,    setUsers]    = useState([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [pages,    setPages]    = useState(1)
  const [search,   setSearch]   = useState('')
  const [sort,     setSort]     = useState('created_at')
  const [order,    setOrder]    = useState('desc')
  const [loading,  setLoading]  = useState(true)

  // Online tab
  const [onlineUsers, setOnlineUsers] = useState([])

  // Messages tab
  const [msgs,      setMsgs]      = useState([])
  const [msgsTotal, setMsgsTotal] = useState(0)
  const [msgsPage,  setMsgsPage]  = useState(1)
  const [msgsQ,     setMsgsQ]     = useState('')
  const [msgsLoading, setMsgsLoading] = useState(false)

  // Broadcast
  const [broadMsg,   setBroadMsg]   = useState('')
  const [broadcasting, setBroadcasting] = useState(false)

  // User detail modal
  const [detailUser, setDetailUser] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Ban modal
  const [banTarget,  setBanTarget]  = useState(null)
  const [banReason,  setBanReason]  = useState('')
  const [banning,    setBanning]    = useState(false)

  // Action loading
  const [actionMap, setActionMap] = useState({})
  const setAction = (id, val) => setActionMap(p => ({...p, [id]: val}))

  // Guard
  useEffect(() => {
    if (user && !isAdmin(user.email)) navigate('/')
  }, [user, navigate])

  // Load flagged
  useEffect(() => {
    if (tab !== '🚨 Flagged') return
    setFlagsLoading(true)
    api(`/admin/flagged?page=${flagsPage}&unreviewed=${onlyNew?'1':'0'}`)
      .then(r => { setFlags(r.data.flags); setFlagsTotal(r.data.total) })
      .catch(()=>{})
      .finally(()=>setFlagsLoading(false))
  }, [tab, flagsPage, onlyNew]) // eslint-disable-line

  // Load stats
  useEffect(() => {
    api('/admin/stats').then(r => setStats(r.data)).catch(() => navigate('/'))
  }, []) // eslint-disable-line

  // Load users
  useEffect(() => {
    if (tab !== 'Users') return
    setLoading(true)
    const q = search ? `&q=${encodeURIComponent(search)}` : ''
    api(`/admin/users?page=${page}&sort=${sort}&order=${order}${q}`)
      .then(r => { setUsers(r.data.users); setTotal(r.data.total); setPages(r.data.pages) })
      .catch(()=>{})
      .finally(()=>setLoading(false))
  }, [tab, page, sort, order, search]) // eslint-disable-line

  // Load online users
  useEffect(() => {
    if (tab !== 'Online') return
    api('/admin/online').then(r => setOnlineUsers(r.data)).catch(()=>{})
    const interval = setInterval(() => {
      api('/admin/online').then(r => setOnlineUsers(r.data)).catch(()=>{})
    }, 10000)
    return () => clearInterval(interval)
  }, [tab]) // eslint-disable-line

  // Load messages
  useEffect(() => {
    if (tab !== 'Messages') return
    setMsgsLoading(true)
    const q = msgsQ ? `&q=${encodeURIComponent(msgsQ)}` : ''
    api(`/admin/messages?page=${msgsPage}${q}`)
      .then(r => { setMsgs(r.data.messages); setMsgsTotal(r.data.total); })
      .catch(()=>{})
      .finally(()=>setMsgsLoading(false))
  }, [tab, msgsPage, msgsQ]) // eslint-disable-line

  async function reviewFlag(fid) {
    await api(`/admin/flagged/${fid}/review`, { method:'POST' })
    setFlags(p => p.map(f => f.id===fid ? {...f, is_reviewed:1} : f))
    setBadWordAlerts(p => p.filter(a => a.flag_id !== fid))
  }

  async function banFromFlag(flag) {
    setBanTarget({ id: flag.sender_id, name: flag.sender_name, email: flag.sender_email, avatar_color: flag.sender_color })
    setBanReason(`Sent bad words: "${flag.bad_words}"`)
  }

  async function openDetail(u) {
    setDetailLoading(true)
    setDetailUser({ ...u, loading: true })
    try {
      const r = await api(`/admin/users/${u.id}/details`)
      setDetailUser(r.data)
    } catch { setDetailUser(u) }
    finally { setDetailLoading(false) }
  }

  async function handleBan(u) {
    setBanTarget(u); setBanReason('')
  }

  async function confirmBan() {
    if (!banTarget) return
    setBanning(true)
    try {
      await api(`/admin/users/${banTarget.id}/ban`, { method:'POST', data:{ reason: banReason } })
      setUsers(p => p.map(u => u.id===banTarget.id ? {...u, is_banned:true, ban_reason:banReason} : u))
      if (detailUser?.id === banTarget.id) setDetailUser(p => ({...p, is_banned:true, ban_reason:banReason}))
      addToast(`${banTarget.name} has been banned`, 'success')
      setBanTarget(null)
    } catch(e) { addToast(e.response?.data?.message||'Failed','error') }
    finally { setBanning(false) }
  }

  async function handleUnban(u) {
    setAction(u.id, 'unban')
    try {
      await api(`/admin/users/${u.id}/unban`, { method:'POST' })
      setUsers(p => p.map(x => x.id===u.id ? {...x, is_banned:false, ban_reason:null} : x))
      if (detailUser?.id === u.id) setDetailUser(p => ({...p, is_banned:false, ban_reason:null}))
      addToast(`${u.name} has been unbanned`, 'success')
    } catch { addToast('Failed','error') }
    finally { setAction(u.id, null) }
  }

  async function handleKick(u) {
    setAction(u.id, 'kick')
    try {
      const r = await api(`/admin/users/${u.id}/kick`, { method:'POST' })
      addToast(r.data.was_online ? `${u.name} has been kicked offline` : `${u.name} is not online`, 'info')
    } catch { addToast('Failed','error') }
    finally { setAction(u.id, null) }
  }

  async function handleDeleteUser(u) {
    if (!window.confirm(`Permanently delete "${u.name}"? This cannot be undone.`)) return
    setAction(u.id, 'delete')
    try {
      await api(`/admin/users/${u.id}`, { method:'DELETE' })
      setUsers(p => p.filter(x => x.id !== u.id))
      setTotal(p => p - 1)
      if (detailUser?.id === u.id) setDetailUser(null)
      addToast(`${u.name} deleted`, 'success')
    } catch(e) { addToast(e.response?.data?.message||'Failed','error') }
    finally { setAction(u.id, null) }
  }

  async function handleDeleteMsg(mid) {
    try {
      await api(`/admin/messages/${mid}`, { method:'DELETE' })
      setMsgs(p => p.filter(m => m.id !== mid))
      addToast('Message deleted', 'success')
    } catch { addToast('Failed','error') }
  }

  async function handleBroadcast(e) {
    e.preventDefault()
    if (!broadMsg.trim()) return
    setBroadcasting(true)
    try {
      const r = await api('/admin/broadcast', { method:'POST', data:{ message: broadMsg } })
      addToast(r.data.message, 'success')
      setBroadMsg('')
    } catch { addToast('Failed to broadcast','error') }
    finally { setBroadcasting(false) }
  }

  function toggleSort(col) {
    if (sort===col) setOrder(o=>o==='desc'?'asc':'desc')
    else { setSort(col); setOrder('desc') }
    setPage(1)
  }

  function SortIcon({ col }) {
    if (sort!==col) return <span className={s.sortIcon}>↕</span>
    return <span className={s.sortIcon} style={{color:'var(--accent)'}}>{order==='desc'?'↓':'↑'}</span>
  }

  if (!user || !isAdmin(user.email)) return null

  const maxMsgs    = Math.max(...users.map(u=>u.messages_count||0),1)
  const maxFriends = Math.max(...users.map(u=>u.friends_count||0),1)

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div>
          <div className={s.title}>🛡️ Admin Panel</div>
          <div className={s.subtitle}>Only visible to you · {user.email}</div>
        </div>
        <div className={s.liveTag}><span className={s.liveDot}/> Live</div>
      </div>

      {/* Quick stat strip */}
      {stats && (
        <div className={s.statsStrip}>
          {[
            {icon:'👥',v:stats.total_users,    l:'Total Users',    c:'#6366f1'},
            {icon:'🟢',v:stats.online_now,     l:'Online Now',     c:'#22c55e'},
            {icon:'🆕',v:stats.signups_today,  l:'Joined Today',   c:'#f59e0b'},
            {icon:'💬',v:stats.total_messages, l:'All Messages',   c:'#ec4899'},
            {icon:'🚫',v:users.filter(u=>u.is_banned).length, l:'Banned',c:'#ef4444'},
            {icon:'👥',v:stats.total_groups,   l:'Groups',         c:'#06b6d4'},
            {icon:'🌐',v:stats.total_rooms,    l:'Rooms',          c:'#10b981'},
            {icon:'📖',v:stats.total_stories,  l:'Active Stories', c:'#8b5cf6'},
          ].map(({icon,v,l,c})=>(
            <div key={l} className={s.strip}>
              <div className={s.stripIcon} style={{background:c+'22',color:c}}>{icon}</div>
              <div>
                <div className={s.stripVal} style={{color:c}}>{v}</div>
                <div className={s.stripLabel}>{l}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className={s.tabBar}>
        {TABS.map(t=>(
          <button key={t} className={`${s.tabBtn} ${tab===t?s.tabActive:''}`} onClick={()=>setTab(t)}>
            {t}
            {t==='🚨 Flagged' && (badWordAlerts.length > 0) && (
              <span className={s.alertBadge}>{badWordAlerts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ FLAGGED TAB ══ */}
      {tab==='🚨 Flagged' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}>
            <div className={s.tableTitle}>
              🚨 Bad Word Reports
              <span className={s.totalBadge}>{flagsTotal}</span>
              {badWordAlerts.length > 0 && (
                <span className={s.liveBadge}>🔴 {badWordAlerts.length} new</span>
              )}
            </div>
            <label className={s.toggleLabel}>
              <input type="checkbox" checked={onlyNew} onChange={e=>{setOnlyNew(e.target.checked);setFlagsPage(1)}}/>
              Show unreviewed only
            </label>
          </div>

          {/* Live alerts row */}
          {badWordAlerts.length > 0 && (
            <div className={s.liveAlerts}>
              <div className={s.liveAlertsTitle}>🔴 Live alerts (real-time)</div>
              {badWordAlerts.map((a,i)=>(
                <div key={i} className={s.liveAlert}>
                  <div className={s.liveAlertAvatar} style={{background:a.sender_color}}>
                    {a.sender_name.slice(0,2).toUpperCase()}
                  </div>
                  <div className={s.liveAlertBody}>
                    <div className={s.liveAlertUser}>
                      <strong>{a.sender_name}</strong>
                      <span className={s.liveAlertEmail}>{a.sender_email}</span>
                      <span className={s.liveAlertType}>{a.chat_type}</span>
                    </div>
                    <div className={s.liveAlertMsg}>"{a.content}"</div>
                    <div className={s.liveAlertWords}>
                      Bad words: {a.bad_words.map(w=>(
                        <span key={w} className={s.badWordTag}>{w}</span>
                      ))}
                    </div>
                  </div>
                  <div className={s.liveAlertActions}>
                    <button className={`${s.actionBtn2} ${s.banBtn}`} onClick={()=>banFromFlag(a)}>🚫 Ban</button>
                    <button className={`${s.actionBtn2} ${s.reviewBtn}`} onClick={()=>{setBadWordAlerts(p=>p.filter((_,j)=>j!==i));reviewFlag(a.flag_id)}}>✓ Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {flagsLoading ? <div className={s.loadingRow}><span className="spinner"/></div> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Message Content</th>
                    <th>Bad Words Found</th>
                    <th>Where</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map(f=>(
                    <tr key={f.id} className={f.is_reviewed ? s.reviewedRow : s.unreviewedRow}>
                      <td>
                        <div className={s.userCell}>
                          <div className={s.miniAvatarCircle} style={{background:f.sender_color}}>{f.sender_name.slice(0,2).toUpperCase()}</div>
                          <div className={s.userInfo}>
                            <div className={s.userName}>{f.sender_name} {f.sender_banned && <span className={s.bannedTag}>BANNED</span>}</div>
                            <div className={s.userEmail}>{f.sender_email}</div>
                          </div>
                        </div>
                      </td>
                      <td className={s.flagMsgCell}>"{f.content}"</td>
                      <td>
                        <div className={s.badWordsList}>
                          {f.bad_words.split(', ').map(w=>(
                            <span key={w} className={s.badWordTag}>{w}</span>
                          ))}
                        </div>
                      </td>
                      <td><span className={s.chatTypeBadge}>{f.chat_type}</span></td>
                      <td className={s.dateCell}>{timeAgo(f.created_at)}</td>
                      <td>
                        {f.is_reviewed
                          ? <span className={`${s.badge} ${s.badgeGray}`}>Reviewed</span>
                          : <span className={`${s.badge} ${s.badgeRed}`}>⚠ New</span>
                        }
                      </td>
                      <td>
                        <div className={s.actionCell}>
                          {!f.sender_banned && (
                            <button className={`${s.actionBtn2} ${s.banBtn}`}
                              onClick={()=>banFromFlag(f)}>🚫 Ban</button>
                          )}
                          {!f.is_reviewed && (
                            <button className={`${s.actionBtn2} ${s.reviewBtn}`}
                              onClick={()=>reviewFlag(f.id)}>✓ Reviewed</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {flags.length===0 && <tr><td colSpan={7} className={s.noData}>No flagged messages {onlyNew?'— all reviewed! ✅':''}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ USERS TAB ══ */}
      {tab==='👤 Users' && (

        <div className={s.tableCard}>
          <div className={s.tableHeader}>
            <div className={s.tableTitle}>All Users <span className={s.totalBadge}>{total}</span></div>
            <input className={s.searchInput} placeholder="🔍  Search name / email / @username"
              value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} />
          </div>
          {loading ? <div className={s.loadingRow}><span className="spinner"/></div> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th className={s.sortable} onClick={()=>toggleSort('created_at')}>Joined <SortIcon col="created_at"/></th>
                    <th className={s.sortable} onClick={()=>toggleSort('last_seen')}>Last Seen <SortIcon col="last_seen"/></th>
                    <th>Status</th>
                    <th>Friends</th>
                    <th>Messages</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u=>(
                    <tr key={u.id} className={`${isAdmin(u.email)?s.adminRow:''} ${u.is_banned?s.bannedRow:''}`}>
                      <td>
                        <div className={s.userCell} style={{cursor:'pointer'}} onClick={()=>openDetail(u)}>
                          <Avatar user={u} size={34} online={u.is_online_live}/>
                          <div className={s.userInfo}>
                            <div className={s.userName}>
                              {u.name}
                              {isAdmin(u.email) && <span className={s.youTag}>ADMIN</span>}
                              {u.is_banned && <span className={s.bannedTag}>BANNED</span>}
                            </div>
                            <div className={s.userEmail}>{u.email}</div>
                            {u.username && <div className={s.userUsername}>@{u.username}</div>}
                          </div>
                        </div>
                      </td>
                      <td className={s.dateCell}>{fmt(u.created_at)}</td>
                      <td className={s.dateCell}>{u.is_online_live?<span className={s.onlineTag}>🟢 Now</span>:timeAgo(u.last_seen)}</td>
                      <td>
                        {u.is_banned
                          ? <span className={`${s.badge} ${s.badgeRed}`}>Banned</span>
                          : u.is_online_live
                            ? <span className={`${s.badge} ${s.badgeGreen}`}>Online</span>
                            : <span className={`${s.badge} ${s.badgeGray}`}>Offline</span>
                        }
                      </td>
                      <td><div className={s.metaCell}><span>{u.friends_count}</span><MiniBar value={u.friends_count} max={maxFriends} color="#6366f1"/></div></td>
                      <td><div className={s.metaCell}><span>{u.messages_count}</span><MiniBar value={u.messages_count} max={maxMsgs} color="#ec4899"/></div></td>
                      <td>
                        <div className={s.actionCell}>
                          <button className={s.detailBtn} onClick={()=>openDetail(u)} title="View details">👁</button>
                          {!isAdmin(u.email) && (
                            <>
                              {u.is_banned
                                ? <button className={`${s.actionBtn2} ${s.unbanBtn}`} onClick={()=>handleUnban(u)} disabled={!!actionMap[u.id]} title="Unban">✅ Unban</button>
                                : <button className={`${s.actionBtn2} ${s.banBtn}`}   onClick={()=>handleBan(u)}   title="Ban user">🚫 Ban</button>
                              }
                              {u.is_online_live && (
                                <button className={`${s.actionBtn2} ${s.kickBtn}`} onClick={()=>handleKick(u)} disabled={!!actionMap[u.id]} title="Kick offline">⚡ Kick</button>
                              )}
                              <button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={()=>handleDeleteUser(u)} disabled={!!actionMap[u.id]} title="Delete user">🗑 Delete</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length===0 && <tr><td colSpan={7} className={s.noData}>No users found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {pages>1 && (
            <div className={s.pagination}>
              <button className={s.pageBtn} disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
              {Array.from({length:pages},(_,i)=>i+1).map(p=>(
                <button key={p} className={`${s.pageBtn} ${p===page?s.pageActive:''}`} onClick={()=>setPage(p)}>{p}</button>
              ))}
              <button className={s.pageBtn} disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Next →</button>
            </div>
          )}
        </div>
      )}

      {/* ══ ONLINE TAB ══ */}
      {tab==='🟢 Online' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}>
            <div className={s.tableTitle}>🟢 Online Right Now <span className={s.totalBadge}>{onlineUsers.length}</span></div>
            <div className={s.refreshNote}>Auto-refreshes every 10s</div>
          </div>
          {onlineUsers.length===0 ? (
            <div className={s.noData} style={{padding:40}}>No users online right now</div>
          ) : (
            <div className={s.onlineGrid}>
              {onlineUsers.map(u=>(
                <div key={u.id} className={s.onlineCard}>
                  <Avatar user={u} size={44} online/>
                  <div className={s.onlineCardInfo}>
                    <div className={s.onlineCardName}>{u.name}</div>
                    <div className={s.onlineCardEmail}>{u.email}</div>
                    {isAdmin(u.email) && <span className={s.youTag}>ADMIN</span>}
                  </div>
                  {!isAdmin(u.email) && (
                    <button className={`${s.actionBtn2} ${s.kickBtn}`} onClick={()=>handleKick(u)}>⚡ Kick</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ MESSAGES TAB ══ */}
      {tab==='💬 Messages' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}>
            <div className={s.tableTitle}>💬 All Messages <span className={s.totalBadge}>{msgsTotal}</span></div>
            <input className={s.searchInput} placeholder="🔍  Search message content"
              value={msgsQ} onChange={e=>{setMsgsQ(e.target.value);setMsgsPage(1)}} />
          </div>
          {msgsLoading ? <div className={s.loadingRow}><span className="spinner"/></div> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>From</th><th>To</th><th>Message</th><th>Type</th><th>Time</th><th>Action</th></tr></thead>
                <tbody>
                  {msgs.map(m=>(
                    <tr key={m.id}>
                      <td><div className={s.miniUser}><div className={s.miniDot} style={{background:m.sender_color}}/>{m.sender_name}</div></td>
                      <td><div className={s.miniUser}><div className={s.miniDot} style={{background:m.receiver_color}}/>{m.receiver_name}</div></td>
                      <td className={s.msgCell}>
                        {m.msg_type==='image'?'📷 Photo':m.msg_type==='audio'?'🎤 Voice':m.content||'—'}
                      </td>
                      <td><span className={s.msgType}>{m.msg_type}</span></td>
                      <td className={s.dateCell}>{timeAgo(m.created_at)}</td>
                      <td><button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={()=>handleDeleteMsg(m.id)}>🗑</button></td>
                    </tr>
                  ))}
                  {msgs.length===0 && <tr><td colSpan={6} className={s.noData}>No messages found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ BROADCAST TAB ══ */}
      {tab==='📢 Broadcast' && (
        <div className={s.broadcastCard}>
          <h2 className={s.broadcastTitle}>📢 Broadcast Message</h2>
          <p className={s.broadcastSub}>Send an alert to every user who is currently online. They'll see it as a toast notification.</p>
          <form onSubmit={handleBroadcast} className={s.broadcastForm}>
            <textarea
              className={s.broadcastInput}
              placeholder="Type your announcement here… e.g. 'Server maintenance in 10 minutes'"
              value={broadMsg}
              onChange={e=>setBroadMsg(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <div className={s.broadcastFooter}>
              <span className={s.charCount}>{broadMsg.length}/500</span>
              <button type="submit" className={s.broadcastBtn} disabled={!broadMsg.trim()||broadcasting}>
                {broadcasting ? <><span className="spinner"/> Sending…</> : '📢 Send to All Online Users'}
              </button>
            </div>
          </form>
          <div className={s.broadcastTips}>
            <div className={s.tipTitle}>💡 Tips</div>
            <ul className={s.tipList}>
              <li>Only users who are currently online will see this message immediately</li>
              <li>The message appears as an orange warning notification</li>
              <li>Use this for: maintenance warnings, new features, announcements</li>
            </ul>
          </div>
        </div>
      )}

      {/* ══ STATS TAB ══ */}
      {tab==='📊 Stats' && stats && (
        <div className={s.statsTab}>
          <div className={s.statsGrid}>
            {[
              {icon:'👥',v:stats.total_users,    l:'Total Users',       c:'#6366f1'},
              {icon:'🟢',v:stats.online_now,     l:'Online Now',        c:'#22c55e'},
              {icon:'🆕',v:stats.signups_today,  l:'Signups Today',     c:'#f59e0b'},
              {icon:'📅',v:stats.signups_week,   l:'Signups This Week', c:'#3b82f6'},
              {icon:'💬',v:stats.msgs_today,     l:'Messages Today',    c:'#ec4899'},
              {icon:'📨',v:stats.total_messages, l:'Total Messages',    c:'#8b5cf6'},
              {icon:'👥',v:stats.total_groups,   l:'Groups',            c:'#06b6d4'},
              {icon:'🌐',v:stats.total_rooms,    l:'Public Rooms',      c:'#10b981'},
              {icon:'📖',v:stats.total_stories,  l:'Active Stories',    c:'#f59e0b'},
            ].map(({icon,v,l,c})=>(
              <div key={l} className={s.statCard}>
                <div className={s.statIcon} style={{background:c+'22',color:c}}>{icon}</div>
                <div>
                  <div className={s.statValue} style={{color:c}}>{v}</div>
                  <div className={s.statLabel}>{l}</div>
                </div>
              </div>
            ))}
          </div>
          <div className={s.chartCard}>
            <div className={s.chartTitle}>📈 Signups — Last 14 Days</div>
            <div className={s.chart}>
              {stats.signups_chart.map((d,i)=>{
                const maxVal=Math.max(...stats.signups_chart.map(x=>x.count),1)
                const h=Math.round((d.count/maxVal)*100)
                return(
                  <div key={i} className={s.chartCol}>
                    <div className={s.chartBarWrap}>
                      <div className={s.chartBar} style={{height:`${Math.max(h,d.count>0?4:0)}%`}}>
                        {d.count>0&&<span className={s.chartVal}>{d.count}</span>}
                      </div>
                    </div>
                    <div className={s.chartLabel}>{d.day.split(' ')[1]}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ USER DETAIL MODAL ══ */}
      {detailUser && (
        <div className={s.overlay} onClick={()=>setDetailUser(null)}>
          <div className={s.detailModal} onClick={e=>e.stopPropagation()}>
            <div className={s.detailHeader}>
              <h2 className={s.detailTitle}>User Details</h2>
              <button className={s.closeBtn} onClick={()=>setDetailUser(null)}>✕</button>
            </div>
            {detailLoading ? (
              <div className={s.loadingRow}><span className="spinner"/></div>
            ) : (
              <div className={s.detailBody}>
                <div className={s.detailTop}>
                  <Avatar user={detailUser} size={64} online={detailUser.is_online_live}/>
                  <div className={s.detailInfo}>
                    <div className={s.detailName}>
                      {detailUser.name}
                      {isAdmin(detailUser.email) && <span className={s.youTag}>ADMIN</span>}
                      {detailUser.is_banned && <span className={s.bannedTag}>BANNED</span>}
                    </div>
                    <div className={s.detailEmail}>{detailUser.email}</div>
                    {detailUser.username && <div className={s.detailUsername}>@{detailUser.username}</div>}
                    {detailUser.bio && <div className={s.detailBio}>{detailUser.bio}</div>}
                  </div>
                </div>

                <div className={s.detailStats}>
                  {[
                    {l:'Joined',      v:fmt(detailUser.created_at)},
                    {l:'Last Seen',   v:detailUser.is_online_live?'🟢 Online now':timeAgo(detailUser.last_seen)},
                    {l:'Phone',       v:detailUser.phone||'—'},
                    {l:'Friends',     v:detailUser.friends_count},
                    {l:'Msgs Sent',   v:detailUser.msgs_sent},
                    {l:'Msgs Rcvd',   v:detailUser.msgs_received},
                    {l:'Groups',      v:detailUser.groups_count},
                    {l:'Rooms',       v:detailUser.rooms_count},
                    {l:'Stories',     v:detailUser.stories_count},
                  ].map(({l,v})=>(
                    <div key={l} className={s.detailStatRow}>
                      <span className={s.detailStatLabel}>{l}</span>
                      <span className={s.detailStatValue}>{v}</span>
                    </div>
                  ))}
                </div>

                {detailUser.is_banned && (
                  <div className={s.banInfo}>
                    🚫 <strong>Ban reason:</strong> {detailUser.ban_reason}<br/>
                    <span className={s.banDate}>Banned on: {fmt(detailUser.banned_at)}</span>
                  </div>
                )}

                {detailUser.recent_msgs?.length > 0 && (
                  <div className={s.recentMsgs}>
                    <div className={s.recentMsgsTitle}>Recent Messages</div>
                    {detailUser.recent_msgs.map((m,i)=>(
                      <div key={i} className={s.recentMsg}>
                        <span className={s.recentMsgPeer}>→ {m.peer_name}</span>
                        <span className={s.recentMsgContent}>{m.msg_type==='image'?'📷 Photo':m.msg_type==='audio'?'🎤 Voice':m.content}</span>
                        <span className={s.recentMsgTime}>{timeAgo(m.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {!isAdmin(detailUser.email) && (
                  <div className={s.detailActions}>
                    {detailUser.is_banned
                      ? <button className={`${s.actionBtn2} ${s.unbanBtn}`} onClick={()=>{handleUnban(detailUser);setDetailUser(null)}}>✅ Unban User</button>
                      : <button className={`${s.actionBtn2} ${s.banBtn}`} onClick={()=>{handleBan(detailUser);setDetailUser(null)}}>🚫 Ban User</button>
                    }
                    {detailUser.is_online_live && (
                      <button className={`${s.actionBtn2} ${s.kickBtn}`} onClick={()=>handleKick(detailUser)}>⚡ Kick Offline</button>
                    )}
                    <button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={()=>{handleDeleteUser(detailUser);setDetailUser(null)}}>🗑 Delete Account</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ BAN MODAL ══ */}
      {banTarget && (
        <div className={s.overlay} onClick={()=>setBanTarget(null)}>
          <div className={s.banModal} onClick={e=>e.stopPropagation()}>
            <h3 className={s.banModalTitle}>🚫 Ban User</h3>
            <div className={s.banUser}>
              <Avatar user={banTarget} size={40}/>
              <div>
                <div className={s.banUserName}>{banTarget.name}</div>
                <div className={s.banUserEmail}>{banTarget.email}</div>
              </div>
            </div>
            <label className={s.banLabel}>Reason for ban</label>
            <textarea
              className={s.banInput}
              placeholder="e.g. Spamming, inappropriate content, harassment…"
              value={banReason}
              onChange={e=>setBanReason(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className={s.banBtns}>
              <button className={s.cancelBtn} onClick={()=>setBanTarget(null)}>Cancel</button>
              <button className={s.confirmBanBtn} onClick={confirmBan} disabled={banning}>
                {banning?<span className="spinner"/>:'🚫 Confirm Ban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
