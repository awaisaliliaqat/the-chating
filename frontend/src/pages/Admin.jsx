import { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './Admin.module.css'

const ADMIN_EMAILS = ['anas.wahab@tmcltd.ai', 'aariz123awais@gmail.com']
const isAdmin = (email) => ADMIN_EMAILS.includes(email?.toLowerCase())

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function timeAgo(dt) {
  if (!dt) return 'Never'
  const d = new Date(dt + 'Z'), diff = (Date.now() - d) / 1000
  if (diff < 60)    return 'Just now'
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

function MiniBar({ value, max, color = 'var(--accent)' }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className={s.miniBarWrap}>
      <div className={s.miniBar} style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function Admin() {
  const { user, api } = useContext(AppContext)
  const navigate = useNavigate()

  const [stats,   setStats]   = useState(null)
  const [users,   setUsers]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [pages,   setPages]   = useState(1)
  const [search,  setSearch]  = useState('')
  const [sort,    setSort]    = useState('created_at')
  const [order,   setOrder]   = useState('desc')
  const [loading, setLoading] = useState(true)
  const [deleting,setDeleting]= useState(null)

  // Guard — redirect if not admin
  useEffect(() => {
    if (user && !isAdmin(user.email)) {
      navigate('/')
    }
  }, [user, navigate])

  // Load stats
  useEffect(() => {
    api('/admin/stats').then(r => setStats(r.data)).catch(() => navigate('/'))
  }, []) // eslint-disable-line

  // Load users
  useEffect(() => {
    setLoading(true)
    const q = search ? `&q=${encodeURIComponent(search)}` : ''
    api(`/admin/users?page=${page}&sort=${sort}&order=${order}${q}`)
      .then(r => {
        setUsers(r.data.users)
        setTotal(r.data.total)
        setPages(r.data.pages)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, sort, order, search]) // eslint-disable-line

  async function handleDelete(u) {
    if (!window.confirm(`Permanently delete "${u.name}" (${u.email})? This cannot be undone.`)) return
    setDeleting(u.id)
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' })
      setUsers(p => p.filter(x => x.id !== u.id))
      setTotal(p => p - 1)
    } catch(e) {
      alert(e.response?.data?.message || 'Delete failed')
    } finally { setDeleting(null) }
  }

  function toggleSort(col) {
    if (sort === col) setOrder(o => o === 'desc' ? 'asc' : 'desc')
    else { setSort(col); setOrder('desc') }
    setPage(1)
  }

  function SortIcon({ col }) {
    if (sort !== col) return <span className={s.sortIcon}>↕</span>
    return <span className={s.sortIcon} style={{ color: 'var(--accent)' }}>{order === 'desc' ? '↓' : '↑'}</span>
  }

  if (!user || !isAdmin(user.email)) return null

  const maxMsgs = Math.max(...users.map(u => u.messages_count || 0), 1)
  const maxFriends = Math.max(...users.map(u => u.friends_count || 0), 1)

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div>
          <div className={s.title}>🛡️ Admin Panel</div>
          <div className={s.subtitle}>Only visible to you · {user.email}</div>
        </div>
        <div className={s.liveTag}>
          <span className={s.liveDot} /> Live
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <>
          <div className={s.statsGrid}>
            {[
              { label: 'Total Users',    value: stats.total_users,    icon: '👥', color: '#6366f1' },
              { label: 'Online Now',     value: stats.online_now,     icon: '🟢', color: '#22c55e' },
              { label: 'New Today',      value: stats.signups_today,  icon: '🆕', color: '#f59e0b' },
              { label: 'New This Week',  value: stats.signups_week,   icon: '📅', color: '#3b82f6' },
              { label: 'Messages Today', value: stats.msgs_today,     icon: '💬', color: '#ec4899' },
              { label: 'Total Messages', value: stats.total_messages, icon: '📨', color: '#8b5cf6' },
              { label: 'Groups',         value: stats.total_groups,   icon: '👥', color: '#06b6d4' },
              { label: 'Public Rooms',   value: stats.total_rooms,    icon: '🌐', color: '#10b981' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className={s.statCard}>
                <div className={s.statIcon} style={{ background: color + '22', color }}>{icon}</div>
                <div>
                  <div className={s.statValue} style={{ color }}>{value}</div>
                  <div className={s.statLabel}>{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Signups chart */}
          <div className={s.chartCard}>
            <div className={s.chartTitle}>📈 Signups — Last 14 Days</div>
            <div className={s.chart}>
              {stats.signups_chart.map((d, i) => {
                const maxVal = Math.max(...stats.signups_chart.map(x => x.count), 1)
                const h = Math.round((d.count / maxVal) * 100)
                return (
                  <div key={i} className={s.chartCol}>
                    <div className={s.chartBarWrap}>
                      <div className={s.chartBar} style={{ height: `${Math.max(h, d.count > 0 ? 4 : 0)}%` }}>
                        {d.count > 0 && <span className={s.chartVal}>{d.count}</span>}
                      </div>
                    </div>
                    <div className={s.chartLabel}>{d.day.split(' ')[1]}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Users table */}
      <div className={s.tableCard}>
        <div className={s.tableHeader}>
          <div className={s.tableTitle}>👤 All Users <span className={s.totalBadge}>{total}</span></div>
          <input
            className={s.searchInput}
            placeholder="🔍  Search by name, email or @username"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        {loading ? (
          <div className={s.loadingRow}><span className="spinner" /></div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th className={s.sortable} onClick={() => toggleSort('created_at')}>
                    Joined <SortIcon col="created_at" />
                  </th>
                  <th className={s.sortable} onClick={() => toggleSort('last_seen')}>
                    Last Seen <SortIcon col="last_seen" />
                  </th>
                  <th>Status</th>
                  <th>Friends</th>
                  <th>Messages</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className={isAdmin(u.email) ? s.adminRow : ''}>
                    <td>
                      <div className={s.userCell}>
                        <Avatar user={u} size={36} online={u.is_online_live} />
                        <div className={s.userInfo}>
                          <div className={s.userName}>
                            {u.name}
                            {isAdmin(u.email) && <span className={s.youTag}>YOU</span>}
                          </div>
                          <div className={s.userEmail}>{u.email}</div>
                          {u.username && <div className={s.userUsername}>@{u.username}</div>}
                        </div>
                      </div>
                    </td>
                    <td className={s.dateCell}>{fmt(u.created_at)}</td>
                    <td className={s.dateCell}>{u.is_online_live ? <span className={s.onlineTag}>🟢 Now</span> : timeAgo(u.last_seen)}</td>
                    <td>
                      {u.is_online_live
                        ? <span className={`${s.badge} ${s.badgeGreen}`}>Online</span>
                        : <span className={`${s.badge} ${s.badgeGray}`}>Offline</span>
                      }
                    </td>
                    <td>
                      <div className={s.metaCell}>
                        <span>{u.friends_count}</span>
                        <MiniBar value={u.friends_count} max={maxFriends} color="#6366f1" />
                      </div>
                    </td>
                    <td>
                      <div className={s.metaCell}>
                        <span>{u.messages_count}</span>
                        <MiniBar value={u.messages_count} max={maxMsgs} color="#ec4899" />
                      </div>
                    </td>
                    <td>
                      <div className={s.actionCell}>
                        <button className={s.msgBtn} onClick={() => navigate(`/messages/${u.id}`)}
                          disabled={isAdmin(u.email)} title="Message">
                          💬
                        </button>
                        <button
                          className={s.delBtn}
                          onClick={() => handleDelete(u)}
                          disabled={isAdmin(u.email) || deleting === u.id}
                          title="Delete user"
                        >
                          {deleting === u.id ? <span className="spinner" style={{width:12,height:12}} /> : '🗑'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={7} className={s.noData}>No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className={s.pagination}>
            <button className={s.pageBtn} disabled={page === 1} onClick={() => setPage(p => p-1)}>← Prev</button>
            {Array.from({length: pages}, (_,i) => i+1).map(p => (
              <button key={p} className={`${s.pageBtn} ${p===page?s.pageActive:''}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className={s.pageBtn} disabled={page === pages} onClick={() => setPage(p => p+1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  )
}
