import { createContext, useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { connectSocket, disconnectSocket, getSocket } from '../utils/socket'
import { WSCall } from '../utils/wsCall'

export const AppContext = createContext(null)

// Always use VITE_API_BASE in production build
// Falls back to same-origin (works on any server) — never uses localhost in production
const API = (import.meta.env.VITE_API_BASE || window.location.origin) + '/api'

export function AppProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [theme,       setTheme]       = useState(localStorage.getItem('s_theme') || 'dark')
  const [toasts,      setToasts]      = useState([])
  const [onlineUsers,    setOnlineUsers]    = useState(new Set())
  const [availableUsers, setAvailableUsers] = useState(new Map()) // userId -> userObj
  const [badWordAlerts,  setBadWordAlerts]  = useState([])        // pending admin alerts

  // Call state
  const [incomingCall, setIncomingCall] = useState(null) // {from,callId,offer,callType,callerName,callerColor}
  const [activeCall,   setActiveCall]   = useState(null) // {peerId,callId,callType,outgoing}
  const [localStream,  setLocalStream]  = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [callDuration, setCallDuration] = useState(0)
  const [isMuted,      setIsMuted]      = useState(false)
  const [isCameraOff,  setIsCameraOff]  = useState(false)
  const [micBlocked,   setMicBlocked]   = useState(false)

  const pcRef                = useRef(null)
  const callSpeechRef        = useRef(null)  // Speech recognition during calls
  const localStreamRef       = useRef(null)
  const callTimerRef         = useRef(null)
  const pendingCandidatesRef = useRef([])
  const remoteDescSet        = useRef(false)

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('s_theme', theme)
  }, [theme])

  // Toasts
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(p => [...p, { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }, [])
  const removeToast = id => setToasts(p => p.filter(t => t.id !== id))

  // Auth header helper
  const auth = () => {
    const t = localStorage.getItem('s_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  // Axios wrapper
  const api = (path, opts = {}) =>
    axios({ url: `${API}${path}`, headers: { ...auth(), ...(opts.headers || {}) }, ...opts })

  // Register service worker for push notifications
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})

    // Handle navigation messages from service worker (notification click)
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'navigate' && e.data.url) {
        window.location.href = e.data.url
      }
    })
  }, [])

  // Boot: restore session
  useEffect(() => {
    const token = localStorage.getItem('s_token')
    if (!token) { setLoading(false); return }
    axios.get(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { setUser(r.data); setupSocket(token) })
      .catch(() => localStorage.removeItem('s_token'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line

  // ── Socket setup ─────────────────────────────────────────────────────────
  function setupSocket(token) {
    const s = connectSocket(token)

    s.on('user_online',  ({ user_id }) => setOnlineUsers(p => new Set([...p, user_id])))
    s.on('user_offline', ({ user_id }) => {
      setOnlineUsers(p => { const n = new Set(p); n.delete(user_id); return n })
      setAvailableUsers(p => { const n = new Map(p); n.delete(user_id); return n })
    })
    s.on('user_availability', ({ user_id, available, user: uObj }) => {
      setAvailableUsers(p => {
        const n = new Map(p)
        if (available && uObj) n.set(user_id, uObj)
        else n.delete(user_id)
        return n
      })
    })

    s.on('call_incoming', d => {
      setIncomingCall({
        from: d.from, callId: d.call_id, offer: d.offer,
        callType: d.call_type, callerName: d.caller_name, callerColor: d.caller_color,
      })
      // Start ringing — keeps going until answered/declined
      startRing()
      // Push notification
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`📞 Incoming call from ${d.caller_name}`, {
            body: `${d.call_type === 'video' ? '📹 Video' : '📞 Audio'} call`,
            icon: '/favicon.ico',
          })
        }
      } catch { /* ignore notification errors */ }
    })

    s.on('call_answered', async ({ answer, call_id }) => {
      const pc = pcRef.current
      if (!pc) return
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        remoteDescSet.current = true
        for (const c of pendingCandidatesRef.current)
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
        pendingCandidatesRef.current = []
        setActiveCall(p => p ? { ...p, callId: call_id } : null)
        startTimer()
      } catch(e) { console.error('call_answered error:', e) }
    })

    s.on('call_declined', () => { stopRing(); cleanupCall(); addToast('Call was declined', 'info') })
    s.on('call_ended',    () => { stopRing(); cleanupCall(); addToast('Call ended',        'info') })

    s.on('ice_candidate', async ({ candidate }) => {
      const pc = pcRef.current
      if (!pc || !candidate) return
      if (remoteDescSet.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      } else {
        pendingCandidatesRef.current.push(candidate)
      }
    })

    s.on('gift_received', d => {
      addToast(`${d.emoji} ${d.sender_name} sent you a ${d.name}! "${d.message||'💝'}"`, 'success')
    })
    s.on('achievement_earned', d => {
      addToast(`🏆 Achievement unlocked: ${d.icon} ${d.name} — ${d.description}`, 'success')
    })
    s.on('sos_alert', d => {
      addToast(`🚨 SOS from ${d.name}! ${d.map_url}`, 'error')
    })
    s.on('warning_received', d => {
      addToast(`⚠️ Warning from admin: ${d.reason}`, 'warning')
    })

    s.on('friend_request',  u => {
      addToast(`${u.name} sent you a friend request!`, 'info')
      setUser(p => p ? { ...p, pending_requests: (p.pending_requests || 0) + 1 } : p)
    })
    s.on('friend_accepted', u => addToast(`${u.name} accepted your friend request!`, 'success'))
    s.on('broadcast', d => addToast(`📢 ${d.from}: ${d.message}`, 'warning'))

    // ── Live unread count + in-app toast notification ─────────────────────
    s.on('new_message', msg => {
      try {
        const tokenData = JSON.parse(atob(token.split('.')[1]))
        const myId = tokenData.user_id
        if (msg.receiver_id === myId && msg.sender_id !== myId) {
          // Update badge count
          setUser(p => p ? { ...p, unread_count: (p.unread_count || 0) + 1 } : p)

          // In-app notification if NOT on the messages page
          const onMsgsPage = window.location.pathname.startsWith('/messages')
          if (!onMsgsPage) {
            const senderName = msg.sender_name || 'Someone'
            const preview    = msg.msg_type === 'image' ? '📷 Photo'
                             : msg.msg_type === 'audio' ? '🎤 Voice message'
                             : (msg.content || '').slice(0, 60)
            addToast(`💬 ${senderName}: ${preview}`, 'info')
          }

          // Browser notification if tab is hidden
          if (document.hidden && Notification.permission === 'granted') {
            const senderName = msg.sender_name || 'Someone'
            const preview = msg.msg_type === 'image' ? '📷 Photo'
                          : msg.msg_type === 'audio' ? '🎤 Voice message'
                          : (msg.content || '').slice(0, 80)
            try {
              new Notification(`💬 ${senderName}`, {
                body: preview,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-72.png',
                tag: `msg_${msg.sender_id}`,
              })
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    })

    s.on('messages_read', () => {
      // When peer reads our messages, no action needed on our side
    })
    s.on('bad_word_alert', d => {
      setBadWordAlerts(p => [d, ...p.slice(0, 49)])  // keep last 50
      addToast(`🚨 Bad word from @${d.sender_name}: "${d.bad_words.join(', ')}"`, 'error')
    })
    s.on('force_logout', ({ reason }) => {
      alert(reason || 'You have been disconnected.')
      localStorage.removeItem('s_token')
      disconnectSocket()
      setUser(null)
      setOnlineUsers(new Set())
      window.location.href = '/login'
    })
  }

  // ── Call timer ────────────────────────────────────────────────────────────
  // ── Phone Ring Engine ─────────────────────────────────────────────────────
  const ringCtxRef      = useRef(null)
  const ringIntervalRef = useRef(null)

  function startRing() {
    stopRing()   // clear any previous ring
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      ringCtxRef.current = ctx

      // Vibrate phone on mobile
      if (navigator.vibrate) {
        navigator.vibrate([400,200,400,200,400,200,400,200,400,200,400,200,400])
      }

      // The "trtrtrtrtrtrtrt" pattern:
      // A rapid tremolo tone (like a classic landline phone ring)
      function playRingBurst() {
        const t = ctx.currentTime

        // Create the carrier oscillator (phone ring frequency)
        const osc    = ctx.createOscillator()
        const lfo    = ctx.createOscillator()
        const lfoGain= ctx.createGain()
        const master = ctx.createGain()

        osc.type      = 'sine'
        osc.frequency.value = 820   // main ring frequency

        // LFO at 25 Hz = rapid "trtrtrtr" vibration
        lfo.type      = 'square'
        lfo.frequency.value = 25

        lfoGain.gain.value = 0.5
        master.gain.value  = 0.0

        lfo.connect(lfoGain)
        lfoGain.connect(master.gain)  // amplitude modulation
        osc.connect(master)
        master.connect(ctx.destination)

        // Second tone for richness (phone uses 2 tones)
        const osc2   = ctx.createOscillator()
        const master2= ctx.createGain()
        osc2.type    = 'sine'
        osc2.frequency.value = 640
        master2.gain.value   = 0.0
        lfoGain.connect(master2.gain)
        osc2.connect(master2)
        master2.connect(ctx.destination)

        // Envelope: ring for 1s, then pause 0.6s, repeat
        const ringOn  = 1.0
        const ringOff = 0.6

        // Fade in
        master.gain.linearRampToValueAtTime(0.5, t + 0.02)
        master2.gain.linearRampToValueAtTime(0.3, t + 0.02)
        // Fade out
        master.gain.setValueAtTime(0.5, t + ringOn - 0.05)
        master.gain.linearRampToValueAtTime(0.0, t + ringOn)
        master2.gain.setValueAtTime(0.3, t + ringOn - 0.05)
        master2.gain.linearRampToValueAtTime(0.0, t + ringOn)

        osc.start(t);  osc.stop(t + ringOn)
        osc2.start(t); osc2.stop(t + ringOn)
        lfo.start(t);  lfo.stop(t + ringOn)
      }

      // Play first burst immediately, then repeat every 1.6s
      playRingBurst()
      ringIntervalRef.current = setInterval(() => {
        if (ringCtxRef.current) playRingBurst()
      }, 1600)

    } catch { /* ignore */ }
  }

  function stopRing() {
    if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null }
    try { ringCtxRef.current?.close() } catch {}
    ringCtxRef.current = null
    if (navigator.vibrate) navigator.vibrate(0)  // stop vibration
  }

  // ── Media error handler ───────────────────────────────────────────────────
  function handleMediaError(err, callType = 'audio') {
    console.error('Media error:', err.name, err.message)
    const name = err.name || ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      addToast('🚫 Microphone access was BLOCKED by your browser. See instructions below.', 'error')
      setMicBlocked(true)
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      addToast('🎙️ No microphone found on this device.', 'error')
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      addToast('🎙️ Microphone is being used by another app. Close it and try again.', 'error')
    } else if (name === 'OverconstrainedError') {
      addToast('📷 Camera not available. Trying audio only…', 'warning')
    } else if (name === 'TypeError') {
      addToast('❌ Your browser does not support calls. Try Chrome or Firefox.', 'error')
    } else {
      addToast(`❌ Call error: ${err.message || err.name}`, 'error')
    }
  }

  // ── Call Speech Monitor — detects bad words said during calls ────────────
  function startCallSpeechMonitor(peerId) {
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SR) return
      const sr = new SR()
      sr.continuous     = true
      sr.interimResults = false
      sr.lang           = 'en-US'

      sr.onresult = async (e) => {
        const transcript = Array.from(e.results)
          .map(r => r[0].transcript)
          .join(' ')
          .trim()
        if (transcript) {
          // Send to backend for bad word checking
          try {
            await axios.post(`${API}/flag/voice`,
              { transcript, receiver_id: peerId },
              { headers: auth() }
            )
          } catch { /* ignore */ }
        }
      }

      sr.onerror = () => {}
      sr.onend   = () => {
        // Restart if call still active
        if (callSpeechRef.current === sr) {
          try { sr.start() } catch {}
        }
      }

      sr.start()
      callSpeechRef.current = sr
    } catch { /* speech recognition not available */ }
  }

  function stopCallSpeechMonitor() {
    if (callSpeechRef.current) {
      try { callSpeechRef.current.stop() } catch {}
      callSpeechRef.current = null
    }
  }

  function startTimer() {
    const start = Date.now()
    setCallDuration(0)
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    callTimerRef.current = setInterval(
      () => setCallDuration(Math.floor((Date.now() - start) / 1000)), 1000)
  }

  // ── Create RTCPeerConnection ──────────────────────────────────────────────
  function createPC(peerId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        // STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // OUR OWN TURN server — most reliable
        {
          urls: [
            'turn:47.129.200.84:3478',
            'turn:47.129.200.84:3478?transport=tcp',
          ],
          username:   'thechating',
          credential: 'callswork2024',
        },
        // Backup public TURN servers
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443?transport=tcp',
          ],
          username:   'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
    })
    pcRef.current = pc
    remoteDescSet.current = false
    pendingCandidatesRef.current = []

    // Use the stream directly from the event — most reliable approach
    pc.ontrack = e => {
      console.log('🔊 Got remote track:', e.track.kind, 'streams:', e.streams.length)
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0])
      } else {
        // Fallback: create stream from track
        setRemoteStream(prev => {
          const s = prev || new MediaStream()
          s.addTrack(e.track)
          return new MediaStream(s.getTracks())
        })
      }
    }

    pc.onicecandidate = e => {
      if (e.candidate) getSocket()?.emit('ice_candidate', { to: peerId, candidate: e.candidate })
    }

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState)
      if (pc.connectionState === 'failed') {
        // Try ICE restart before giving up
        try { pc.restartIce() } catch { cleanupCall(); addToast('Call failed to connect', 'error') }
      }
      if (pc.connectionState === 'closed') {
        cleanupCall()
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce() } catch { /* ignore */ }
      }
    }

    return pc
  }

  // ── Start outgoing call ───────────────────────────────────────────────────
  // ── WebSocket-based call engine (works through any firewall) ─────────────
  const wsCallRef = useRef(null)
  const [remoteVideoFrame, setRemoteVideoFrame] = useState(null)

  async function startCall(friendId, callType = 'audio') {
    const s = getSocket()
    if (!s) { addToast('Not connected — please refresh.', 'error'); return }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      addToast('Calls require HTTPS. Open: https://the-chating.trading-ai.bot', 'error'); return
    }
    try {
      const wsc = new WSCall(s, friendId, callType)
      wsc.onLocalStream  = (stream) => { localStreamRef.current = stream; setLocalStream(stream) }
      wsc.onRemoteVideo  = (frame)  => setRemoteVideoFrame(frame)
      wsCallRef.current  = wsc

      // Start receiving BEFORE sending (so socket listeners are ready)
      wsc.startReceiving()
      await wsc.startSending()

      // Notify the other person via signaling
      s.emit('call_offer', { to: friendId, offer: null, call_type: callType, ws_mode: true })
      setActiveCall({ peerId: friendId, callId: null, callType, outgoing: true })
      startTimer()
      startCallSpeechMonitor(friendId)  // Monitor caller's speech for bad words
    } catch(err) {
      handleMediaError(err, callType)
      cleanupCall()
    }
  }

  // ── Accept incoming call ──────────────────────────────────────────────────
  async function acceptCall() {
    stopRing()
    const s = getSocket()
    if (!s || !incomingCall) return
    const { from, callId, callType } = incomingCall
    try {
      const wsc = new WSCall(s, from, callType)
      wsc.onLocalStream  = (stream) => { localStreamRef.current = stream; setLocalStream(stream) }
      wsc.onRemoteVideo  = (frame)  => setRemoteVideoFrame(frame)
      wsCallRef.current  = wsc

      wsc.startReceiving()
      await wsc.startSending()

      s.emit('call_answer', { to: from, answer: null, call_id: callId, ws_mode: true })

      setIncomingCall(null)
      setActiveCall({ peerId: from, callId, callType, outgoing: false })
      startTimer()
      startCallSpeechMonitor(from)  // Monitor receiver's speech too
    } catch(err) {
      handleMediaError(err, callType)
      declineCall()
    }
  }

  function declineCall() {
    stopRing()
    const s = getSocket()
    if (incomingCall) s?.emit('call_decline', { to: incomingCall.from, call_id: incomingCall.callId })
    setIncomingCall(null)
  }

  function endCall() {
    const s = getSocket()
    if (activeCall) s?.emit('call_end', { to: activeCall.peerId, call_id: activeCall.callId, duration: callDuration })
    cleanupCall()
  }

  function cleanupCall() {
    stopCallSpeechMonitor()  // Stop speech monitoring when call ends
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    wsCallRef.current?.stop(); wsCallRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    pcRef.current?.close(); pcRef.current = null
    setLocalStream(null); setRemoteStream(null)
    setRemoteVideoFrame(null)
    setActiveCall(null);  setIncomingCall(null)
    setCallDuration(0);   setIsMuted(false); setIsCameraOff(false)
  }

  function toggleMute() {
    const t = localStreamRef.current?.getAudioTracks()[0]
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled) }
  }

  function toggleCamera() {
    const t = localStreamRef.current?.getVideoTracks()[0]
    if (t) { t.enabled = !t.enabled; setIsCameraOff(!t.enabled) }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  // ── Push notification subscription ───────────────────────────────────────
  async function subscribeToPush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        addToast('Push notifications not supported on this browser', 'error'); return false
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        addToast('Notification permission denied', 'error'); return false
      }
      const reg = await navigator.serviceWorker.ready
      // Get VAPID public key from server
      const keyResp = await axios.get(`${API}/push/vapid-key`)
      const vapidKey = keyResp.data.publicKey
      // Convert base64 to Uint8Array
      const raw = atob(vapidKey.replace(/-/g,'+').replace(/_/g,'/').padEnd(vapidKey.length + (4 - vapidKey.length % 4) % 4, '='))
      const uint8 = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) uint8[i] = raw.charCodeAt(i)
      // Subscribe
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: uint8 })
      await api('/push/subscribe', { method: 'POST', data: sub.toJSON() })
      addToast('✅ Call notifications enabled! You\'ll ring even when offline.', 'success')
      return true
    } catch(err) {
      addToast('Failed to enable notifications: ' + (err.message || err), 'error'); return false
    }
  }

  async function login(email, password) {
    const r = await axios.post(`${API}/login`, { email, password })
    localStorage.setItem('s_token', r.data.token)
    const me = await axios.get(`${API}/me`, { headers: { Authorization: `Bearer ${r.data.token}` } })
    setUser(me.data); setupSocket(r.data.token)
    // Auto-subscribe to push notifications for offline call ringing
    setTimeout(() => subscribeToPush().catch(() => {}), 2000)
    return r.data
  }

  async function signup(name, email, password, phone) {
    const r = await axios.post(`${API}/signup`, { name, email, password, phone })
    localStorage.setItem('s_token', r.data.token)
    const me = await axios.get(`${API}/me`, { headers: { Authorization: `Bearer ${r.data.token}` } })
    setUser(me.data); setupSocket(r.data.token)
    setTimeout(() => subscribeToPush().catch(() => {}), 2000)
    return r.data
  }

  function logout() {
    localStorage.removeItem('s_token')
    disconnectSocket(); cleanupCall()
    setUser(null); setOnlineUsers(new Set()); setAvailableUsers(new Map())
  }

  return (
    <AppContext.Provider value={{
      user, setUser, loading,
      theme, toggleTheme: () => setTheme(t => t === 'dark' ? 'light' : 'dark'),
      toasts, addToast, removeToast,
      onlineUsers, availableUsers, badWordAlerts, setBadWordAlerts,
      micBlocked, setMicBlocked, subscribeToPush,
      incomingCall, activeCall,
      localStream, remoteStream, remoteVideoFrame,
      callDuration, isMuted, isCameraOff,
      startCall, acceptCall, declineCall, endCall,
      toggleMute, toggleCamera,
      login, signup, logout,
      api, auth,
    }}>
      {children}
    </AppContext.Provider>
  )
}
