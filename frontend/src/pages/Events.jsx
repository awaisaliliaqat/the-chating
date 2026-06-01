import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './Events.module.css'

function fmtDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
}

export default function Events() {
  const { api, user, addToast } = useContext(AppContext)
  const [events,  setEvents]  = useState([])
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ title:'', description:'', location:'', starts_at:'', ends_at:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { api('/events').then(r => setEvents(r.data)).catch(()=>{}) }, []) // eslint-disable-line

  async function createEvent(e) {
    e.preventDefault(); setSaving(true)
    try {
      const r = await api('/events', { method:'POST', data:form })
      setEvents(p => [r.data, ...p])
      setShowNew(false); setForm({title:'',description:'',location:'',starts_at:'',ends_at:''})
      addToast('Event created! 🎉', 'success')
    } catch { addToast('Failed','error') }
    finally { setSaving(false) }
  }

  async function attend(eid, status) {
    await api(`/events/${eid}/attend`, { method:'POST', data:{ status } })
    setEvents(p => p.map(e => e.id===eid ? {...e, attending: status==='going'?1:0} : e))
    addToast(status==='going' ? "You're going! 🎊" : "Marked as not going", 'info')
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>📅 Events</h1>
        <button className={s.newBtn} onClick={() => setShowNew(true)}>+ Create Event</button>
      </div>

      {events.length === 0 && (
        <div className={s.empty}>
          <div style={{fontSize:52}}>📅</div>
          <div style={{fontSize:18,fontWeight:700,color:'var(--text-primary)'}}>No upcoming events</div>
          <div style={{fontSize:13,color:'var(--text-muted)'}}>Create one and invite your friends!</div>
        </div>
      )}

      {events.map(ev => (
        <div key={ev.id} className={`${s.card} ${ev.attending?s.attending:''}`}>
          <div className={s.cardHeader}>
            <div className={s.eventIcon}>📅</div>
            <div className={s.cardInfo}>
              <div className={s.eventTitle}>{ev.title}</div>
              <div className={s.eventTime}>🕐 {fmtDate(ev.starts_at)}</div>
              {ev.location && <div className={s.eventLoc}>📍 {ev.location}</div>}
            </div>
            <div className={s.goingCount}>
              <div style={{fontSize:20,fontWeight:800,color:'var(--accent)'}}>{ev.going_count}</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>going</div>
            </div>
          </div>
          {ev.description && <div className={s.eventDesc}>{ev.description}</div>}
          <div className={s.cardFooter}>
            <div className={s.creatorInfo}>
              <div className={s.creatorDot} style={{background:ev.creator_color}} />
              {ev.creator_name}
            </div>
            <div className={s.attendBtns}>
              <button className={`${s.goingBtn} ${ev.attending?s.goingActive:''}`} onClick={() => attend(ev.id,'going')}>
                ✓ Going
              </button>
              <button className={s.notGoingBtn} onClick={() => attend(ev.id,'not_going')}>
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}

      {showNew && (
        <div className={s.overlay} onClick={() => setShowNew(false)}>
          <div className={s.modal} onClick={e=>e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2>📅 Create Event</h2>
              <button className={s.closeBtn} onClick={() => setShowNew(false)}>✕</button>
            </div>
            <form onSubmit={createEvent} className={s.form}>
              {[
                { key:'title',       label:'Event Name *',   type:'text',            ph:'e.g. Friday Night Dinner' },
                { key:'description', label:'Description',    type:'textarea',        ph:'What is this event about?' },
                { key:'location',    label:'Location',       type:'text',            ph:'e.g. Central Park, New York' },
                { key:'starts_at',   label:'Start Date/Time*',type:'datetime-local', ph:'' },
                { key:'ends_at',     label:'End Date/Time',   type:'datetime-local',  ph:'' },
              ].map(f => (
                <div key={f.key}>
                  <label className={s.label}>{f.label}</label>
                  {f.type==='textarea'
                    ? <textarea className={s.inp} placeholder={f.ph} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} rows={2} />
                    : <input className={s.inp} type={f.type} placeholder={f.ph} value={form[f.key]} required={f.key==='title'||f.key==='starts_at'} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} />
                  }
                </div>
              ))}
              <div className={s.modalBtns}>
                <button type="button" className={s.cancelBtn} onClick={()=>setShowNew(false)}>Cancel</button>
                <button type="submit" className={s.saveBtn} disabled={saving}>{saving?<span className="spinner"/>:'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
