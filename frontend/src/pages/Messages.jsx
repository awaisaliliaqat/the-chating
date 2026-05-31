import { useState, useEffect, useRef, useContext, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { getSocket } from '../utils/socket'
import Avatar from '../components/Avatar'
import s from './Messages.module.css'

function timeAgo(dt) {
  if (!dt) return ''
  const d = new Date(dt + 'Z')
  const diff = (Date.now() - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m`
  if (diff < 86400) return `${Math.floor(diff/3600)}h`
  return d.toLocaleDateString([], { month:'short', day:'numeric' })
}

function formatTime(dt) {
  if (!dt) return ''
  return new Date(dt + 'Z').toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
}

export default function Messages() {
  const { user, api, onlineUsers, startCall } = useContext(AppContext)
  const { id: paramId } = useParams()
  const activePeerId = paramId ? parseInt(paramId) : null
  const navigate = useNavigate()

  const [convos,   setConvos]   = useState([])
  const [messages, setMessages] = useState([])
  const [peer,     setPeer]     = useState(null)
  const [input,    setInput]    = useState('')
  const [typing,   setTyping]   = useState(false)
  const [search,   setSearch]   = useState('')

  const bottomRef    = useRef(null)
  const typingTimer  = useRef(null)
  const inputRef     = useRef(null)

  // Load conversations
  useEffect(() => {
    api('/messages/conversations').then(r => setConvos(r.data)).catch(() => {})
  }, [activePeerId]) // eslint-disable-line

  // Load messages for active peer
  useEffect(() => {
    if (!activePeerId) { setMessages([]); setPeer(null); return }
    api(`/messages/${activePeerId}`).then(r => {
      setMessages(r.data)
      // Find peer info from convos or fetch
      const found = convos.find(c => c.peer_id === activePeerId)
      if (found) {
        setPeer({ id: activePeerId, name: found.peer_name, avatar_color: found.peer_color })
      } else {
        api(`/users/search?q=${activePeerId}`).catch(() => {})
      }
    }).catch(() => {})
  }, [activePeerId]) // eslint-disable-line

  // Update peer info when convos load
  useEffect(() => {
    if (!activePeerId) return
    const found = convos.find(c => c.peer_id === activePeerId)
    if (found) setPeer({ id: activePeerId, name: found.peer_name, avatar_color: found.peer_color })
  }, [convos, activePeerId])

  // Socket events
  useEffect(() => {
    const s = getSocket()
    if (!s) return

    const onMsg = (msg) => {
      const peerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id
      // Update conversations
      setConvos(prev => {
        const existing = prev.find(c => c.peer_id === peerId)
        const updated = { ...existing, peer_id: peerId, content: msg.content, sender_id: msg.sender_id, created_at: msg.created_at, unread: (existing && msg.sender_id !== user.id && peerId !== activePeerId) ? (existing.unread || 0) + 1 : 0 }
        const others = prev.filter(c => c.peer_id !== peerId)
        return [updated, ...others]
      })
      // Add to messages if in active conversation
      if (peerId === activePeerId || (msg.sender_id === user.id && msg.receiver_id === activePeerId)) {
        setMessages(prev => [...prev, msg])
      }
    }

    const onTyping = ({ from }) => { if (from === activePeerId) setTyping(true) }
    const onStopTyping = ({ from }) => { if (from === activePeerId) setTyping(false) }

    s.on('new_message', onMsg)
    s.on('typing', onTyping)
    s.on('stop_typing', onStopTyping)

    return () => {
      s.off('new_message', onMsg)
      s.off('typing', onTyping)
      s.off('stop_typing', onStopTyping)
    }
  }, [activePeerId, user?.id]) // eslint-disable-line

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    const content = input.trim()
    if (!content || !activePeerId) return
    const s = getSocket()
    if (s) s.emit('send_message', { to: activePeerId, content })
    setInput('')
    stopTypingSignal()
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInputChange(e) {
    setInput(e.target.value)
    // Typing signal
    const s = getSocket()
    if (!s || !activePeerId) return
    s.emit('typing', { to: activePeerId })
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(stopTypingSignal, 2000)
  }

  function stopTypingSignal() {
    const s = getSocket()
    if (s && activePeerId) s.emit('stop_typing', { to: activePeerId })
    if (typingTimer.current) clearTimeout(typingTimer.current)
  }

  const filteredConvos = convos.filter(c =>
    c.peer_name?.toLowerCase().includes(search.toLowerCase())
  )

  const isOnline = activePeerId ? onlineUsers.has(activePeerId) : false

  return (
    <div className={s.page}>
      {/* Conversations sidebar */}
      <div className={s.sidebar}>
        <div className={s.sidebarHeader}>
          <h2 className={s.sidebarTitle}>Messages</h2>
        </div>
        <div className={s.searchWrap}>
          <input
            className={s.searchInput}
            placeholder="🔍  Search conversations"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className={s.convoList}>
          {filteredConvos.length === 0 && (
            <div className={s.empty}>No conversations yet</div>
          )}
          {filteredConvos.map(c => (
            <div
              key={c.peer_id}
              className={`${s.convoItem} ${c.peer_id === activePeerId ? s.active : ''}`}
              onClick={() => navigate(`/messages/${c.peer_id}`)}
            >
              <Avatar
                user={{ name: c.peer_name, avatar_color: c.peer_color }}
                size={42}
                online={onlineUsers.has(c.peer_id)}
              />
              <div className={s.convoInfo}>
                <div className={s.convoTop}>
                  <span className={s.convoName}>{c.peer_name}</span>
                  <span className={s.convoTime}>{timeAgo(c.created_at)}</span>
                </div>
                <div className={s.convoBottom}>
                  <span className={s.convoLast}>
                    {c.sender_id === user?.id ? 'You: ' : ''}{c.content}
                  </span>
                  {c.unread > 0 && <span className={s.badge}>{c.unread}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      {!activePeerId ? (
        <div className={s.empty2}>
          <div className={s.emptyIcon}>💬</div>
          <div className={s.emptyTitle}>Your Messages</div>
          <div className={s.emptyText}>Select a conversation or start a new one from Friends</div>
        </div>
      ) : (
        <div className={s.chat}>
          {/* Chat header */}
          <div className={s.chatHeader}>
            <Avatar user={peer} size={38} online={isOnline} />
            <div className={s.chatPeerInfo}>
              <div className={s.chatPeerName}>{peer?.name || '…'}</div>
              <div className={s.chatPeerStatus}>
                {isOnline ? <><span className="online-dot" style={{width:6,height:6}} /> Active now</> : 'Offline'}
              </div>
            </div>
            <div className={s.chatActions}>
              <button className={s.actionBtn} onClick={() => startCall(activePeerId, 'audio')} title="Audio call">📞</button>
              <button className={s.actionBtn} onClick={() => startCall(activePeerId, 'video')} title="Video call">📹</button>
              <button className={s.actionBtn} onClick={() => navigate(`/friends`)} title="Profile">👤</button>
            </div>
          </div>

          {/* Messages */}
          <div className={s.messages}>
            {messages.length === 0 && (
              <div className={s.emptyMsgs}>
                <Avatar user={peer} size={60} />
                <div className={s.emptyMsgsName}>{peer?.name}</div>
                <div className={s.emptyMsgsText}>Start the conversation!</div>
              </div>
            )}
            {messages.map((m, i) => {
              const isMe = m.sender_id === user?.id
              const showTime = i === messages.length - 1 ||
                messages[i+1]?.sender_id !== m.sender_id
              return (
                <div key={m.id || i} className={`${s.msgRow} ${isMe ? s.me : s.them}`}>
                  {!isMe && showTime && (
                    <Avatar
                      user={peer}
                      size={28}
                      style={{ alignSelf: 'flex-end', marginBottom: 2 }}
                    />
                  )}
                  {!isMe && !showTime && <div style={{width:28, flexShrink:0}} />}
                  <div className={s.msgGroup}>
                    <div className={`${s.bubble} ${isMe ? s.bubbleMe : s.bubbleThem}`}>
                      {m.content}
                    </div>
                    {showTime && (
                      <div className={s.msgTime}>{formatTime(m.created_at)}</div>
                    )}
                  </div>
                </div>
              )
            })}

            {typing && (
              <div className={`${s.msgRow} ${s.them}`}>
                <Avatar user={peer} size={28} style={{ alignSelf: 'flex-end', marginBottom: 2 }} />
                <div className={s.typingBubble}>
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className={s.inputArea}>
            <textarea
              ref={inputRef}
              className={s.input}
              placeholder="Type a message… (Enter to send)"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className={s.sendBtn}
              onClick={handleSend}
              disabled={!input.trim()}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
