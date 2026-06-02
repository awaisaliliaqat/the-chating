import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import s from './WishList.module.css'

const CATEGORIES = ['Feature','UI/Design','Performance','Security','Bug Fix','Other']
const STATUSES = {
  open:        { label:'Open',        color:'var(--text-muted)',   bg:'var(--bg-secondary)'              },
  planned:     { label:'Planned',     color:'var(--accent)',       bg:'var(--accent-soft)'               },
  in_progress: { label:'In Progress', color:'var(--yellow)',       bg:'rgba(245,158,11,.1)'              },
  done:        { label:'✅ Done',     color:'var(--green)',        bg:'var(--green-soft)'                },
  rejected:    { label:'✕ Declined',  color:'var(--red)',          bg:'var(--red-soft)'                  },
}
const ADMIN_EMAILS = ['aariz123awais@gmail.com']

export default function WishList() {
  const { api, user, addToast } = useContext(AppContext)
  const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase())

  const [wishes,   setWishes]   = useState([])
  const [sort,     setSort]     = useState('votes')
  const [catFilter,setCatFilter]= useState('')
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ title:'', description:'', category:'Feature' })
  const [submitting,setSubmitting]=useState(false)

  useEffect(() => {
    load()
  }, [sort, catFilter]) // eslint-disable-line

  async function load() {
    setLoading(true)
    try {
      const r = await api(`/wishes?sort=${sort}&category=${catFilter}`)
      setWishes(r.data)
    } finally { setLoading(false) }
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSubmitting(true)
    try {
      const r = await api('/wishes', { method:'POST', data:form })
      setWishes(p => [r.data, ...p])
      setShowForm(false)
      setForm({ title:'', description:'', category:'Feature' })
      addToast('🌟 Wish submitted! Others can vote on it.', 'success')
    } catch(err) { addToast(err.response?.data?.message||'Failed','error') }
    finally { setSubmitting(false) }
  }

  async function vote(wid) {
    const r = await api(`/wishes/${wid}/vote`, { method:'POST' })
    setWishes(p => p.map(w => w.id===wid ? {...w, votes:r.data.votes, voted_by_me:r.data.voted?1:0} : w))
  }

  async function deleteWish(wid) {
    if (!window.confirm('Delete this wish?')) return
    await api(`/wishes/${wid}`, { method:'DELETE' })
    setWishes(p => p.filter(w => w.id!==wid))
    addToast('Wish deleted', 'info')
  }

  async function setStatus(wid, status) {
    await api(`/wishes/${wid}/status`, { method:'PUT', data:{ status } })
    setWishes(p => p.map(w => w.id===wid ? {...w, status} : w))
    addToast('Status updated', 'success')
  }

  function timeAgo(dt) {
    if (!dt) return ''
    const diff = (Date.now() - new Date(dt+'Z')) / 1000
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
    return `${Math.floor(diff/86400)}d ago`
  }

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>🌟 Wish List</h1>
          <p className={s.subtitle}>Tell us what features you want in THE CHATING!</p>
        </div>
        <button className={s.newBtn} onClick={() => setShowForm(true)}>
          + Submit a Wish
        </button>
      </div>

      {/* Filters */}
      <div className={s.filters}>
        <div className={s.sortRow}>
          <button className={`${s.sortBtn} ${sort==='votes'?s.sortActive:''}`} onClick={()=>setSort('votes')}>🔥 Most Voted</button>
          <button className={`${s.sortBtn} ${sort==='newest'?s.sortActive:''}`} onClick={()=>setSort('newest')}>🆕 Newest</button>
        </div>
        <div className={s.catRow}>
          <button className={`${s.catBtn} ${catFilter===''?s.catActive:''}`} onClick={()=>setCatFilter('')}>All</button>
          {CATEGORIES.map(c=>(
            <button key={c} className={`${s.catBtn} ${catFilter===c?s.catActive:''}`} onClick={()=>setCatFilter(c)}>{c}</button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className={s.statsBar}>
        <span>💡 {wishes.length} wishes</span>
        <span>✅ {wishes.filter(w=>w.status==='done').length} completed</span>
        <span>🔧 {wishes.filter(w=>w.status==='in_progress').length} in progress</span>
        <span>📋 {wishes.filter(w=>w.status==='planned').length} planned</span>
      </div>

      {/* Wishes list */}
      {loading ? (
        <div className={s.loading}><span className="spinner" style={{width:28,height:28,borderWidth:3}}/></div>
      ) : wishes.length === 0 ? (
        <div className={s.empty}>
          <div style={{fontSize:52}}>🌟</div>
          <div style={{fontSize:18,fontWeight:700,color:'var(--text-primary)',marginTop:8}}>No wishes yet!</div>
          <div style={{fontSize:13,color:'var(--text-muted)'}}>Be the first to submit a feature request</div>
          <button className={s.newBtn} style={{marginTop:12}} onClick={()=>setShowForm(true)}>+ Submit First Wish</button>
        </div>
      ) : (
        <div className={s.list}>
          {wishes.map((w,i) => {
            const st = STATUSES[w.status] || STATUSES.open
            const isOwn = w.user_id === user?.id
            return (
              <div key={w.id} className={`${s.card} ${w.status==='done'?s.cardDone:''}`}>
                {/* Rank */}
                <div className={s.rank}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
                </div>

                {/* Vote button */}
                <button
                  className={`${s.voteBtn} ${w.voted_by_me?s.votedBtn:''}`}
                  onClick={() => vote(w.id)}
                >
                  <span className={s.voteArrow}>{w.voted_by_me?'▲':'△'}</span>
                  <span className={s.voteCount}>{w.votes||0}</span>
                </button>

                {/* Content */}
                <div className={s.content}>
                  <div className={s.cardTop}>
                    <div className={s.wishTitle}>{w.title}</div>
                    <span className={s.statusBadge} style={{color:st.color,background:st.bg}}>{st.label}</span>
                  </div>
                  {w.description && <div className={s.wishDesc}>{w.description}</div>}
                  <div className={s.cardMeta}>
                    <span className={s.catTag}>{w.category}</span>
                    <span style={{fontSize:11,color:'var(--text-muted)'}}>{w.author_name} · {timeAgo(w.created_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className={s.actions}>
                  {(isOwn || isAdmin) && (
                    <button className={s.deleteBtn} onClick={() => deleteWish(w.id)} title="Delete">🗑</button>
                  )}
                  {isAdmin && (
                    <select
                      className={s.statusSelect}
                      value={w.status}
                      onChange={e => setStatus(w.id, e.target.value)}
                    >
                      {Object.entries(STATUSES).map(([k,v])=>(
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Submit form */}
      {showForm && (
        <div className={s.overlay} onClick={() => setShowForm(false)}>
          <div className={s.modal} onClick={e=>e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>🌟 Submit a Wish</h2>
              <button className={s.closeBtn} onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>
              Tell us what feature, improvement or fix you'd like to see in THE CHATING!
            </p>
            <form onSubmit={submit} className={s.form}>
              <label className={s.label}>Title * <span style={{fontSize:11,color:'var(--text-muted)'}}>(max 120 chars)</span></label>
              <input
                className={s.inp}
                placeholder="e.g. Add voice messages in groups"
                value={form.title}
                onChange={e=>setForm(p=>({...p,title:e.target.value}))}
                maxLength={120}
                required
              />

              <label className={s.label}>Description</label>
              <textarea
                className={s.inp}
                placeholder="Describe the feature in more detail..."
                value={form.description}
                onChange={e=>setForm(p=>({...p,description:e.target.value}))}
                rows={3}
                style={{resize:'vertical',fontFamily:'inherit'}}
              />

              <label className={s.label}>Category</label>
              <select className={s.inp} value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>

              <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
                <button type="button" className={s.cancelBtn} onClick={()=>setShowForm(false)}>Cancel</button>
                <button type="submit" className={s.submitBtn} disabled={!form.title.trim()||submitting}>
                  {submitting ? <span className="spinner"/> : '🌟 Submit Wish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
