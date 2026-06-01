import { createContext, useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { connectSocket, disconnectSocket, getSocket } from '../utils/socket'

export const AppContext = createContext(null)

const API = (import.meta.env.VITE_API_BASE || 'http://localhost:5001') + '/api'

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

  const pcRef                = useRef(null)
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

    s.on('call_incoming', d => setIncomingCall({
      from: d.from, callId: d.call_id, offer: d.offer,
      callType: d.call_type, callerName: d.caller_name, callerColor: d.caller_color,
    }))

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

    s.on('call_declined', () => { cleanupCall(); addToast('Call was declined', 'info') })
    s.on('call_ended',    () => { cleanupCall(); addToast('Call ended',        'info') })

    s.on('ice_candidate', async ({ candidate }) => {
      const pc = pcRef.current
      if (!pc || !candidate) return
      if (remoteDescSet.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      } else {
        pendingCandidatesRef.current.push(candidate)
      }
    })

    s.on('friend_request',  u => {
      addToast(`${u.name} sent you a friend request!`, 'info')
      setUser(p => p ? { ...p, pending_requests: (p.pending_requests || 0) + 1 } : p)
    })
    s.on('friend_accepted', u => addToast(`${u.name} accepted your friend request!`, 'success'))
    s.on('broadcast', d => addToast(`📢 ${d.from}: ${d.message}`, 'warning'))

    // ── Live unread count updates ──────────────────────────────────────────
    s.on('new_message', msg => {
      // Only update unread if WE are the receiver and it's a new message from someone else
      // We get our own user_id from the token
      try {
        const tokenData = JSON.parse(atob(token.split('.')[1]))
        const myId = tokenData.user_id
        if (msg.receiver_id === myId && msg.sender_id !== myId) {
          setUser(p => p ? { ...p, unread_count: (p.unread_count || 0) + 1 } : p)
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
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' },
                   { urls: 'stun:stun1.l.google.com:19302' }]
    })
    pcRef.current = pc
    remoteDescSet.current = false
    pendingCandidatesRef.current = []

    const remStream = new MediaStream()
    pc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remStream.addTrack(t))
      setRemoteStream(new MediaStream(remStream.getTracks()))
    }

    pc.onicecandidate = e => {
      if (e.candidate) getSocket()?.emit('ice_candidate', { to: peerId, candidate: e.candidate })
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupCall(); addToast('Call connection lost', 'error')
      }
    }

    return pc
  }

  // ── Start outgoing call ───────────────────────────────────────────────────
  async function startCall(friendId, callType = 'audio') {
    const s = getSocket()
    if (!s) { addToast('Not connected. Please refresh the page.', 'error'); return }

    // Check if HTTPS (required for microphone/camera)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      addToast('Calling requires HTTPS. Use: https://the-chating.47.129.200.84.nip.io', 'error')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        callType === 'video' ? { audio: true, video: true } : { audio: true }
      )
      localStreamRef.current = stream
      setLocalStream(stream)

      const pc = createPC(friendId)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      s.emit('call_offer', { to: friendId, offer, call_type: callType })
      setActiveCall({ peerId: friendId, callId: null, callType, outgoing: true })
    } catch(err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        addToast('Microphone/camera permission denied. Allow it in your browser settings.', 'error')
      } else if (err.name === 'NotFoundError') {
        addToast('No microphone found. Please connect one and try again.', 'error')
      } else {
        addToast('Could not start call: ' + err.message, 'error')
      }
      cleanupCall()
    }
  }

  // ── Accept incoming call ──────────────────────────────────────────────────
  async function acceptCall() {
    const s = getSocket()
    if (!s || !incomingCall) return
    const { from, callId, offer, callType } = incomingCall
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        callType === 'video' ? { audio: true, video: true } : { audio: true }
      )
      localStreamRef.current = stream
      setLocalStream(stream)

      const pc = createPC(from)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      remoteDescSet.current = true

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      s.emit('call_answer', { to: from, answer, call_id: callId })

      setIncomingCall(null)
      setActiveCall({ peerId: from, callId, callType, outgoing: false })
      startTimer()
    } catch {
      addToast('Could not access microphone/camera', 'error')
      declineCall()
    }
  }

  function declineCall() {
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
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    pcRef.current?.close(); pcRef.current = null
    remoteDescSet.current = false
    pendingCandidatesRef.current = []
    setLocalStream(null); setRemoteStream(null)
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
  async function login(email, password) {
    const r = await axios.post(`${API}/login`, { email, password })
    localStorage.setItem('s_token', r.data.token)
    const me = await axios.get(`${API}/me`, { headers: { Authorization: `Bearer ${r.data.token}` } })
    setUser(me.data); setupSocket(r.data.token)
    return r.data
  }

  async function signup(name, email, password, phone) {
    const r = await axios.post(`${API}/signup`, { name, email, password, phone })
    localStorage.setItem('s_token', r.data.token)
    const me = await axios.get(`${API}/me`, { headers: { Authorization: `Bearer ${r.data.token}` } })
    setUser(me.data); setupSocket(r.data.token)
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
      incomingCall, activeCall,
      localStream, remoteStream,
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
