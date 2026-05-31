import { useState, useEffect, useRef, useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { getSocket } from '../utils/socket'
import s from './Rooms.module.css'

const CATEGORIES = ['General','Gaming','Music','Tech','Sports','Movies','Study','Travel','Food','Art']

function formatTime(dt) {
  if (!dt) return ''
  return new Date(dt+'Z').toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
}

export default function Rooms() {
  const { user, api, addToast } = useContext(AppContext)
  const { id: paramId } = useParams()
  const activeRid = paramId ? parseInt(paramId) : null
  const navigate  = useNavigate()

  const [rooms,     setRooms]     = useState([])
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [filter,    setFilter]    = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [newRoom,   setNewRoom]   = useState({ name:'', description:'', category:'General' })
  const [activeRoom, setActiveRoom] = useState(null)

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    api('/rooms').then(r => setRooms(r.data)).catch(()=>{})
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!activeRid) { setMessages([]); setActiveRoom(null); return }
    api(`/rooms/${activeRid}/messages`).then(r => setMessages(r.data)).catch(()=>{})
    const room = rooms.find(r => r.id===activeRid)
    if (room) setActiveRoom(room)
  }, [activeRid, rooms]) // eslint-disable-line

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const onMsg = (msg) => {
      if (msg.room_id === activeRid) setMessages(p => [...p, msg])
    }
    socket.on('room_message', onMsg)
    return () => socket.off('room_message', onMsg)
  }, [activeRid])

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  async function joinRoom(rid) {
    await api(`/rooms/${rid}/join`, { method:'POST' })
    setRooms(p => p.map(r => r.id===rid ? {...r, is_member:1} : r))
    navigate(`/rooms/${rid}`)
    addToast('Joined room!', 'success')
  }

  async function createRoom(e) {
    e.preventDefault()
    try {
      const r = await api('/rooms', { method:'POST', data: newRoom })
      setRooms(p => [{...r.data, is_member:1, member_count:1}, ...p])
      setShowCreate(false); setNewRoom({name:'',description:'',category:'General'})
      navigate(`/rooms/${r.data.id}`)
      addToast('Room created!', 'success')
    } catch { addToast('Failed to create room', 'error') }
  }

  function handleSend() {
    const content = input.trim()
    if (!content || !activeRid) return
    const socket = getSocket()
    if (socket) socket.emit('send_room_message', { room_id: activeRid, content })
    setInput('')
    inputRef.current?.focus()
  }

  function handleKey(e) { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); handleSend() } }

  const initials = n => (n||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()
  const filtered = rooms.filter(r => filter==='All' || r.category===filter)

  return (
    <div className={s.page}>
      {/* ── Rooms sidebar ── */}
      <div className={s.sidebar}>
        <div className={s.sidebarHeader}>
          <h2 className={s.sidebarTitle}>Public Rooms</h2>
          <button className={s.newBtn} onClick={() => setShowCreate(true)}>+</button>
        </div>
        <div className={s.catFilter}>
          {['All', ...CATEGORIES].map(c => (
            <button key={c} className={`${s.catBtn} ${filter===c?s.catActive:''}`} onClick={() => setFilter(c)}>{c}</button>
          ))}
        </div>
        <div className={s.roomList}>
          {filtered.map(r => (
            <div key={r.id} className={`${s.roomItem} ${r.id===activeRid?s.active:''}`}
              onClick={() => r.is_member ? navigate(`/rooms/${r.id}`) : joinRoom(r.id)}>
              <div className={s.roomAvatar} style={{background:r.avatar_color||'#6366f1'}}>
                {initials(r.name)}
              </div>
              <div className={s.roomInfo}>
                <div className={s.roomName}>{r.name}</div>
                <div className={s.roomSub}>{r.category} · {r.member_count||0} members</div>
              </div>
              {!r.is_member && <span className={s.joinTag}>Join</span>}
            </div>
          ))}
          {filtered.length===0 && <div className={s.empty}>No rooms in this category</div>}
        </div>
      </div>

      {/* ── Chat area ── */}
      {!activeRid ? (
        <div className={s.emptyChat}>
          <div className={s.emptyChatIcon}>🌐</div>
          <div className={s.emptyChatTitle}>Public Rooms</div>
          <div className={s.emptyChatSub}>Join a room to chat with people around the world</div>
          <button className={s.createBtn} onClick={() => setShowCreate(true)}>+ Create Room</button>
        </div>
      ) : (
        <div className={s.chat}>
          <div className={s.chatHeader}>
            <div className={s.roomAvatar2} style={{background:activeRoom?.avatar_color||'#6366f1'}}>
              {initials(activeRoom?.name||'')}
            </div>
            <div>
              <div className={s.chatName}>{activeRoom?.name}</div>
              <div className={s.chatSub}>{activeRoom?.category} · {activeRoom?.member_count||0} members</div>
            </div>
          </div>

          <div className={s.messages}>
            {messages.map((m,i) => {
              const isMe = m.sender_id===user?.id
              return (
                <div key={m.id||i} className={`${s.msgRow} ${isMe?s.me:''}`}>
                  {!isMe && (
                    <div className={s.senderAvatar} style={{background:m.sender_color||'#6366f1'}}>
                      {m.sender_avatar ? <img src={m.sender_avatar} className={s.avatarImg} alt=""/> : initials(m.sender_name)}
                    </div>
                  )}
                  <div className={s.msgGroup}>
                    {!isMe && <div className={s.senderName}>{m.sender_name}</div>}
                    <div className={`${s.bubble} ${isMe?s.me:s.them}`}>{m.content}</div>
                    <div className={s.msgTime}>{formatTime(m.created_at)}</div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          <div className={s.inputArea}>
            {activeRoom?.is_member ? (
              <div className={s.inputRow}>
                <textarea ref={inputRef} className={s.input} placeholder={`Message #${activeRoom?.name}`}
                  value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} rows={1} />
                <button className={s.sendBtn} onClick={handleSend} disabled={!input.trim()}>➤</button>
              </div>
            ) : (
              <div className={s.joinPrompt}>
                <button className={s.joinBtn} onClick={() => joinRoom(activeRid)}>Join Room to Chat</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create room modal */}
      {showCreate && (
        <div className={s.overlay} onClick={() => setShowCreate(false)}>
          <div className={s.modal} onClick={e=>e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3>Create Public Room</h3>
              <button className={s.closeBtn} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={createRoom} className={s.form}>
              <label className={s.label}>Room Name *</label>
              <input className={s.inp} value={newRoom.name} onChange={e=>setNewRoom(p=>({...p,name:e.target.value}))} placeholder="e.g. Gaming Lounge" required />
              <label className={s.label}>Description</label>
              <input className={s.inp} value={newRoom.description} onChange={e=>setNewRoom(p=>({...p,description:e.target.value}))} placeholder="What's this room about?" />
              <label className={s.label}>Category</label>
              <select className={s.inp} value={newRoom.category} onChange={e=>setNewRoom(p=>({...p,category:e.target.value}))}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
              <div className={s.modalBtns}>
                <button type="button" className={s.cancelBtn} onClick={()=>setShowCreate(false)}>Cancel</button>
                <button type="submit" className={s.submitBtn}>Create Room</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
