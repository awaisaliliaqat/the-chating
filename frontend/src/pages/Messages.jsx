import { useState, useEffect, useRef, useContext, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { getSocket } from '../utils/socket'
import Avatar from '../components/Avatar'
import EmojiPicker, { QuickReact } from '../components/EmojiPicker'
import GifPicker from '../components/GifPicker'
import PollCard  from '../components/PollCard'
import s from './Messages.module.css'

function timeAgo(dt) {
  if (!dt) return ''
  const d = new Date(dt+'Z'), diff=(Date.now()-d)/1000
  if (diff<60) return 'just now'
  if (diff<3600) return `${Math.floor(diff/60)}m`
  if (diff<86400) return `${Math.floor(diff/3600)}h`
  return d.toLocaleDateString([],{month:'short',day:'numeric'})
}
function formatTime(dt) {
  if (!dt) return ''
  return new Date(dt+'Z').toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
}
function playBeep() {
  try {
    const prefs = JSON.parse(localStorage.getItem('s_prefs')||'{}')
    if (!prefs.soundEnabled || prefs.dnd) return
    const ctx=new AudioContext(),osc=ctx.createOscillator(),g=ctx.createGain()
    osc.connect(g);g.connect(ctx.destination)
    osc.frequency.value=880;g.gain.setValueAtTime(0.2,ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3)
    osc.start();osc.stop(ctx.currentTime+0.3)
  } catch {}
}
function sendPush(title, body) {
  try {
    const prefs = JSON.parse(localStorage.getItem('s_prefs')||'{}')
    if (!prefs.pushEnabled || prefs.dnd) return
    if (Notification.permission==='granted') new Notification(title,{body,icon:'/favicon.ico'})
  } catch {}
}
async function compressImage(file, maxKB=500) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let {width:w, height:h} = img
        const max = 1200
        if (w>max||h>max) { if(w>h){h=Math.round(h*max/w);w=max}else{w=Math.round(w*max/h);h=max} }
        canvas.width=w; canvas.height=h
        canvas.getContext('2d').drawImage(img,0,0,w,h)
        let q=0.9
        const tryCompress = () => {
          const data = canvas.toDataURL('image/jpeg',q)
          if (data.length/1024 < maxKB || q < 0.3) resolve(data)
          else { q-=0.1; tryCompress() }
        }
        tryCompress()
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export default function Messages() {
  const { user, setUser, api, onlineUsers, startCall, addToast } = useContext(AppContext)
  const { id: paramId } = useParams()
  const activePeerId = paramId ? parseInt(paramId) : null
  const navigate     = useNavigate()
  // Mobile: 'list' shows conversation list, 'chat' shows active chat
  const [mobileView, setMobileView] = useState(activePeerId ? 'chat' : 'list')

  const [convos,    setConvos]    = useState([])
  const [messages,  setMessages]  = useState([])
  const [peer,      setPeer]      = useState(null)
  const [input,     setInput]     = useState('')
  const [typing,    setTyping]    = useState(false)
  const [search,    setSearch]    = useState('')

  // New feature states
  const [replyTo,    setReplyTo]    = useState(null)   // message being replied to
  const [editMsg,    setEditMsg]    = useState(null)   // message being edited
  const [menuMsg,    setMenuMsg]    = useState(null)   // right-click context menu target
  const [menuPos,    setMenuPos]    = useState({x:0,y:0})
  const [showEmoji,  setShowEmoji]  = useState(false)
  const [showGif,    setShowGif]    = useState(false)
  const [showPoll,   setShowPoll]   = useState(false)
  const [pollQ,      setPollQ]      = useState('')
  const [pollOpts,   setPollOpts]   = useState(['',''])
  const [reactTarget,setReactTarget]= useState(null)  // message id for quick react
  const [reactPos,   setReactPos]   = useState({x:0,y:0})
  const [imgPreview, setImgPreview] = useState(null)  // base64 for image preview before send
  const [imgFile,    setImgFile]    = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ,    setSearchQ]    = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isBlocked,  setIsBlocked]  = useState(false)
  const [disappear,  setDisappear]  = useState(0)   // minutes (0=off)
  const [recording,  setRecording]  = useState(false)
  const [audioChunks,setAudioChunks]= useState([])

  const bottomRef    = useRef(null)
  const typingTimer  = useRef(null)
  const inputRef     = useRef(null)
  const fileRef      = useRef(null)
  const mediaRecRef  = useRef(null)

  // Load conversations
  useEffect(() => {
    api('/messages/conversations').then(r => setConvos(r.data)).catch(()=>{})
    api('/blocks').then(r => {
      if (activePeerId) setIsBlocked(r.data.some(b => b.id===activePeerId))
    }).catch(()=>{})
    const prefs = JSON.parse(localStorage.getItem('s_prefs')||'{}')
    if (prefs.disappear && prefs.disappear!=='off') setDisappear(parseInt(prefs.disappear))
  }, [activePeerId]) // eslint-disable-line

  // Load messages for active peer
  useEffect(() => {
    if (!activePeerId) {
      setMessages([]); setPeer(null)
      setMobileView('list')
      return
    }
    setMobileView('chat')
    api(`/messages/${activePeerId}`).then(r => {
      setMessages(r.data)
      // Clear unread count for this conversation
      setConvos(p => p.map(c => c.peer_id===activePeerId ? {...c, unread:0} : c))
      // Update global unread count
      setUser(u => u ? { ...u, unread_count: Math.max(0, (u.unread_count||0) - (convos.find(c=>c.peer_id===activePeerId)?.unread||0)) } : u)
    }).catch(()=>{})
    const found = convos.find(c => c.peer_id===activePeerId)
    if (found) setPeer({ id:activePeerId, name:found.peer_name, avatar_color:found.peer_color, avatar_b64:found.peer_avatar })
  }, [activePeerId]) // eslint-disable-line

  useEffect(() => {
    if (!activePeerId) return
    const found = convos.find(c => c.peer_id===activePeerId)
    if (found) setPeer({ id:activePeerId, name:found.peer_name, avatar_color:found.peer_color, avatar_b64:found.peer_avatar })
  }, [convos, activePeerId])

  // Socket events
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const onMsg = (msg) => {
      if (!user) return
      const peerId = msg.sender_id===user.id ? msg.receiver_id : msg.sender_id
      setConvos(prev => {
        const existing = prev.find(c=>c.peer_id===peerId)||{}
        const unread   = (msg.sender_id!==user.id && peerId!==activePeerId) ? (existing.unread||0)+1 : 0
        const updated  = {...existing, peer_id:peerId, content:msg.content, msg_type:msg.msg_type,
                          sender_id:msg.sender_id, created_at:msg.created_at, unread}
        return [updated, ...prev.filter(c=>c.peer_id!==peerId)]
      })
      if (peerId===activePeerId || (msg.sender_id===user.id && msg.receiver_id===activePeerId)) {
        setMessages(prev => [...prev, msg])
      }
      if (msg.sender_id!==user.id) {
        playBeep()
        if (document.hidden) sendPush('New message', msg.content||'📎 Image')
      }
    }

    const onEdited = (updated) => setMessages(p => p.map(m => m.id===updated.id ? updated : m))
    const onDeleted = ({id}) => setMessages(p => p.map(m => m.id===id ? {...m, deleted_at:'deleted', content:''} : m))
    const onPinned = ({id, is_pinned}) => setMessages(p => p.map(m => m.id===id ? {...m, is_pinned} : m))
    const onReaction = ({message_id, reactions}) => setMessages(p => p.map(m => m.id===message_id ? {...m, reactions} : m))
    const onRead  = () => setMessages(p => p.map(m => m.sender_id===user.id ? {...m, is_read:1} : m))
    const onTyping = ({from}) => { if (from===activePeerId) setTyping(true) }
    const onStopTyping = ({from}) => { if (from===activePeerId) setTyping(false) }

    socket.on('new_message',    onMsg)
    socket.on('message_edited', onEdited)
    socket.on('message_deleted',onDeleted)
    socket.on('message_pinned', onPinned)
    socket.on('message_reaction',onReaction)
    socket.on('messages_read',  onRead)
    socket.on('typing',         onTyping)
    socket.on('stop_typing',    onStopTyping)

    return () => {
      socket.off('new_message',    onMsg)
      socket.off('message_edited', onEdited)
      socket.off('message_deleted',onDeleted)
      socket.off('message_pinned', onPinned)
      socket.off('message_reaction',onReaction)
      socket.off('messages_read',  onRead)
      socket.off('typing',         onTyping)
      socket.off('stop_typing',    onStopTyping)
    }
  }, [activePeerId, user?.id]) // eslint-disable-line

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  // Close menus on click outside
  useEffect(() => {
    const handler = () => { setMenuMsg(null); setReactTarget(null) }
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  // ── Typing signal ──────────────────────────────────────────────────────────
  function handleInputChange(e) {
    setInput(e.target.value)
    const socket = getSocket()
    if (!socket || !activePeerId) return
    socket.emit('typing',{to:activePeerId})
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      socket.emit('stop_typing',{to:activePeerId})
    }, 2000)
  }

  // ── Send message ───────────────────────────────────────────────────────────
  function handleSend() {
    const socket = getSocket()
    if (!socket || !activePeerId) return

    if (editMsg) {
      api(`/messages/${editMsg.id}`, { method:'PUT', data:{ content:input } })
      setEditMsg(null); setInput(''); return
    }

    // Image
    if (imgFile && imgPreview) {
      socket.emit('send_message', {
        to: activePeerId, content: imgFile.name || 'image',
        msg_type:'image', file_b64: imgPreview,
        file_name: imgFile.name,
        reply_to_id: replyTo?.id || null,
        expires_in: disappear || null,
      })
      setImgPreview(null); setImgFile(null); setReplyTo(null)
      return
    }

    const content = input.trim()
    if (!content) return

    socket.emit('send_message', {
      to: activePeerId, content, msg_type:'text',
      reply_to_id: replyTo?.id || null,
      expires_in: disappear || null,
    })
    setInput(''); setReplyTo(null)
    socket.emit('stop_typing',{to:activePeerId})
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    const prefs = JSON.parse(localStorage.getItem('s_prefs')||'{}')
    const enterSend = prefs.enterSend !== false
    if (e.key==='Enter' && !e.shiftKey && enterSend) { e.preventDefault(); handleSend() }
  }

  // ── Image file pick ────────────────────────────────────────────────────────
  async function handleFilePick(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    if (file.size > 10*1024*1024) { alert('File too large (max 10MB)'); return }
    const b64 = await compressImage(file)
    setImgPreview(b64); setImgFile(file)
  }

  // ── Voice recording ────────────────────────────────────────────────────────

  function getBestAudioMime() {
    // Ordered by compatibility: mp4 works everywhere, webm works on Chrome/Firefox
    const candidates = [
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ]
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t
    }
    return ''
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getBestAudioMime()
      const options  = mimeType ? { mimeType } : {}
      const mr       = new MediaRecorder(stream, options)
      const chunks   = []

      mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

      mr.onstop = () => {
        const usedMime = mr.mimeType || mimeType || 'audio/webm'
        const blob     = new Blob(chunks, { type: usedMime })

        // Limit to 5MB
        if (blob.size > 5 * 1024 * 1024) {
          addToast('Voice message too long (max ~2 min). Try again.', 'error')
          stream.getTracks().forEach(t => t.stop())
          setRecording(false)
          return
        }

        const reader = new FileReader()
        reader.onload = e2 => {
          const socket = getSocket()
          if (socket && activePeerId) {
            const ext = usedMime.includes('mp4') ? 'mp4' : usedMime.includes('ogg') ? 'ogg' : 'webm'
            socket.emit('send_message', {
              to: activePeerId,
              content: '🎤 Voice message',
              msg_type: 'audio',
              file_b64: e2.target.result,
              file_name: `voice.${ext}`,
              expires_in: disappear || null
            })
          }
        }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
      }

      mr.start(1000)   // collect data every second
      mediaRecRef.current = mr
      setRecording(true)
      addToast('Recording… tap 🎤 again to send', 'info')
    } catch(err) {
      if (err.name === 'NotAllowedError') {
        addToast('Microphone permission denied. Allow it in browser settings.', 'error')
      } else {
        addToast('Could not start recording: ' + err.message, 'error')
      }
    }
  }

  function stopRecording() {
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop()
    }
  }

  // ── Message context menu ───────────────────────────────────────────────────
  function handleMsgRightClick(e, msg) {
    e.preventDefault()
    e.stopPropagation()
    setMenuMsg(msg)
    setMenuPos({x: Math.min(e.clientX, window.innerWidth-180), y: Math.min(e.clientY, window.innerHeight-220)})
  }

  function handleReactHover(e, msgId) {
    e.stopPropagation()
    setReactTarget(msgId)
    setReactPos({x: Math.min(e.currentTarget.getBoundingClientRect().left, window.innerWidth-240), y: e.currentTarget.getBoundingClientRect().top - 50})
  }

  function doReact(emoji, msgId) {
    api(`/messages/${msgId}/react`, {method:'POST', data:{emoji}}).catch(()=>{})
    setReactTarget(null)
  }

  function doDelete(msg) {
    api(`/messages/${msg.id}`, {method:'DELETE'}).catch(()=>{})
    setMenuMsg(null)
  }

  function doEdit(msg) {
    setEditMsg(msg); setInput(msg.content)
    setMenuMsg(null); inputRef.current?.focus()
  }

  function doReply(msg) {
    setReplyTo(msg); setMenuMsg(null); inputRef.current?.focus()
  }

  function doPin(msg) {
    api(`/messages/${msg.id}/pin`, {method:'PUT'}).catch(()=>{})
    setMenuMsg(null)
  }

  function copyText(msg) {
    navigator.clipboard.writeText(msg.content).catch(()=>{})
    setMenuMsg(null)
  }

  // ── Block ──────────────────────────────────────────────────────────────────
  async function toggleBlock() {
    if (isBlocked) {
      await api(`/users/${activePeerId}/block`, {method:'DELETE'})
      setIsBlocked(false)
    } else {
      if (!window.confirm('Block this user?')) return
      await api(`/users/${activePeerId}/block`, {method:'POST'})
      setIsBlocked(true)
    }
  }

  // ── Message search ─────────────────────────────────────────────────────────
  async function doSearch(q) {
    setSearchQ(q)
    if (q.length < 2) { setSearchResults([]); return }
    const r = await api(`/messages/search?q=${encodeURIComponent(q)}`).catch(()=>({data:[]}))
    setSearchResults(r.data)
  }

  const filteredConvos = convos.filter(c =>
    c.peer_name?.toLowerCase().includes(search.toLowerCase())
  )

  const pinnedMessages = messages.filter(m => m.is_pinned && !m.deleted_at)
  const isOnline = activePeerId ? onlineUsers.has(activePeerId) : false

  // ── Render message bubble ──────────────────────────────────────────────────
  function renderBubble(m, i) {
    const isMe = m.sender_id === user?.id
    const deleted = !!m.deleted_at
    const showAvatar = !isMe && (i===messages.length-1 || messages[i+1]?.sender_id !== m.sender_id)

    return (
      <div key={m.id||i} className={`${s.msgRow} ${isMe?s.me:s.them}`}
        onContextMenu={e => !deleted && handleMsgRightClick(e, m)}>

        {/* Avatar for them */}
        {!isMe && (showAvatar
          ? <Avatar user={peer} size={28} style={{alignSelf:'flex-end',marginBottom:2}} />
          : <div style={{width:28,flexShrink:0}} />
        )}

        <div className={s.msgGroup}>
          {/* Reply preview */}
          {m.reply_to && !deleted && (
            <div className={`${s.replyPreview} ${isMe?s.replyMe:s.replyThem}`}>
              ↩ {m.reply_to.content || (m.reply_to.msg_type==='image'?'📷 Photo':'Message')}
            </div>
          )}

          {/* Bubble */}
          {deleted ? (
            <div className={s.deletedBubble}>🗑 Message deleted</div>
          ) : m.msg_type==='image' && m.file_b64 ? (
            <div className={s.imgWrapper} onMouseEnter={e=>handleReactHover(e,m.id)}>
              <img src={m.file_b64} className={s.imgBubble} alt="" onClick={()=>window.open(m.file_b64)} />
              {m.edited_at && <span className={s.editedTag}>edited</span>}
            </div>
          ) : m.msg_type==='poll' && m.poll_id ? (
            <PollCard poll={{id:m.poll_id,...(m.poll||{})}} />
          ) : m.msg_type==='audio' && m.file_b64 ? (
            <div className={`${s.audioBubble} ${isMe?s.audioMe:s.audioThem}`} onMouseEnter={e=>handleReactHover(e,m.id)}>
              <span>🎤</span>
              <audio
                controls
                preload="metadata"
                className={s.audioEl}
                onError={e => console.warn('Audio error:', e)}
              >
                <source src={m.file_b64} />
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : (
            <div className={`${s.bubble} ${isMe?s.bubbleMe:s.bubbleThem} ${m.is_pinned?s.pinned:''}`}
              onMouseEnter={e=>handleReactHover(e,m.id)}>
              {m.content}
              {m.edited_at && <span className={s.editedTag}> (edited)</span>}
            </div>
          )}

          {/* Reactions */}
          {m.reactions?.length > 0 && (
            <div className={`${s.reactions} ${isMe?s.reactMe:s.reactThem}`}>
              {m.reactions.map(r => (
                <button key={r.emoji} className={`${s.reactBtn} ${r.user_ids.includes(user?.id)?s.reactMine:''}`}
                  onClick={() => doReact(r.emoji, m.id)}>
                  {r.emoji} {r.count>1?r.count:''}
                </button>
              ))}
            </div>
          )}

          {/* Time + read receipt */}
          <div className={`${s.msgMeta} ${isMe?s.metaMe:''}`}>
            <span className={s.msgTime}>{formatTime(m.created_at)}</span>
            {isMe && <span className={`${s.readTick} ${m.is_read?s.read:''}`}>{m.is_read ? '✓✓' : '✓'}</span>}
            {m.is_pinned && !deleted && <span className={s.pinIcon}>📌</span>}
          </div>
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className={s.page}>

      {/* ── Conversations sidebar ── */}
      <div className={`${s.sidebar} ${mobileView==='chat' ? s.sidebarHidden : ''}`}>
        <div className={s.sidebarHeader}>
          <h2 className={s.sidebarTitle}>Messages</h2>
          <button className={s.searchToggle} onClick={()=>setSearchOpen(p=>!p)} title="Search messages">🔍</button>
        </div>
        <div className={s.searchWrap}>
          <input className={s.searchInput} placeholder="🔍  Search conversations" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <div className={s.convoList}>
          {filteredConvos.length===0 && <div className={s.empty}>No conversations yet</div>}
          {filteredConvos.map(c => (
            <div key={c.peer_id} className={`${s.convoItem} ${c.peer_id===activePeerId?s.active:''}`}
              onClick={() => { navigate(`/messages/${c.peer_id}`); setMobileView('chat') }}>
              <Avatar user={{name:c.peer_name,avatar_color:c.peer_color,avatar_b64:c.peer_avatar}} size={42} online={onlineUsers.has(c.peer_id)} />
              <div className={s.convoInfo}>
                <div className={s.convoTop}>
                  <span className={s.convoName}>{c.peer_name}</span>
                  <span className={s.convoTime}>{timeAgo(c.created_at)}</span>
                </div>
                <div className={s.convoBottom}>
                  <span className={s.convoLast}>
                    {c.sender_id===user?.id?'You: ':''}
                    {c.msg_type==='image'?'📷 Photo':c.msg_type==='audio'?'🎤 Voice':c.content}
                  </span>
                  {c.unread>0 && <span className={s.badge}>{c.unread}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chat area ── */}
      {!activePeerId ? (
        <div className={`${s.empty2} ${mobileView==='list' ? '' : s.chatHidden}`}>
          <div className={s.emptyIcon}>💬</div>
          <div className={s.emptyTitle}>Your Messages</div>
          <div className={s.emptyText}>Select a conversation to start chatting</div>
        </div>
      ) : (
        <div className={`${s.chat} ${mobileView==='list' ? s.chatHidden : ''}`}>

          {/* Header */}
          <div className={s.chatHeader}>
            {/* Mobile back button */}
            <button className={s.backBtn} onClick={() => { setMobileView('list'); navigate('/messages') }}>←</button>
            <Avatar user={peer} size={38} online={isOnline} />
            <div className={s.chatPeerInfo}>
              <div className={s.chatPeerName}>{peer?.name||'…'}</div>
              <div className={s.chatPeerStatus}>
                {isOnline ? <><span className="online-dot" style={{width:6,height:6}}/> Active now</> : 'Offline'}
              </div>
            </div>
            <div className={s.chatActions}>
              <button className={s.actionBtn} onClick={()=>setSearchOpen(p=>!p)} title="Search">🔍</button>
              <button className={s.actionBtn} onClick={()=>startCall(activePeerId,'audio')} title="Audio call">📞</button>
              <button className={s.actionBtn} onClick={()=>startCall(activePeerId,'video')} title="Video call">📹</button>
              <button className={`${s.actionBtn} ${isBlocked?s.blocked:''}`} onClick={toggleBlock} title={isBlocked?'Unblock':'Block'}>
                {isBlocked?'🚫':'⋯'}
              </button>
            </div>
          </div>

          {/* Message search panel */}
          {searchOpen && (
            <div className={s.searchPanel}>
              <input className={s.searchPanelInput} placeholder="Search messages…" value={searchQ} onChange={e=>doSearch(e.target.value)} autoFocus />
              <div className={s.searchPanelResults}>
                {searchResults.map(r => (
                  <div key={r.id} className={s.searchResult}>
                    <span className={s.searchResultName}>{r.sender_name}</span>
                    <span className={s.searchResultText}>{r.content}</span>
                    <span className={s.searchResultTime}>{timeAgo(r.created_at)}</span>
                  </div>
                ))}
                {searchQ.length>=2 && searchResults.length===0 && <div className={s.noResults}>No results</div>}
              </div>
            </div>
          )}

          {/* Pinned messages bar */}
          {pinnedMessages.length > 0 && (
            <div className={s.pinnedBar}>
              📌 {pinnedMessages[pinnedMessages.length-1].content || 'Pinned message'}
            </div>
          )}

          {/* Blocked banner */}
          {isBlocked && (
            <div className={s.blockedBanner}>You have blocked this user. <button onClick={toggleBlock}>Unblock</button></div>
          )}

          {/* Messages */}
          <div className={s.messages}>
            {messages.length===0 && (
              <div className={s.emptyMsgs}>
                <Avatar user={peer} size={60} />
                <div className={s.emptyMsgsName}>{peer?.name}</div>
                <div className={s.emptyMsgsText}>Start the conversation!</div>
              </div>
            )}
            {messages.map((m,i) => renderBubble(m,i))}

            {typing && (
              <div className={`${s.msgRow} ${s.them}`}>
                <Avatar user={peer} size={28} style={{alignSelf:'flex-end',marginBottom:2}} />
                <div className={s.typingBubble}><span/><span/><span/></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick react bar */}
          {reactTarget && (
            <div style={{position:'fixed',left:reactPos.x,top:reactPos.y,zIndex:300}} onClick={e=>e.stopPropagation()}>
              <QuickReact onReact={e=>doReact(e,reactTarget)} onMore={()=>setMenuMsg(messages.find(m=>m.id===reactTarget))} />
            </div>
          )}

          {/* Context menu */}
          {menuMsg && (
            <div className={s.ctxMenu} style={{left:menuPos.x,top:menuPos.y}} onClick={e=>e.stopPropagation()}>
              <button onClick={()=>doReply(menuMsg)}>↩ Reply</button>
              {menuMsg.sender_id===user?.id && <button onClick={()=>doEdit(menuMsg)}>✏️ Edit</button>}
              {menuMsg.sender_id===user?.id && <button onClick={()=>doDelete(menuMsg)} className={s.deleteOpt}>🗑 Delete</button>}
              <button onClick={()=>doPin(menuMsg)}>{menuMsg.is_pinned?'📌 Unpin':'📌 Pin'}</button>
              <button onClick={()=>copyText(menuMsg)}>📋 Copy</button>
            </div>
          )}

          {/* Full emoji picker */}
          {showEmoji && (
            <div className={s.emojiPickerWrap}>
              <EmojiPicker onPick={e=>{setInput(p=>p+e);setShowEmoji(false)}} onClose={()=>setShowEmoji(false)} />
            </div>
          )}

          {/* Image preview */}
          {imgPreview && (
            <div className={s.imgPreviewBar}>
              <img src={imgPreview} className={s.imgPreviewThumb} alt="" />
              <span className={s.imgPreviewName}>{imgFile?.name}</span>
              <button className={s.imgPreviewRemove} onClick={()=>{setImgPreview(null);setImgFile(null)}}>✕</button>
            </div>
          )}

          {/* Reply bar */}
          {replyTo && (
            <div className={s.replyBar}>
              <div className={s.replyBarContent}>
                <span className={s.replyBarLabel}>↩ Replying to</span>
                <span className={s.replyBarText}>{replyTo.content||'📷 Photo'}</span>
              </div>
              <button className={s.replyBarClose} onClick={()=>setReplyTo(null)}>✕</button>
            </div>
          )}

          {/* Edit bar */}
          {editMsg && (
            <div className={s.replyBar} style={{borderColor:'var(--yellow)'}}>
              <div className={s.replyBarContent}>
                <span className={s.replyBarLabel} style={{color:'var(--yellow)'}}>✏️ Editing</span>
                <span className={s.replyBarText}>{editMsg.content}</span>
              </div>
              <button className={s.replyBarClose} onClick={()=>{setEditMsg(null);setInput('')}}>✕</button>
            </div>
          )}

          {/* GIF Picker */}
          {showGif && (
            <div style={{padding:'8px 16px',borderTop:'1px solid var(--border)'}}>
              <GifPicker
                onPick={url => {
                  const socket = getSocket()
                  if (socket && activePeerId) socket.emit('send_message',{to:activePeerId,content:'',msg_type:'image',file_b64:url,file_name:'gif'})
                  setShowGif(false)
                }}
                onClose={() => setShowGif(false)}
              />
            </div>
          )}

          {/* Poll Creator */}
          {showPoll && (
            <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',background:'var(--bg-secondary)'}}>
              <div style={{fontWeight:700,marginBottom:8,fontSize:13}}>📊 Create Poll</div>
              <input style={{width:'100%',padding:'7px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-card)',color:'var(--text-primary)',marginBottom:6,fontSize:13}} placeholder="Question" value={pollQ} onChange={e=>setPollQ(e.target.value)} />
              {pollOpts.map((opt,i) => (
                <div key={i} style={{display:'flex',gap:4,marginBottom:4}}>
                  <input style={{flex:1,padding:'6px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-card)',color:'var(--text-primary)',fontSize:13}} placeholder={`Option ${i+1}`} value={opt} onChange={e=>{const o=[...pollOpts];o[i]=e.target.value;setPollOpts(o)}} />
                  {i>=2&&<button onClick={()=>setPollOpts(p=>p.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--red)',fontSize:16}}>✕</button>}
                </div>
              ))}
              <div style={{display:'flex',gap:8,marginTop:6}}>
                {pollOpts.length<5&&<button style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',fontSize:12,color:'var(--text-secondary)'}} onClick={()=>setPollOpts(p=>[...p,''])}>+ Add option</button>}
                <button style={{background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',fontSize:13,fontWeight:700}} onClick={async()=>{
                  if(!pollQ||pollOpts.filter(o=>o.trim()).length<2)return
                  const r=await api('/polls',{method:'POST',data:{question:pollQ,options:pollOpts.filter(o=>o.trim()),chat_id:activePeerId}})
                  const socket=getSocket()
                  if(socket&&activePeerId) socket.emit('send_message',{to:activePeerId,content:`📊 Poll: ${pollQ}`,msg_type:'poll',poll_id:r.data.id})
                  setShowPoll(false);setPollQ('');setPollOpts(['',''])
                }}>Send Poll</button>
                <button style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:13}} onClick={()=>setShowPoll(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Input area */}
          <div className={s.inputArea}>
            <input ref={fileRef} type="file" accept="image/*,video/*" style={{display:'none'}} onChange={handleFilePick} />
            <div className={s.inputRow}>
              <button className={s.inputBtn} onClick={()=>setShowEmoji(p=>!p)} title="Emoji">😊</button>
              <button className={s.inputBtn} onClick={()=>{setShowGif(p=>!p);setShowEmoji(false)}} title="GIF">GIF</button>
              <button className={s.inputBtn} onClick={()=>{setShowPoll(p=>!p);setShowGif(false)}} title="Poll">📊</button>
              <button className={s.inputBtn} onClick={()=>fileRef.current?.click()} title="Image/File">📎</button>
              <button
                className={`${s.inputBtn} ${recording ? s.recActive : ''}`}
                onClick={recording ? stopRecording : startRecording}
                title={recording ? 'Tap to STOP and send' : 'Tap to record voice message'}
              >
                {recording ? '⏹ Stop' : '🎤'}
              </button>
              <textarea
                ref={inputRef}
                className={s.input}
                placeholder={isBlocked?'You have blocked this user':editMsg?'Editing message…':`Message ${peer?.name||''}…`}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isBlocked}
              />
              <button className={s.sendBtn} onClick={handleSend} disabled={!input.trim()&&!imgPreview}>➤</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
