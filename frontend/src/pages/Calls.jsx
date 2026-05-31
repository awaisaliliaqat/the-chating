import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './Calls.module.css'

function fmtDuration(secs) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60), ss = secs % 60
  return `${m}:${ss.toString().padStart(2,'0')}`
}

function timeAgo(dt) {
  if (!dt) return ''
  const d = new Date(dt + 'Z')
  const diff = (Date.now() - d) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return d.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
}

export default function Calls() {
  const { api, user, startCall } = useContext(AppContext)
  const [calls, setCalls] = useState([])

  useEffect(() => { api('/calls').then(r => setCalls(r.data)) }, []) // eslint-disable-line

  function getInfo(c) {
    const isMe = c.caller_id === user?.id
    const peer = isMe
      ? { name: c.receiver_name, color: c.receiver_color, id: c.receiver_id }
      : { name: c.caller_name,   color: c.caller_color,   id: c.caller_id   }

    let icon = '📞', typeClass = s.out, label = 'Outgoing'
    if (!isMe) {
      if (c.status === 'missed' || c.status === 'initiated') {
        icon = '📵'; typeClass = s.missed; label = 'Missed'
      } else {
        icon = '📞'; typeClass = s.in; label = 'Incoming'
      }
    }
    if (c.call_type === 'video') icon = isMe ? '📹' : (typeClass === s.missed ? '📷' : '📹')
    return { peer, icon, typeClass, label }
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Call History</h1>
        <span className={s.count}>{calls.length} calls</span>
      </div>

      {calls.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📞</div>
          <div className={s.emptyTitle}>No calls yet</div>
          <div className={s.emptySub}>Call your friends from the Messages or Friends page</div>
        </div>
      ) : (
        <div className={s.list}>
          {calls.map(c => {
            const { peer, icon, typeClass, label } = getInfo(c)
            return (
              <div key={c.id} className={s.card}>
                <Avatar user={{ name: peer.name, avatar_color: peer.color }} size={46} />
                <div className={s.info}>
                  <div className={s.name}>{peer.name}</div>
                  <div className={`${s.type} ${typeClass}`}>
                    {icon} {label} · {c.call_type} call
                  </div>
                </div>
                <div className={s.meta}>
                  <div className={s.time}>{timeAgo(c.created_at)}</div>
                  <div className={s.duration}>{fmtDuration(c.duration)}</div>
                </div>
                <button
                  className={s.callAgain}
                  onClick={() => startCall(peer.id, c.call_type)}
                  title="Call again"
                >
                  {c.call_type === 'video' ? '📹' : '📞'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
