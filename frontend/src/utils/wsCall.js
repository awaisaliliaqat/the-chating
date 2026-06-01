/**
 * WebSocket-based Audio/Video Call Engine
 * Audio and video go through the server — works through any firewall/NAT.
 */

export class WSCall {
  constructor(socket, peerId, callType = 'audio') {
    this.socket    = socket
    this.peerId    = peerId
    this.callType  = callType
    this.stream    = null        // local stream
    this.audioCtx  = null        // Web Audio context
    this.processor = null        // ScriptProcessor for capture
    this.videoEl   = null        // hidden video for capture
    this.canvas    = null        // canvas for frame grab
    this.vidTimer  = null        // video frame interval
    this.remoteAudioCtx = null   // context for playing remote audio
    this.nextAudioTime  = 0      // jitter buffer time
    this.onRemoteVideo  = null   // callback(dataUrl) for video frame
    this.onLocalStream  = null   // callback(stream)
  }

  // ── Start sending media ─────────────────────────────────────────────────
  async startSending() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) throw new Error('Web Audio not supported')

    const constraints = this.callType === 'video'
      ? { audio: true, video: { width:320, height:240, frameRate:8 } }
      : { audio: true, video: false }

    this.stream = await navigator.mediaDevices.getUserMedia(constraints)
    if (this.onLocalStream) this.onLocalStream(this.stream)

    // ── Audio capture ──────────────────────────────────────────────────
    this.audioCtx = new AC({ sampleRate: 16000 })
    const source  = this.audioCtx.createMediaStreamSource(this.stream)
    // 2048 samples at 16kHz = 128ms chunk
    this.processor = this.audioCtx.createScriptProcessor(2048, 1, 1)

    this.processor.onaudioprocess = (e) => {
      const f32 = e.inputBuffer.getChannelData(0)
      // Convert Float32 → Int16 (halves data size)
      const i16 = new Int16Array(f32.length)
      for (let i = 0; i < f32.length; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32767))
      }
      this.socket.emit('call_ws_audio', {
        to:         this.peerId,
        pcm16:      Array.from(i16),
        sampleRate: 16000,
      })
    }

    source.connect(this.processor)
    this.processor.connect(this.audioCtx.destination)

    // ── Video capture ──────────────────────────────────────────────────
    if (this.callType === 'video') {
      this.videoEl = document.createElement('video')
      this.videoEl.srcObject = this.stream
      this.videoEl.autoplay  = true
      this.videoEl.muted     = true
      this.videoEl.playsInline = true

      this.canvas = document.createElement('canvas')
      this.canvas.width  = 320
      this.canvas.height = 240
      const ctx = this.canvas.getContext('2d')

      // 8fps video
      this.vidTimer = setInterval(() => {
        if (this.videoEl.readyState >= 2) {
          ctx.drawImage(this.videoEl, 0, 0, 320, 240)
          const frame = this.canvas.toDataURL('image/jpeg', 0.25)
          this.socket.emit('call_ws_video', { to: this.peerId, frame })
        }
      }, 125)
    }

    return this.stream
  }

  // ── Start receiving media ───────────────────────────────────────────────
  startReceiving() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.remoteAudioCtx = new AC({ sampleRate: 16000 })
    this.nextAudioTime  = this.remoteAudioCtx.currentTime + 0.05

    this.socket.on('call_ws_audio', ({ from, pcm16, sampleRate }) => {
      if (from !== this.peerId) return
      this._playAudioChunk(pcm16, sampleRate || 16000)
    })

    this.socket.on('call_ws_video', ({ from, frame }) => {
      if (from !== this.peerId) return
      if (this.onRemoteVideo) this.onRemoteVideo(frame)
    })
  }

  // ── Play received audio chunk ──────────────────────────────────────────
  _playAudioChunk(pcm16, sampleRate) {
    if (!this.remoteAudioCtx) return
    try {
      const i16    = new Int16Array(pcm16)
      const f32    = new Float32Array(i16.length)
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32767

      const buf    = this.remoteAudioCtx.createBuffer(1, f32.length, sampleRate)
      buf.getChannelData(0).set(f32)

      const src    = this.remoteAudioCtx.createBufferSource()
      src.buffer   = buf

      // Gain for volume control
      const gain   = this.remoteAudioCtx.createGain()
      gain.gain.value = 1.5   // slightly boost received audio

      src.connect(gain)
      gain.connect(this.remoteAudioCtx.destination)

      // Jitter buffer: schedule slightly ahead to avoid gaps
      const now = this.remoteAudioCtx.currentTime
      if (this.nextAudioTime < now) this.nextAudioTime = now + 0.02
      src.start(this.nextAudioTime)
      this.nextAudioTime += buf.duration
    } catch { /* ignore */ }
  }

  // ── Stop everything ─────────────────────────────────────────────────────
  stop() {
    if (this.vidTimer)   { clearInterval(this.vidTimer); this.vidTimer = null }
    if (this.processor)  { try { this.processor.disconnect() } catch {} }
    if (this.stream)     { this.stream.getTracks().forEach(t => t.stop()) }
    try { this.audioCtx?.close() }       catch {}
    try { this.remoteAudioCtx?.close() } catch {}
    this.socket.off('call_ws_audio')
    this.socket.off('call_ws_video')
    this.stream = null
    this.audioCtx = null
    this.remoteAudioCtx = null
  }
}
