import { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './Admin.module.css'

const TABS = ['🚨 Flagged','👤 Users','🟢 Online','💬 Messages','📋 Reports','🏗️ Content','⚙️ System','📤 Export','⏰ Scheduled','🚫 Bans','⚠️ Warnings','🔍 Suspicious','📢 Broadcast','📣 Announcements','🔧 Maintenance','🌐 IP Block','🏆 Leaderboard','📞 Call Stats','🎁 Gifts','💝 Blocks','📊 Platform','🪪 Activity Log','📊 Stats']

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
  const [reports,      setReports]      = useState([])
  const [reportsLoading, setReportsLoading] = useState(false)
  // New tabs state
  const [content,      setContent]      = useState({posts:[],groups:[],rooms:[],stories:[]})
  const [contentTab,   setContentTab]   = useState('posts')
  const [sysSettings,  setSysSettings]  = useState(null)
  const [health,       setHealth]       = useState(null)
  const [badWords,     setBadWords]     = useState([])
  const [newBadWord,   setNewBadWord]   = useState('')
  const [bans,         setBans]         = useState([])
  const [warnings,     setWarnings]     = useState([])
  const [suspicious,   setSuspicious]   = useState([])
  const [scheduled,    setScheduled]    = useState([])
  const [dmTarget,     setDmTarget]     = useState(null)
  const [dmMsg,        setDmMsg]        = useState('')
  const [silenceHours, setSilenceHours] = useState(24)
  const [newPwd,       setNewPwd]       = useState('')
  const [selectedIds,  setSelectedIds]  = useState(new Set())
  // New tabs
  const [announcements, setAnnouncements] = useState([])
  const [annForm,  setAnnForm]   = useState({title:'',message:'',type:'info'})
  const [maintenance, setMaintenance] = useState({enabled:false,message:''})
  const [blockedIPs,  setBlockedIPs]  = useState([])
  const [newIP,       setNewIP]       = useState('')
  const [leaderboard, setLeaderboard] = useState({achievements:[],messages:[]})
  const [callStats,   setCallStats]   = useState(null)
  const [gifts,       setGifts]       = useState([])
  const [blockRels,   setBlockRels]   = useState([])
  const [platStats,   setPlatStats]   = useState(null)
  const [activityLog, setActivityLog] = useState([])

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
    if (tab !== '👤 Users') return
    setLoading(true)
    const q = search ? `&q=${encodeURIComponent(search)}` : ''
    api(`/admin/users?page=${page}&sort=${sort}&order=${order}${q}`)
      .then(r => { setUsers(r.data.users); setTotal(r.data.total); setPages(r.data.pages) })
      .catch(()=>{})
      .finally(()=>setLoading(false))
  }, [tab, page, sort, order, search]) // eslint-disable-line

  // Load online users
  useEffect(() => {
    if (tab !== '🟢 Online') return
    api('/admin/online').then(r => setOnlineUsers(r.data)).catch(()=>{})
    const interval = setInterval(() => {
      api('/admin/online').then(r => setOnlineUsers(r.data)).catch(()=>{})
    }, 10000)
    return () => clearInterval(interval)
  }, [tab]) // eslint-disable-line

  // Load messages
  useEffect(() => {
    if (tab !== '💬 Messages') return
    setMsgsLoading(true)
    const q = msgsQ ? `&q=${encodeURIComponent(msgsQ)}` : ''
    api(`/admin/messages?page=${msgsPage}${q}`)
      .then(r => { setMsgs(r.data.messages); setMsgsTotal(r.data.total); })
      .catch(()=>{})
      .finally(()=>setMsgsLoading(false))
  }, [tab, msgsPage, msgsQ]) // eslint-disable-line

  // Load reports
  useEffect(() => {
    if (tab !== '📋 Reports') return
    setReportsLoading(true)
    api('/admin/reports').then(r => setReports(r.data)).catch(()=>{}).finally(()=>setReportsLoading(false))
  }, [tab]) // eslint-disable-line

  // Load content
  useEffect(() => {
    if (tab !== '🏗️ Content') return
    api('/admin/content/posts').then(r => setContent(p => ({...p,posts:r.data.posts||[]}))).catch(()=>{})
    api('/admin/content/groups').then(r => setContent(p => ({...p,groups:r.data||[]}))).catch(()=>{})
    api('/admin/content/rooms').then(r => setContent(p => ({...p,rooms:r.data||[]}))).catch(()=>{})
    api('/admin/content/stories').then(r => setContent(p => ({...p,stories:r.data||[]}))).catch(()=>{})
  }, [tab]) // eslint-disable-line

  // Load system
  useEffect(() => {
    if (tab !== '⚙️ System') return
    api('/admin/system/settings').then(r => setSysSettings(r.data)).catch(()=>{})
    api('/admin/system/health').then(r => setHealth(r.data)).catch(()=>{})
    api('/admin/system/bad-words').then(r => setBadWords(r.data.words||[])).catch(()=>{})
  }, [tab]) // eslint-disable-line

  // Load new tabs
  useEffect(() => {
    if (tab==='📣 Announcements') api('/admin/announcements').then(r=>setAnnouncements(r.data)).catch(()=>{})
    if (tab==='🔧 Maintenance')   api('/admin/maintenance').then(r=>setMaintenance(r.data)).catch(()=>{})
    if (tab==='🌐 IP Block')      api('/admin/ip-blocks').then(r=>setBlockedIPs(r.data.blocked_ips||[])).catch(()=>{})
    if (tab==='🏆 Leaderboard') {
      api('/admin/leaderboard/achievements').then(r=>setLeaderboard(p=>({...p,achievements:r.data}))).catch(()=>{})
      api('/admin/leaderboard/messages').then(r=>setLeaderboard(p=>({...p,messages:r.data}))).catch(()=>{})
    }
    if (tab==='📞 Call Stats')  api('/admin/analytics/calls').then(r=>setCallStats(r.data)).catch(()=>{})
    if (tab==='🎁 Gifts')       api('/admin/gifts').then(r=>setGifts(r.data)).catch(()=>{})
    if (tab==='💝 Blocks')      api('/admin/blocks').then(r=>setBlockRels(r.data)).catch(()=>{})
    if (tab==='📊 Platform')    api('/admin/platform-stats').then(r=>setPlatStats(r.data)).catch(()=>{})
    if (tab==='🪪 Activity Log') api('/admin/activity-log').then(r=>setActivityLog(r.data)).catch(()=>{})
  }, [tab]) // eslint-disable-line

  // Load bans/warnings/suspicious/scheduled
  useEffect(() => {
    if (tab==='🚫 Bans')       api('/admin/bans').then(r=>setBans(r.data)).catch(()=>{})
    if (tab==='⚠️ Warnings')   api('/admin/warnings').then(r=>setWarnings(r.data)).catch(()=>{})
    if (tab==='🔍 Suspicious') api('/admin/suspicious').then(r=>setSuspicious(r.data)).catch(()=>{})
    if (tab==='⏰ Scheduled')  api('/admin/scheduled').then(r=>setScheduled(r.data)).catch(()=>{})
  }, [tab]) // eslint-disable-line

  async function warnUser(u) {
    const reason = window.prompt(`Warn ${u.name} — enter reason:`)
    if (!reason) return
    await api(`/admin/users/${u.id}/warn`, { method:'POST', data:{ reason } })
    addToast(`⚠️ Warning sent to ${u.name}`, 'success')
  }

  async function toggleVerify(u) {
    const r = await api(`/admin/users/${u.id}/verify`, { method:'POST' })
    setUsers(p => p.map(x => x.id===u.id ? {...x, is_verified:r.data.is_verified} : x))
    addToast(r.data.is_verified ? `✓ ${u.name} is now verified` : `${u.name} unverified`, 'success')
  }

  async function resolveReport(rid) {
    await api(`/admin/reports/${rid}/resolve`, { method:'POST' })
    setReports(p => p.map(r => r.id===rid ? {...r, status:'resolved'} : r))
    addToast('Report resolved', 'success')
  }

  async function silenceUser(u) {
    await api(`/admin/users/${u.id}/silence`, { method:'POST', data:{ hours:silenceHours } })
    addToast(`${u.name} silenced for ${silenceHours}h`, 'success')
  }

  async function resetPassword(u) {
    const pwd = window.prompt(`New password for ${u.name}:`, 'Reset123!')
    if (!pwd) return
    const r = await api(`/admin/users/${u.id}/reset-password`, { method:'POST', data:{ password:pwd } })
    addToast(`Password reset to: ${r.data.new_password}`, 'success')
  }

  async function sendDM(u) { setDmTarget(u); setDmMsg('') }

  async function confirmDM() {
    if (!dmMsg.trim() || !dmTarget) return
    await api(`/admin/users/${dmTarget.id}/dm`, { method:'POST', data:{ message: dmMsg } })
    addToast(`Message sent to ${dmTarget.name}`, 'success')
    setDmTarget(null)
  }

  async function giveAchievement(u) {
    const key = window.prompt('Achievement key (e.g. early_adopter, popular):')
    if (!key) return
    await api(`/admin/users/${u.id}/give-achievement`, { method:'POST', data:{ key } })
    addToast(`Achievement given to ${u.name}`, 'success')
  }

  async function addBadWord() {
    if (!newBadWord.trim()) return
    await api('/admin/system/bad-words', { method:'PUT', data:{ action:'add', word:newBadWord } })
    setBadWords(p => [...p, newBadWord.toLowerCase()])
    setNewBadWord('')
    addToast(`"${newBadWord}" added`, 'success')
  }

  async function removeBadWord(word) {
    await api('/admin/system/bad-words', { method:'PUT', data:{ action:'remove', word } })
    setBadWords(p => p.filter(w => w !== word))
  }

  async function saveSetting(key, value) {
    const r = await api('/admin/system/settings', { method:'PUT', data:{ [key]:value } })
    setSysSettings(r.data)
    addToast('Setting saved', 'success')
  }

  async function bulkBan() {
    if (selectedIds.size === 0) return
    const reason = window.prompt('Ban reason:')
    if (!reason) return
    await api('/admin/bulk/ban', { method:'POST', data:{ user_ids:[...selectedIds], reason } })
    setUsers(p => p.map(u => selectedIds.has(u.id) ? {...u, is_banned:true} : u))
    setSelectedIds(new Set())
    addToast(`Banned ${selectedIds.size} users`, 'success')
  }

  async function exportCSV() {
    const r = await api('/admin/export/users-csv', { responseType:'blob' })
    const url = URL.createObjectURL(new Blob([r.data]))
    const a = document.createElement('a'); a.href=url; a.download='users.csv'; a.click()
    addToast('Users CSV downloaded', 'success')
  }

  async function exportBackup() {
    const r = await api('/admin/export/full-backup', { responseType:'blob' })
    const url = URL.createObjectURL(new Blob([r.data]))
    const a = document.createElement('a'); a.href=url; a.download='backup.json'; a.click()
    addToast('Full backup downloaded', 'success')
  }

  async function clearAllFlagged() {
    if (!window.confirm('Mark ALL flagged messages as reviewed?')) return
    await api('/admin/flagged/clear-all', { method:'POST' })
    setFlags(p => p.map(f => ({...f, is_reviewed:1})))
    addToast('All flagged cleared', 'success')
  }

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
              <button className={`${s.actionBtn2} ${s.reviewBtn}`} style={{marginLeft:8}} onClick={clearAllFlagged}>✓ Clear All</button>
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
                              <button className={`${s.actionBtn2}`} style={{background:'rgba(99,102,241,.1)',color:'var(--accent)'}} onClick={()=>sendDM(u)} title="DM user">✉️</button>
                              <button className={`${s.actionBtn2}`} style={{background:'rgba(245,158,11,.1)',color:'var(--yellow)'}} onClick={()=>silenceUser(u)} title={`Silence ${silenceHours}h`}>🔇</button>
                              <button className={`${s.actionBtn2}`} style={{background:'rgba(245,158,11,.1)',color:'var(--yellow)'}} onClick={()=>warnUser(u)} title="Warn user">⚠️</button>
                              <button className={`${s.actionBtn2}`} style={{background:'rgba(16,185,129,.1)',color:'var(--green)'}} onClick={()=>resetPassword(u)} title="Reset password">🔑</button>
                              <button className={`${s.actionBtn2}`} style={{background:'var(--accent-soft)',color:'var(--accent)'}} onClick={()=>giveAchievement(u)} title="Give achievement">🏆</button>
                              <button className={`${s.actionBtn2}`} style={{background:u.is_verified?'var(--green-soft)':'var(--accent-soft)',color:u.is_verified?'var(--green)':'var(--accent)'}} onClick={()=>toggleVerify(u)} title={u.is_verified?'Remove verify':'Verify'}>
                                {u.is_verified?'✓':'○'}
                              </button>
                              {u.is_banned
                                ? <button className={`${s.actionBtn2} ${s.unbanBtn}`} onClick={()=>handleUnban(u)} disabled={!!actionMap[u.id]}>✅</button>
                                : <button className={`${s.actionBtn2} ${s.banBtn}`}   onClick={()=>handleBan(u)}>🚫</button>
                              }
                              {u.is_online_live && (
                                <button className={`${s.actionBtn2} ${s.kickBtn}`} onClick={()=>handleKick(u)} disabled={!!actionMap[u.id]}>⚡</button>
                              )}
                              <button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={()=>handleDeleteUser(u)} disabled={!!actionMap[u.id]}>🗑</button>
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

      {/* ══ REPORTS TAB ══ */}
      {tab==='📋 Reports' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}>
            <div className={s.tableTitle}>📋 User Reports <span className={s.totalBadge}>{reports.filter(r=>r.status==='pending').length} pending</span></div>
          </div>
          {reportsLoading ? <div className={s.loadingRow}><span className="spinner"/></div> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>Reporter</th><th>Reported</th><th>Reason</th><th>Date</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r.id}>
                      <td><div className={s.miniUser}><div className={s.miniDot} style={{background:'#6366f1'}}/>{r.reporter_name}</div></td>
                      <td><div className={s.miniUser}><div className={s.miniDot} style={{background:r.reported_color}}/>{r.reported_name}</div></td>
                      <td className={s.msgCell}>{r.reason}</td>
                      <td className={s.dateCell}>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td><span className={`${s.badge} ${r.status==='pending'?s.badgeRed:s.badgeGray}`}>{r.status}</span></td>
                      <td>
                        <div className={s.actionCell}>
                          {r.status==='pending' && <>
                            <button className={`${s.actionBtn2} ${s.banBtn}`} onClick={()=>handleBan({id:r.reported_id,name:r.reported_name,email:r.reported_email,avatar_color:r.reported_color})}>🚫 Ban</button>
                            <button className={`${s.actionBtn2} ${s.reviewBtn}`} onClick={()=>resolveReport(r.id)}>✓ Resolve</button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {reports.length===0 && <tr><td colSpan={6} className={s.noData}>No reports yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ CONTENT TAB ══ */}
      {tab==='🏗️ Content' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}>
            <div className={s.tableTitle}>🏗️ Content Management</div>
            <div style={{display:'flex',gap:6}}>
              {['posts','groups','rooms','stories'].map(ct=>(
                <button key={ct} className={`${s.pageBtn} ${contentTab===ct?s.pageActive:''}`} onClick={()=>setContentTab(ct)}>
                  {ct==='posts'?'📸':ct==='groups'?'👥':ct==='rooms'?'🌐':'📖'} {ct}
                </button>
              ))}
            </div>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              {contentTab==='posts' && <>
                <thead><tr><th>User</th><th>Content</th><th>Likes</th><th>Comments</th><th>Date</th><th>Action</th></tr></thead>
                <tbody>
                  {content.posts.map(p=>(
                    <tr key={p.id}>
                      <td><div className={s.miniUser}><div className={s.miniDot} style={{background:'#6366f1'}}/>{p.user_name}</div></td>
                      <td className={s.msgCell}>{p.image_b64?'📷 Image':p.content?.slice(0,60)||'—'}</td>
                      <td>{p.like_count}</td><td>{p.comment_count}</td>
                      <td className={s.dateCell}>{timeAgo(p.created_at)}</td>
                      <td><button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={async()=>{await api(`/admin/content/posts/${p.id}`,{method:'DELETE'});setContent(prev=>({...prev,posts:prev.posts.filter(x=>x.id!==p.id)}))}}>🗑</button></td>
                    </tr>
                  ))}
                  {content.posts.length===0&&<tr><td colSpan={6} className={s.noData}>No posts</td></tr>}
                </tbody>
              </>}
              {contentTab==='groups' && <>
                <thead><tr><th>Name</th><th>Owner</th><th>Members</th><th>Created</th><th>Action</th></tr></thead>
                <tbody>
                  {content.groups.map(g=>(
                    <tr key={g.id}>
                      <td style={{fontWeight:600}}>{g.name}</td>
                      <td>{g.owner_name}</td><td>{g.member_count}</td>
                      <td className={s.dateCell}>{timeAgo(g.created_at)}</td>
                      <td><button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={async()=>{await api(`/admin/content/groups/${g.id}`,{method:'DELETE'});setContent(prev=>({...prev,groups:prev.groups.filter(x=>x.id!==g.id)}))}}>🗑 Delete</button></td>
                    </tr>
                  ))}
                  {content.groups.length===0&&<tr><td colSpan={5} className={s.noData}>No groups</td></tr>}
                </tbody>
              </>}
              {contentTab==='rooms' && <>
                <thead><tr><th>Name</th><th>Category</th><th>Owner</th><th>Members</th><th>Action</th></tr></thead>
                <tbody>
                  {content.rooms.map(r=>(
                    <tr key={r.id}>
                      <td style={{fontWeight:600}}>{r.name}</td><td>{r.category}</td>
                      <td>{r.owner_name}</td><td>{r.member_count}</td>
                      <td><button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={async()=>{await api(`/admin/content/rooms/${r.id}`,{method:'DELETE'});setContent(prev=>({...prev,rooms:prev.rooms.filter(x=>x.id!==r.id)}))}}>🗑</button></td>
                    </tr>
                  ))}
                  {content.rooms.length===0&&<tr><td colSpan={5} className={s.noData}>No rooms</td></tr>}
                </tbody>
              </>}
              {contentTab==='stories' && <>
                <thead><tr><th>User</th><th>Content</th><th>Type</th><th>Expires</th><th>Action</th></tr></thead>
                <tbody>
                  {content.stories.map(st=>(
                    <tr key={st.id}>
                      <td>{st.user_name}</td>
                      <td className={s.msgCell}>{st.type==='image'?'📷 Image':st.content?.slice(0,40)||'—'}</td>
                      <td><span className={s.msgType}>{st.type}</span></td>
                      <td className={s.dateCell}>{new Date(st.expires_at).toLocaleDateString()}</td>
                      <td><button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={async()=>{await api(`/admin/content/stories/${st.id}`,{method:'DELETE'});setContent(prev=>({...prev,stories:prev.stories.filter(x=>x.id!==st.id)}))}}>🗑</button></td>
                    </tr>
                  ))}
                  {content.stories.length===0&&<tr><td colSpan={5} className={s.noData}>No stories</td></tr>}
                </tbody>
              </>}
            </table>
          </div>
        </div>
      )}

      {/* ══ SYSTEM TAB ══ */}
      {tab==='⚙️ System' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* Health */}
          {health && (
            <div className={s.tableCard}>
              <div className={s.tableHeader}><div className={s.tableTitle}>🖥️ Server Health</div><div className={`${s.liveBadge}`}>Live</div></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,padding:16}}>
                {[
                  {l:'Status',    v:health.status,               c:'var(--green)'},
                  {l:'Online',    v:health.online_users,         c:'var(--accent)'},
                  {l:'Disk Used', v:`${health.disk_pct}%`,       c:health.disk_pct>80?'var(--red)':'var(--green)'},
                  {l:'DB Size',   v:`${health.db_size_mb}MB`,    c:'var(--text-primary)'},
                ].map(({l,v,c})=>(
                  <div key={l} className={s.statCard} style={{padding:12,textAlign:'center'}}>
                    <div className={s.statVal} style={{color:c,fontSize:18}}>{v}</div>
                    <div className={s.statLabel}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          {sysSettings && (
            <div className={s.tableCard}>
              <div className={s.tableHeader}><div className={s.tableTitle}>⚙️ App Settings</div></div>
              <div style={{padding:16,display:'flex',flexDirection:'column',gap:10}}>
                {[
                  {key:'app_name',           label:'App Name',             type:'text'},
                  {key:'welcome_message',    label:'Welcome Message',      type:'text'},
                  {key:'allow_registration', label:'Allow Registration',   type:'bool'},
                  {key:'allow_calls',        label:'Enable Calls',         type:'bool'},
                  {key:'allow_groups',       label:'Enable Groups',        type:'bool'},
                  {key:'allow_stories',      label:'Enable Stories',       type:'bool'},
                  {key:'allow_rooms',        label:'Enable Rooms',         type:'bool'},
                  {key:'allow_gifs',         label:'Enable GIFs',          type:'bool'},
                  {key:'allow_file_sharing', label:'Enable File Sharing',  type:'bool'},
                  {key:'allow_voice_msgs',   label:'Enable Voice Messages',type:'bool'},
                  {key:'max_message_length', label:'Max Message Length',   type:'number'},
                  {key:'max_group_members',  label:'Max Group Members',    type:'number'},
                  {key:'auto_ban_threshold', label:'Auto-ban Threshold',   type:'number'},
                ].map(({key,label,type})=>(
                  <div key={key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                    <span style={{fontSize:14,fontWeight:600,color:'var(--text-primary)'}}>{label}</span>
                    {type==='bool'
                      ? <button className={`${s.actionBtn2} ${sysSettings[key]?s.unbanBtn:s.banBtn}`} onClick={()=>saveSetting(key,!sysSettings[key])}>
                          {sysSettings[key]?'✓ On':'✕ Off'}
                        </button>
                      : <input style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 10px',fontSize:13,color:'var(--text-primary)',width:160}}
                          defaultValue={sysSettings[key]}
                          onBlur={e=>saveSetting(key,type==='number'?parseInt(e.target.value):e.target.value)} />
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bad Words */}
          <div className={s.tableCard}>
            <div className={s.tableHeader}>
              <div className={s.tableTitle}>🤬 Bad Words <span className={s.totalBadge}>{badWords.length}</span></div>
            </div>
            <div style={{padding:16}}>
              <div style={{display:'flex',gap:8,marginBottom:12}}>
                <input className={s.searchInput} style={{flex:1}} placeholder="Add a new bad word..." value={newBadWord} onChange={e=>setNewBadWord(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addBadWord()} />
                <button className={`${s.actionBtn2} ${s.unbanBtn}`} onClick={addBadWord}>+ Add</button>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,maxHeight:200,overflowY:'auto'}}>
                {badWords.map(w=>(
                  <span key={w} style={{background:'var(--red-soft)',color:'var(--red)',padding:'3px 8px 3px 10px',borderRadius:12,fontSize:12,display:'flex',alignItems:'center',gap:5}}>
                    {w}
                    <button onClick={()=>removeBadWord(w)} style={{background:'none',border:'none',color:'var(--red)',fontSize:14,lineHeight:1,cursor:'pointer'}}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ EXPORT TAB ══ */}
      {tab==='📤 Export' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
          {[
            {icon:'👥',title:'Users CSV',desc:'Export all users with email, status, join date',fn:exportCSV,btn:'⬇ Download CSV'},
            {icon:'💾',title:'Full Backup',desc:'Complete backup: users, groups, rooms, reports',fn:exportBackup,btn:'⬇ Download JSON'},
            {icon:'🔍',title:'Stats Export',desc:'Analytics data for the last 30 days',fn:()=>api('/admin/analytics/detailed').then(r=>{const b=new Blob([JSON.stringify(r.data,null,2)]);const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='analytics.json';a.click()}),btn:'⬇ Analytics'},
          ].map(({icon,title,desc,fn,btn})=>(
            <div key={title} className={s.tableCard} style={{padding:20}}>
              <div style={{fontSize:28,marginBottom:8}}>{icon}</div>
              <div style={{fontSize:15,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>{title}</div>
              <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:12}}>{desc}</div>
              <button className={s.saveBtn} style={{margin:0,width:'100%'}} onClick={fn}>{btn}</button>
            </div>
          ))}
        </div>
      )}

      {/* ══ SCHEDULED TAB ══ */}
      {tab==='⏰ Scheduled' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}><div className={s.tableTitle}>⏰ Scheduled Messages <span className={s.totalBadge}>{scheduled.length}</span></div></div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>From</th><th>To</th><th>Content</th><th>Send At</th><th>Action</th></tr></thead>
              <tbody>
                {scheduled.map(m=>(
                  <tr key={m.id}>
                    <td>{m.sender_name}</td>
                    <td>{m.receiver_id||`Group ${m.group_id}`}</td>
                    <td className={s.msgCell}>{m.content}</td>
                    <td className={s.dateCell}>{new Date(m.send_at).toLocaleString()}</td>
                    <td><button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={async()=>{await api(`/admin/scheduled/${m.id}`,{method:'DELETE'});setScheduled(p=>p.filter(x=>x.id!==m.id))}}>✕ Cancel</button></td>
                  </tr>
                ))}
                {scheduled.length===0&&<tr><td colSpan={5} className={s.noData}>No scheduled messages</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ BANS TAB ══ */}
      {tab==='🚫 Bans' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}><div className={s.tableTitle}>🚫 Banned Users <span className={s.totalBadge}>{bans.length}</span></div></div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>User</th><th>Reason</th><th>Banned</th><th>Action</th></tr></thead>
              <tbody>
                {bans.map(u=>(
                  <tr key={u.id} className={s.bannedRow}>
                    <td><div className={s.userCell}><div className={s.miniAvatarCircle} style={{background:u.avatar_color}}>{u.name?.slice(0,2).toUpperCase()}</div><div><div className={s.userName}>{u.name}</div><div className={s.userEmail}>{u.email}</div></div></div></td>
                    <td className={s.msgCell}>{u.ban_reason||'—'}</td>
                    <td className={s.dateCell}>{timeAgo(u.banned_at)}</td>
                    <td><button className={`${s.actionBtn2} ${s.unbanBtn}`} onClick={()=>handleUnban(u)}>✅ Unban</button></td>
                  </tr>
                ))}
                {bans.length===0&&<tr><td colSpan={4} className={s.noData}>No banned users 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ WARNINGS TAB ══ */}
      {tab==='⚠️ Warnings' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}><div className={s.tableTitle}>⚠️ All Warnings <span className={s.totalBadge}>{warnings.length}</span></div></div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>User</th><th>Reason</th><th>By Admin</th><th>Date</th></tr></thead>
              <tbody>
                {warnings.map((w,i)=>(
                  <tr key={i}>
                    <td><div className={s.miniUser}><div className={s.miniDot} style={{background:'#f59e0b'}}/>{w.user_name}</div></td>
                    <td className={s.msgCell}>{w.reason}</td>
                    <td style={{fontSize:12,color:'var(--text-muted)'}}>{w.admin_name}</td>
                    <td className={s.dateCell}>{timeAgo(w.created_at)}</td>
                  </tr>
                ))}
                {warnings.length===0&&<tr><td colSpan={4} className={s.noData}>No warnings issued</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ SUSPICIOUS TAB ══ */}
      {tab==='🔍 Suspicious' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}><div className={s.tableTitle}>🔍 Suspicious Activity (last 1 hour)</div></div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>User</th><th>Messages in 1h</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {suspicious.map(u=>(
                  <tr key={u.id}>
                    <td><div className={s.userCell}><div className={s.miniAvatarCircle} style={{background:u.avatar_color}}>{u.name?.slice(0,2).toUpperCase()}</div><div><div className={s.userName}>{u.name}</div><div className={s.userEmail}>{u.email}</div></div></div></td>
                    <td><span style={{fontSize:20,fontWeight:800,color:'var(--red)'}}>{u.msg_count_1h}</span></td>
                    <td><span className={`${s.badge} ${u.is_online_live?s.badgeGreen:s.badgeGray}`}>{u.is_online_live?'Online':'Offline'}</span></td>
                    <td><div className={s.actionCell}>
                      <button className={`${s.actionBtn2} ${s.banBtn}`} onClick={()=>handleBan(u)}>🚫 Ban</button>
                      <button className={`${s.actionBtn2} ${s.kickBtn}`} onClick={()=>handleKick(u)}>⚡ Kick</button>
                    </div></td>
                  </tr>
                ))}
                {suspicious.length===0&&<tr><td colSpan={4} className={s.noData}>No suspicious activity detected ✅</td></tr>}
              </tbody>
            </table>
          </div>
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

      {/* ══ ANNOUNCEMENTS ══ */}
      {tab==='📣 Announcements' && (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className={s.tableCard} style={{padding:20}}>
            <div className={s.tableTitle} style={{marginBottom:12}}>📣 Create Announcement</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <input className={s.searchInput} style={{width:'100%'}} placeholder="Title" value={annForm.title} onChange={e=>setAnnForm(p=>({...p,title:e.target.value}))} />
              <textarea style={{width:'100%',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:14,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',resize:'none',minHeight:80}} placeholder="Message to all users" value={annForm.message} onChange={e=>setAnnForm(p=>({...p,message:e.target.value}))} />
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <select style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text-primary)',outline:'none'}} value={annForm.type} onChange={e=>setAnnForm(p=>({...p,type:e.target.value}))}>
                  <option value="info">ℹ️ Info</option>
                  <option value="warning">⚠️ Warning</option>
                  <option value="success">✅ Success</option>
                  <option value="error">🚨 Alert</option>
                </select>
                <button className={s.saveBtn} style={{margin:0}} onClick={async()=>{
                  const r=await api('/admin/announcements',{method:'POST',data:annForm})
                  setAnnouncements(p=>[r.data,...p])
                  setAnnForm({title:'',message:'',type:'info'})
                  addToast('Announcement sent to all users!','success')
                }}>📣 Send to All</button>
              </div>
            </div>
          </div>
          <div className={s.tableCard}>
            <div className={s.tableHeader}><div className={s.tableTitle}>Past Announcements</div></div>
            {announcements.map(a=>(
              <div key={a.id} style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:12,alignItems:'flex-start'}}>
                <span style={{fontSize:20}}>{a.type==='warning'?'⚠️':a.type==='error'?'🚨':a.type==='success'?'✅':'ℹ️'}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:'var(--text-primary)'}}>{a.title}</div>
                  <div style={{fontSize:13,color:'var(--text-secondary)',marginTop:2}}>{a.message}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{timeAgo(a.created_at)}</div>
                </div>
                <span className={`${s.badge} ${a.active?s.badgeGreen:s.badgeGray}`}>{a.active?'Active':'Inactive'}</span>
                {a.active && <button className={`${s.actionBtn2} ${s.deleteBtn}`} onClick={()=>{api('/admin/announcements',{method:'DELETE',data:{id:a.id}});setAnnouncements(p=>p.map(x=>x.id===a.id?{...x,active:false}:x))}}>Off</button>}
              </div>
            ))}
            {announcements.length===0&&<div className={s.noData} style={{padding:24}}>No announcements yet</div>}
          </div>
        </div>
      )}

      {/* ══ MAINTENANCE ══ */}
      {tab==='🔧 Maintenance' && (
        <div className={s.tableCard} style={{padding:24,maxWidth:500}}>
          <div style={{fontSize:36,marginBottom:8}}>🔧</div>
          <div style={{fontSize:18,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>Maintenance Mode</div>
          <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>When ON, all users see a maintenance screen and can't use the app</div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <span style={{fontWeight:600}}>Status:</span>
            <span className={`${s.badge} ${maintenance.enabled?s.badgeRed:s.badgeGreen}`}>{maintenance.enabled?'🔴 MAINTENANCE ON':'🟢 App is Live'}</span>
          </div>
          <textarea style={{width:'100%',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:14,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',resize:'none',marginBottom:12}} rows={2}
            value={maintenance.message} onChange={e=>setMaintenance(p=>({...p,message:e.target.value}))} placeholder="Message shown to users..." />
          <div style={{display:'flex',gap:8}}>
            <button className={`${s.actionBtn2} ${s.unbanBtn}`} style={{padding:'10px 24px',fontSize:14}} onClick={async()=>{
              const r=await api('/admin/maintenance',{method:'PUT',data:{enabled:false,message:maintenance.message}})
              setMaintenance(r.data); addToast('App is LIVE again ✅','success')
            }}>🟢 Go Live</button>
            <button className={`${s.actionBtn2} ${s.deleteBtn}`} style={{padding:'10px 24px',fontSize:14}} onClick={async()=>{
              const r=await api('/admin/maintenance',{method:'PUT',data:{enabled:true,message:maintenance.message}})
              setMaintenance(r.data); addToast('⚠️ Maintenance mode ON','warning')
            }}>🔴 Enable Maintenance</button>
          </div>
        </div>
      )}

      {/* ══ IP BLOCK ══ */}
      {tab==='🌐 IP Block' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}><div className={s.tableTitle}>🌐 Blocked IPs <span className={s.totalBadge}>{blockedIPs.length}</span></div></div>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:8}}>
            <input className={s.searchInput} style={{flex:1}} placeholder="Enter IP address to block (e.g. 192.168.1.1)" value={newIP} onChange={e=>setNewIP(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(api('/admin/ip-blocks',{method:'POST',data:{ip:newIP}}).then(()=>{setBlockedIPs(p=>[...p,newIP]);setNewIP('');addToast('IP blocked','success')}))} />
            <button className={`${s.actionBtn2} ${s.banBtn}`} onClick={()=>api('/admin/ip-blocks',{method:'POST',data:{ip:newIP}}).then(()=>{setBlockedIPs(p=>[...p,newIP]);setNewIP('');addToast('IP blocked','success')})}>🚫 Block</button>
          </div>
          <div style={{padding:16,display:'flex',flexWrap:'wrap',gap:8}}>
            {blockedIPs.map(ip=>(
              <span key={ip} style={{background:'var(--red-soft)',color:'var(--red)',padding:'5px 12px 5px 14px',borderRadius:20,fontSize:13,display:'flex',alignItems:'center',gap:6,fontWeight:600}}>
                {ip}
                <button onClick={()=>{api('/admin/ip-blocks',{method:'DELETE',data:{ip}});setBlockedIPs(p=>p.filter(x=>x!==ip))}} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:15}}>✕</button>
              </span>
            ))}
            {blockedIPs.length===0&&<div style={{color:'var(--text-muted)',fontSize:13}}>No IPs blocked</div>}
          </div>
        </div>
      )}

      {/* ══ LEADERBOARD ══ */}
      {tab==='🏆 Leaderboard' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <div className={s.tableCard}>
            <div className={s.tableHeader}><div className={s.tableTitle}>🏆 Most Achievements</div></div>
            {leaderboard.achievements.map((u,i)=>(
              <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:20,width:28,textAlign:'center',fontWeight:800,color:i<3?'var(--yellow)':'var(--text-muted)'}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`}</div>
                <div className={s.miniAvatarCircle} style={{background:u.avatar_color}}>{u.name?.slice(0,2).toUpperCase()}</div>
                <div style={{flex:1,fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{u.name}</div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--yellow)'}}>{u.achievement_count} 🏅</div>
              </div>
            ))}
          </div>
          <div className={s.tableCard}>
            <div className={s.tableHeader}><div className={s.tableTitle}>💬 Most Messages</div></div>
            {leaderboard.messages.map((u,i)=>(
              <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:20,width:28,textAlign:'center',fontWeight:800,color:i<3?'var(--accent)':'var(--text-muted)'}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`}</div>
                <div className={s.miniAvatarCircle} style={{background:u.avatar_color}}>{u.name?.slice(0,2).toUpperCase()}</div>
                <div style={{flex:1,fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{u.name}</div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--accent)'}}>{u.msg_count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ CALL STATS ══ */}
      {tab==='📞 Call Stats' && callStats && (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
            {[
              {l:'Total Calls',    v:callStats.total,             c:'#6366f1'},
              {l:'Answered',       v:callStats.answered,           c:'#22c55e'},
              {l:'Missed',         v:callStats.missed,             c:'#ef4444'},
              {l:'Avg Duration',   v:`${callStats.avg_duration_sec}s`, c:'#f59e0b'},
              {l:'Audio Calls',    v:callStats.audio_calls,        c:'#06b6d4'},
              {l:'Video Calls',    v:callStats.video_calls,        c:'#8b5cf6'},
            ].map(({l,v,c})=>(
              <div key={l} className={s.statCard}><div className={s.statVal} style={{color:c}}>{v}</div><div className={s.statLabel}>{l}</div></div>
            ))}
          </div>
          <div className={s.chartCard}>
            <div className={s.chartTitle}>📞 Calls — Last 7 Days</div>
            <div className={s.chart}>
              {callStats.days.map((d,i)=>{
                const maxV=Math.max(...callStats.days.map(x=>x.count),1)
                const h=Math.round((d.count/maxV)*100)
                return(<div key={i} className={s.chartCol}><div className={s.chartBarWrap}><div className={s.chartBar} style={{height:`${Math.max(h,d.count>0?4:0)}%`,background:'#06b6d4'}}>{d.count>0&&<span className={s.chartVal}>{d.count}</span>}</div></div><div className={s.chartLabel}>{d.day}</div></div>)
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ GIFTS ══ */}
      {tab==='🎁 Gifts' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}><div className={s.tableTitle}>🎁 Gift History <span className={s.totalBadge}>{gifts.length}</span></div></div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>From</th><th>To</th><th>Gift</th><th>Message</th><th>Date</th></tr></thead>
              <tbody>
                {gifts.map(g=>(
                  <tr key={g.id}>
                    <td style={{fontWeight:600}}>{g.sender_name}</td>
                    <td>{g.receiver_name}</td>
                    <td style={{fontSize:20}}>{g.gift_type==='rose'?'🌹':g.gift_type==='heart'?'❤️':g.gift_type==='cake'?'🎂':g.gift_type==='trophy'?'🏆':g.gift_type==='star'?'⭐':g.gift_type==='diamond'?'💎':g.gift_type==='hug'?'🤗':'🎊'}</td>
                    <td className={s.msgCell}>{g.message||'—'}</td>
                    <td className={s.dateCell}>{timeAgo(g.created_at)}</td>
                  </tr>
                ))}
                {gifts.length===0&&<tr><td colSpan={5} className={s.noData}>No gifts sent yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ BLOCK RELATIONSHIPS ══ */}
      {tab==='💝 Blocks' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}><div className={s.tableTitle}>💝 Block Relationships <span className={s.totalBadge}>{blockRels.length}</span></div></div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>Blocker</th><th>Blocked</th><th>Date</th></tr></thead>
              <tbody>
                {blockRels.map(b=>(
                  <tr key={b.id}>
                    <td><div className={s.miniUser}><div className={s.miniDot} style={{background:'#6366f1'}}/>{b.blocker_name}</div></td>
                    <td><div className={s.miniUser}><div className={s.miniDot} style={{background:'#ef4444'}}/>{b.blocked_name}</div></td>
                    <td className={s.dateCell}>{timeAgo(b.created_at)}</td>
                  </tr>
                ))}
                {blockRels.length===0&&<tr><td colSpan={3} className={s.noData}>No blocks</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ PLATFORM STATS ══ */}
      {tab==='📊 Platform' && platStats && (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {Object.entries(platStats).map(([section,data])=>(
            <div key={section} className={s.tableCard} style={{padding:16}}>
              <div style={{fontSize:14,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',marginBottom:10}}>{section}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10}}>
                {Object.entries(data).map(([k,v])=>(
                  <div key={k} style={{background:'var(--bg-secondary)',borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
                    <div style={{fontSize:20,fontWeight:800,color:'var(--text-primary)'}}>{v}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{k.replace(/_/g,' ')}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ ACTIVITY LOG ══ */}
      {tab==='🪪 Activity Log' && (
        <div className={s.tableCard}>
          <div className={s.tableHeader}><div className={s.tableTitle}>🪪 Admin Activity Log <span className={s.totalBadge}>last 50</span></div></div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>Action</th><th>Details</th><th>Time</th></tr></thead>
              <tbody>
                {activityLog.map((a,i)=>(
                  <tr key={i}>
                    <td><span className={s.msgType}>{a.action}</span></td>
                    <td className={s.msgCell}>{a.details||'—'}</td>
                    <td className={s.dateCell}>{timeAgo(a.at)}</td>
                  </tr>
                ))}
                {activityLog.length===0&&<tr><td colSpan={3} className={s.noData}>No admin actions recorded yet</td></tr>}
              </tbody>
            </table>
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

      {/* ══ DM MODAL ══ */}
      {dmTarget && (
        <div className={s.overlay} onClick={()=>setDmTarget(null)}>
          <div className={s.banModal} onClick={e=>e.stopPropagation()} style={{borderColor:'var(--accent)'}}>
            <h3 className={s.banModalTitle} style={{color:'var(--accent)'}}>✉️ Message {dmTarget.name}</h3>
            <div className={s.banUser} style={{background:'var(--accent-soft)'}}>
              <div className={s.banUserName}>{dmTarget.name}</div>
              <div className={s.banUserEmail}>{dmTarget.email}</div>
            </div>
            <textarea className={s.banInput} placeholder="Type your message..." value={dmMsg} onChange={e=>setDmMsg(e.target.value)} rows={3} autoFocus />
            <div className={s.banBtns}>
              <button className={s.cancelBtn} onClick={()=>setDmTarget(null)}>Cancel</button>
              <button className={s.confirmBanBtn} style={{background:'var(--accent)'}} onClick={confirmDM}>Send ✉️</button>
            </div>
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
