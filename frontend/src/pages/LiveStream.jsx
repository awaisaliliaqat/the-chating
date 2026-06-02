import { useState, useEffect, useRef, useContext, useCallback } from 'react'
import { AppContext } from '../context/AppContext'
import { getSocket } from '../utils/socket'
import { WSCall } from '../utils/wsCall'
import Avatar from '../components/Avatar'
import s from './LiveStream.module.css'

// ─── helpers ────────────────────────────────────────────────────────────────
function fmtViewers(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

function timeAgo(dt) {
  if (!dt) return ''
  const diff = (Date.now() - new Date(dt + 'Z')) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

// Distinct colours for chat usernames
const NAME_COLORS = [
  '#f472b6','#fb923c','#facc15','#34d399','#60a5fa',
  '#a78bfa','#f87171','#38bdf8','#4ade80','#e879f9',
]
function nameColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return NAME_COLORS[Math.abs(h) % NAME_COLORS.length]
}

// ─── Chat message component ──────────────────────────────────────────────────
function ChatMsg({ msg, isSystem }) {
  if (isSystem) {
    return (
      <div className={s.chatSystem}>
        {msg.text}
      </div>
    )
  }
  return (
    <div className={s.chatMsg}>
      <span className={s.chatName} style={{ color: nameColor(msg.name) }}>
        {msg.name}
      </span>
      <span className={s.chatText}>{msg.text}</span>
    </div>
  )
}

// ─── Stream card (list view) ─────────────────────────────────────────────────
function StreamCard({ stream, onWatch }) {
  return (
    <div className={s.card} onClick={() => onWatch(stream)}>
      <div className={s.cardThumb}>
        {/* gradient placeholder thumbnail */}
        <div className={s.cardThumbInner} style={{ background: stream.thumb_color || 'linear-gradient(135deg,#6366f1,#ec4899)' }} />
        <div className={s.cardLivePill}>
          <span className={s.cardLiveDot} />
          LIVE
        </div>
        <div className={s.cardViewers}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zm0 12.5a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/>
          </svg>
          {fmtViewers(stream.viewer_count || 0)}
        </div>
      </div>
      <div className={s.cardInfo}>
        <div className={s.cardTitle}>{stream.title}</div>
        <div className={s.cardMeta}>
          <Avatar user={{ name: stream.host_name, avatar_color: stream.host_color }} size={20} />
          <span className={s.cardHost}>{stream.host_name}</span>
          {stream.started_at && (
            <span className={s.cardAge}>{timeAgo(stream.started_at)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function LiveStream() {
  const { api, user, addToast } = useContext(AppContext)

  // ── page state ──
  const [view, setView]               = useState('list')   // 'list' | 'hosting' | 'watching'
  const [streams, setStreams]         = useState([])
  const [loadingList, setLoadingList] = useState(true)

  // ── go-live form ──
  const [titleInput, setTitleInput]   = useState('')
  const [showGoLive, setShowGoLive]   = useState(false)
  const [goingLive, setGoingLive]     = useState(false)

  // ── active stream state ──
  const [myStream, setMyStream]       = useState(null)   // stream I'm hosting
  const [watchStream, setWatchStream] = useState(null)   // stream I'm watching
  const [viewerCount, setViewerCount] = useState(0)
  const [chat, setChat]               = useState([])
  const [chatInput, setChatInput]     = useState('')
  const [chatOpen, setChatOpen]       = useState(true)
  const [muted, setMuted]             = useState(false)
  const [cameraOff, setCameraOff]     = useState(false)

  // ── refs ──
  const localVideoRef  = useRef(null)   // host's own camera
  const remoteVideoRef = useRef(null)   // img element for viewer
  const localStreamRef = useRef(null)   // MediaStream
  const wsCallRef      = useRef(null)   // WSCall instance (host sends via it)
  const chatEndRef     = useRef(null)
  const chatInputRef   = useRef(null)

  // ─── fetch stream list ───────────────────────────────────────────────────
  useEffect(() => {
    setLoadingList(true)
    api('/live-streams')
      .then(r => setStreams(r.data))
      .catch(() => {})
      .finally(() => setLoadingList(false))
  }, []) // eslint-disable-line

  // ─── socket events ────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const onStarted = (st) => setStreams(p => [st, ...p.filter(x => x.id !== st.id)])
    const onEnded   = ({ stream_id }) => {
      setStreams(p => p.filter(x => x.id !== stream_id))
      // If watching this stream, boot viewer back to list
      if (watchStream?.id === stream_id) {
        addToast('Stream has ended', 'info')
        leaveStream(false)
      }
    }
    const onCount = ({ stream_id, count }) => {
      const activeId = myStream?.id || watchStream?.id
      if (activeId === stream_id) setViewerCount(count)
    }
    // viewer gets frames from host via this event
    const onFrame = ({ stream_id, frame }) => {
      if (watchStream?.id === stream_id && remoteVideoRef.current) {
        remoteVideoRef.current.src = frame
      }
    }
    // chat messages from server
    const onChat = (msg) => {
      const activeId = myStream?.id || watchStream?.id
      if (msg.stream_id === activeId) {
        setChat(p => [...p, msg])
      }
    }
    // system events: join / leave
    const onJoin  = ({ stream_id, name }) => {
      const activeId = myStream?.id || watchStream?.id
      if (activeId === stream_id) {
        setChat(p => [...p, { system: true, text: `${name} joined the stream` }])
      }
    }
    const onLeave = ({ stream_id, name }) => {
      const activeId = myStream?.id || watchStream?.id
      if (activeId === stream_id) {
        setChat(p => [...p, { system: true, text: `${name} left` }])
      }
    }

    socket.on('live_stream_started',  onStarted)
    socket.on('live_stream_ended',    onEnded)
    socket.on('stream_viewer_count',  onCount)
    socket.on('stream_video_frame',   onFrame)
    socket.on('stream_chat',          onChat)
    socket.on('stream_viewer_joined', onJoin)
    socket.on('stream_viewer_left',   onLeave)

    return () => {
      socket.off('live_stream_started',  onStarted)
      socket.off('live_stream_ended',    onEnded)
      socket.off('stream_viewer_count',  onCount)
      socket.off('stream_video_frame',   onFrame)
      socket.off('stream_chat',          onChat)
      socket.off('stream_viewer_joined', onJoin)
      socket.off('stream_viewer_left',   onLeave)
    }
  }, [myStream, watchStream]) // eslint-disable-line

  // ─── auto-scroll chat ─────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  // ─── Go Live ──────────────────────────────────────────────────────────────
  async function startStream() {
    if (!titleInput.trim()) { addToast('Enter a stream title', 'error'); return }
    setGoingLive(true)
    try {
      // 1. Get camera + mic
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = stream

      // Attach to preview video element (rendered once view changes)
      // We set view first so the <video> element mounts, then assign srcObject
      const r = await api('/live-streams', { method: 'POST', data: { title: titleInput.trim() } })
      setMyStream(r.data)
      setViewerCount(0)
      setChat([])
      setTitleInput('')
      setShowGoLive(false)
      setView('hosting')
      addToast('You are live!', 'success')
    } catch (err) {
      const n = err?.name || ''
      if (n === 'NotAllowedError' || n === 'PermissionDeniedError') {
        addToast('Camera / microphone permission denied', 'error')
      } else if (n === 'NotFoundError') {
        addToast('No camera found on this device', 'error')
      } else {
        addToast('Could not start stream: ' + (err.message || n), 'error')
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
    } finally {
      setGoingLive(false)
    }
  }

  // Assign local stream to video element once the hosting view mounts
  useEffect(() => {
    if (view === 'hosting' && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current

      // Begin broadcasting frames + audio via WSCall
      const socket = getSocket()
      if (socket && myStream) {
        // Use WSCall to stream audio; also push video frames manually to all viewers
        const canvas = document.createElement('canvas')
        canvas.width = 320; canvas.height = 240
        const ctx2d  = canvas.getContext('2d')
        const vEl    = document.createElement('video')
        vEl.srcObject = localStreamRef.current
        vEl.autoplay = true; vEl.muted = true; vEl.playsInline = true

        const interval = setInterval(() => {
          if (vEl.readyState >= 2) {
            ctx2d.drawImage(vEl, 0, 0, 320, 240)
            const frame = canvas.toDataURL('image/jpeg', 0.3)
            socket.emit('stream_video_frame', { stream_id: myStream.id, frame })
          }
        }, 100)   // ~10fps

        wsCallRef.current = interval
      }
    }

    return () => {
      if (wsCallRef.current) {
        clearInterval(wsCallRef.current)
        wsCallRef.current = null
      }
    }
  }, [view, myStream]) // eslint-disable-line

  // ─── End stream (host) ────────────────────────────────────────────────────
  async function endStream() {
    if (wsCallRef.current) { clearInterval(wsCallRef.current); wsCallRef.current = null }
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    if (myStream) {
      try { await api(`/live-streams/${myStream.id}`, { method: 'DELETE' }) } catch {}
    }
    setMyStream(null)
    setViewerCount(0)
    setChat([])
    setCameraOff(false)
    setMuted(false)
    setView('list')
  }

  // ─── Join stream (viewer) ─────────────────────────────────────────────────
  function joinStream(stream) {
    setWatchStream(stream)
    setChat([])
    setViewerCount(stream.viewer_count || 0)
    getSocket()?.emit('join_live_stream', { stream_id: stream.id })
    setView('watching')
  }

  // ─── Leave stream (viewer) ────────────────────────────────────────────────
  function leaveStream(notify = true) {
    if (notify && watchStream) {
      getSocket()?.emit('leave_live_stream', { stream_id: watchStream.id })
    }
    setWatchStream(null)
    setChat([])
    setView('list')
  }

  // ─── Toggle host mute / camera ────────────────────────────────────────────
  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (track) { track.enabled = !track.enabled; setMuted(!track.enabled) }
  }
  function toggleCamera() {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (track) { track.enabled = !track.enabled; setCameraOff(!track.enabled) }
  }

  // ─── Send chat ────────────────────────────────────────────────────────────
  const sendChat = useCallback(() => {
    const text = chatInput.trim()
    if (!text) return
    const sid = myStream?.id || watchStream?.id
    if (!sid) return
    getSocket()?.emit('stream_chat_msg', { stream_id: sid, text, name: user?.name || 'Guest' })
    // Optimistic
    setChat(p => [...p, { stream_id: sid, name: 'You', text }])
    setChatInput('')
    chatInputRef.current?.focus()
  }, [chatInput, myStream, watchStream, user])

  function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
  }

  // ─── Refresh list ─────────────────────────────────────────────────────────
  function refreshList() {
    setLoadingList(true)
    api('/live-streams')
      .then(r => setStreams(r.data))
      .catch(() => {})
      .finally(() => setLoadingList(false))
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER — stream list
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'list') {
    return (
      <div className={s.page}>
        {/* ── top bar ── */}
        <div className={s.topBar}>
          <div className={s.topBarLeft}>
            <div className={s.logo}>
              <span className={s.logoDot} />
              Live
            </div>
          </div>
          <div className={s.topBarRight}>
            <button className={s.refreshBtn} onClick={refreshList} title="Refresh">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.5 9a9 9 0 0115-1.8L23 10M1 14l4.5 2.8A9 9 0 0020.5 15"/>
              </svg>
            </button>
            <button className={s.goLiveBtn} onClick={() => setShowGoLive(true)}>
              <span className={s.goLiveDot} />
              Go Live
            </button>
          </div>
        </div>

        {/* ── go live sheet ── */}
        {showGoLive && (
          <div className={s.overlay} onClick={() => setShowGoLive(false)}>
            <div className={s.sheet} onClick={e => e.stopPropagation()}>
              <div className={s.sheetHandle} />
              <h2 className={s.sheetTitle}>Start a Live Stream</h2>
              <p className={s.sheetSub}>Your followers will be notified when you go live</p>
              <label className={s.sheetLabel}>Stream title</label>
              <input
                className={s.sheetInput}
                placeholder="What are you streaming today?"
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && startStream()}
                maxLength={80}
                autoFocus
              />
              <div className={s.sheetBtns}>
                <button className={s.sheetCancel} onClick={() => setShowGoLive(false)}>Cancel</button>
                <button
                  className={s.sheetGo}
                  onClick={startStream}
                  disabled={goingLive || !titleInput.trim()}
                >
                  {goingLive ? <span className="spinner" /> : <>Start Live</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── stream grid ── */}
        {loadingList ? (
          <div className={s.loadWrap}>
            <span className="spinner" />
          </div>
        ) : streams.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/>
              </svg>
            </div>
            <div className={s.emptyTitle}>No live streams right now</div>
            <div className={s.emptySub}>Be the first one to go live today!</div>
            <button className={s.emptyGoLive} onClick={() => setShowGoLive(true)}>
              <span className={s.goLiveDot} /> Go Live
            </button>
          </div>
        ) : (
          <div className={s.grid}>
            {streams.map(st => (
              <StreamCard key={st.id} stream={st} onWatch={joinStream} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER — hosting / watching (full-screen live view)
  // ════════════════════════════════════════════════════════════════════════════
  const isHost    = view === 'hosting'
  const activeStr = isHost ? myStream : watchStream
  const streamTitle = activeStr?.title || ''
  const hostName    = isHost ? (user?.name || 'You') : (activeStr?.host_name || '')

  return (
    <div className={s.liveView}>
      {/* ── video area ── */}
      <div className={s.videoWrap}>
        {isHost ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`${s.video} ${cameraOff ? s.videoHidden : ''}`}
          />
        ) : (
          <img
            ref={remoteVideoRef}
            className={s.video}
            alt="Live stream"
          />
        )}

        {/* camera-off overlay */}
        {isHost && cameraOff && (
          <div className={s.camOffOverlay}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="2" x2="22" y2="22"/>
              <path d="M10.66 6H14a2 2 0 012 2v2.34L20 14V8a2 2 0 00-2-2H4.34"/>
              <path d="M4 6H4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 001.6-.8L4 6z"/>
            </svg>
            <span>Camera off</span>
          </div>
        )}

        {/* gradient overlays */}
        <div className={s.gradTop} />
        <div className={s.gradBottom} />

        {/* ── top HUD ── */}
        <div className={s.hud}>
          <div className={s.hudLeft}>
            <div className={s.liveBadge}>
              <span className={s.liveDot} />
              LIVE
            </div>
            <div className={s.hostInfo}>
              <Avatar
                user={{ name: hostName, avatar_color: isHost ? user?.avatar_color : activeStr?.host_color }}
                size={32}
              />
              <div className={s.hostMeta}>
                <span className={s.hostName}>{hostName}</span>
                <span className={s.streamTitleHud}>{streamTitle}</span>
              </div>
            </div>
          </div>
          <div className={s.hudRight}>
            <div className={s.viewerBadge}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zm0 12.5a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/>
              </svg>
              {fmtViewers(viewerCount)}
            </div>
            {isHost ? (
              <button className={s.endBtn} onClick={endStream}>End</button>
            ) : (
              <button className={s.leaveBtn} onClick={() => leaveStream(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── chat toggle (mobile) ── */}
        <button
          className={s.chatToggleBtn}
          onClick={() => setChatOpen(p => !p)}
          title={chatOpen ? 'Hide chat' : 'Show chat'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </button>

        {/* ── chat overlay (over video) ── */}
        {chatOpen && (
          <div className={s.chatOverlay}>
            <div className={s.chatFeed}>
              {chat.map((msg, i) => (
                <ChatMsg key={i} msg={msg} isSystem={!!msg.system} />
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className={s.chatInputRow}>
              <input
                ref={chatInputRef}
                className={s.chatInput}
                placeholder="Say something..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKey}
                maxLength={200}
              />
              <button
                className={`${s.chatSendBtn} ${chatInput.trim() ? s.chatSendActive : ''}`}
                onClick={sendChat}
                disabled={!chatInput.trim()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── host controls ── */}
        {isHost && (
          <div className={s.controls}>
            <button
              className={`${s.ctrlBtn} ${muted ? s.ctrlOff : ''}`}
              onClick={toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="2" y1="2" x2="22" y2="22"/>
                  <path d="M12 17A5 5 0 017 12V7.5M9 9v3a3 3 0 005.12 2.12M19 12a7 7 0 01-1.41 4.24M5.41 5.41A7 7 0 005 12a7 7 0 007 7 7 7 0 004.59-1.74M12 19v3M8 23h8"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
                </svg>
              )}
            </button>
            <button
              className={`${s.ctrlBtn} ${cameraOff ? s.ctrlOff : ''}`}
              onClick={toggleCamera}
              title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {cameraOff ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="2" y1="2" x2="22" y2="22"/>
                  <path d="M10.66 6H14a2 2 0 012 2v2.34L20 14V8a2 2 0 00-2-2H4.34"/>
                  <path d="M4 6H4a2 2 0 00-2 2v8a2 2 0 002 2h12"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
