import { useState, useEffect, useRef, useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { getSocket } from '../utils/socket'
import Avatar from '../components/Avatar'
import EmojiPicker from '../components/EmojiPicker'
import s from './Groups.module.css'

function formatTime(dt) {
  if (!dt) return ''
  return new Date(dt+'Z').toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
}

export default function Groups() {
  const { user, api, addToast } = useContext(AppContext)
  const { id: paramId } = useParams()
  const activeGid = paramId ? parseInt(paramId) : null
  const navigate  = useNavigate()

  const [groups,    setGroups]    = useState([])
  const [groupInfo, setGroupInfo] = useState(null)
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showEmoji,  setShowEmoji]   = useState(false)
  const [newGroup,  setNewGroup]  = useState({ name:'', description:'' })
  const [friends,   setFriends]   = useState([])
  const [selected,  setSelected]  = useState([])

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    api('/groups').then(r => setGroups(r.data)).catch(()=>{})
    api('/friends').then(r => setFriends(r.data)).catch(()=>{})
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!activeGid) { setGroupInfo(null); setMessages([]); return }
    api(`/groups/${activeGid}`).then(r => setGroupInfo(r.data)).catch(()=>{})
    api(`/groups/${activeGid}/messages`).then(r => setMessages(r.data)).catch(()=>{})
  }, [activeGid]) // eslint-disable-line

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const onMsg = (msg) => {
      if (msg.group_id === activeGid) setMessages(p => [...p, msg])
      setGroups(p => p.map(g => g.id===msg.group_id ? {...g, last_msg: msg.content, last_msg_at: msg.created_at} : g))
    }
    socket.on('group_message', onMsg)
    return () => socket.off('group_message', onMsg)
  }, [activeGid])

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  function handleSend() {
    const content = input.trim()
    if (!content || !activeGid) return
    const socket = getSocket()
    if (socket) socket.emit('send_group_message', { group_id: activeGid, content })
    setInput('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  async function createGroup(e) {
    e.preventDefault()
    if (!newGroup.name.trim()) return
    try {
      const r = await api('/groups', { method:'POST', data:{ ...newGroup, members: selected } })
      setGroups(p => [r.data, ...p])
      setShowCreate(false); setNewGroup({name:'',description:''}); setSelected([])
      navigate(`/groups/${r.data.id}`)
      addToast('Group created!', 'success')
    } catch { addToast('Failed to create group', 'error') }
  }

  const initials = n => (n||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()

  return (
    <div className={s.page}>
      {/* ── Groups sidebar ── */}
      <div className={s.sidebar}>
        <div className={s.sidebarHeader}>
          <h2 className={s.sidebarTitle}>Groups</h2>
          <button className={s.newBtn} onClick={() => setShowCreate(true)}>+</button>
        </div>
        <div className={s.groupList}>
          {groups.length === 0 && (
            <div className={s.empty}>No groups yet.<br/>Create one to get started!</div>
          )}
          {groups.map(g => (
            <div key={g.id} className={`${s.groupItem} ${g.id===activeGid?s.active:''}`}
              onClick={() => navigate(`/groups/${g.id}`)}>
              <div className={s.groupAvatar} style={{background:g.avatar_color}}>
                {initials(g.name)}
              </div>
              <div className={s.groupInfo}>
                <div className={s.groupName}>{g.name}</div>
                <div className={s.groupLast}>{g.last_msg || 'No messages yet'}</div>
              </div>
              {g.member_count && <div className={s.memberCount}>{g.member_count}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Chat area ── */}
      {!activeGid ? (
        <div className={s.emptyChat}>
          <div className={s.emptyChatIcon}>👥</div>
          <div className={s.emptyChatTitle}>Select a Group</div>
          <div className={s.emptyChatSub}>Or create a new one to start chatting</div>
          <button className={s.createBtn} onClick={() => setShowCreate(true)}>+ Create Group</button>
        </div>
      ) : (
        <div className={s.chat}>
          {/* Header */}
          <div className={s.chatHeader}>
            <div className={s.groupAvatar2} style={{background:groupInfo?.avatar_color||'#6366f1'}}>
              {initials(groupInfo?.name||'')}
            </div>
            <div className={s.chatHeaderInfo}>
              <div className={s.chatName}>{groupInfo?.name}</div>
              <div className={s.chatSub}>{groupInfo?.members?.length||0} members</div>
            </div>
            <button className={s.memberBtn} onClick={() => setShowMembers(true)} title="Members">👥</button>
          </div>

          {/* Messages */}
          <div className={s.messages}>
            {messages.map((m,i) => {
              const isMe = m.sender_id === user?.id
              return (
                <div key={m.id||i} className={`${s.msgRow} ${isMe?s.me:s.them}`}>
                  {!isMe && (
                    <div className={s.senderAvatar} style={{background:m.sender_color||'#6366f1'}}>
                      {m.sender_avatar ? <img src={m.sender_avatar} className={s.avatarImg} alt=""/> : initials(m.sender_name)}
                    </div>
                  )}
                  <div className={s.msgGroup}>
                    {!isMe && <div className={s.senderName}>{m.sender_name}</div>}
                    {m.msg_type==='image' && m.file_b64
                      ? <img src={m.file_b64} className={s.imgMsg} alt="" onClick={() => window.open(m.file_b64)}/>
                      : <div className={`${s.bubble} ${isMe?s.bubbleMe:s.bubbleThem}`}>{m.content}</div>
                    }
                    <div className={s.msgTime}>{formatTime(m.created_at)}</div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className={s.inputArea}>
            <div className={s.inputRow}>
              {showEmoji && (
                <div className={s.emojiPopup}>
                  <EmojiPicker onPick={e => { setInput(p=>p+e); setShowEmoji(false) }} onClose={()=>setShowEmoji(false)} />
                </div>
              )}
              <button className={s.emojiBtn} onClick={() => setShowEmoji(p=>!p)}>😊</button>
              <textarea
                ref={inputRef}
                className={s.input}
                placeholder="Message group…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button className={s.sendBtn} onClick={handleSend} disabled={!input.trim()}>➤</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Members panel ── */}
      {showMembers && groupInfo && (
        <div className={s.overlay} onClick={() => setShowMembers(false)}>
          <div className={s.membersPanel} onClick={e=>e.stopPropagation()}>
            <div className={s.panelHeader}>
              <h3>Members ({groupInfo.members?.length})</h3>
              <button className={s.closeBtn} onClick={() => setShowMembers(false)}>✕</button>
            </div>
            {groupInfo.members?.map(m => (
              <div key={m.id} className={s.memberRow}>
                <Avatar user={m} size={36} />
                <div className={s.memberInfo}>
                  <div className={s.memberName}>{m.name}</div>
                  {m.role==='admin' && <span className={s.adminBadge}>Admin</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Create group modal ── */}
      {showCreate && (
        <div className={s.overlay} onClick={() => setShowCreate(false)}>
          <div className={s.modal} onClick={e=>e.stopPropagation()}>
            <div className={s.panelHeader}>
              <h3>Create Group</h3>
              <button className={s.closeBtn} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={createGroup} className={s.form}>
              <label className={s.label}>Group Name *</label>
              <input className={s.inp} value={newGroup.name} onChange={e=>setNewGroup(p=>({...p,name:e.target.value}))} placeholder="e.g. Weekend Squad" required />
              <label className={s.label}>Description</label>
              <input className={s.inp} value={newGroup.description} onChange={e=>setNewGroup(p=>({...p,description:e.target.value}))} placeholder="What's this group about?" />
              <label className={s.label}>Add Friends</label>
              <div className={s.friendList}>
                {friends.map(f => (
                  <label key={f.id} className={s.friendCheck}>
                    <input type="checkbox" checked={selected.includes(f.id)} onChange={e=>setSelected(p=>e.target.checked?[...p,f.id]:p.filter(x=>x!==f.id))} />
                    <Avatar user={f} size={28} />
                    <span>{f.name}</span>
                  </label>
                ))}
                {friends.length===0 && <div className={s.noFriends}>Add friends first to invite them</div>}
              </div>
              <div className={s.modalBtns}>
                <button type="button" className={s.cancelBtn} onClick={()=>setShowCreate(false)}>Cancel</button>
                <button type="submit" className={s.submitBtn}>Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
