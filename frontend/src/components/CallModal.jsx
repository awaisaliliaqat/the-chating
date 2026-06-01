import { useContext, useRef, useEffect, useState } from 'react'
import { AppContext } from '../context/AppContext'
import Avatar from './Avatar'
import s from './CallModal.module.css'

function fmtTime(secs) {
  const m  = Math.floor(secs / 60).toString().padStart(2,'0')
  const ss = (secs % 60).toString().padStart(2,'0')
  return `${m}:${ss}`
}

export default function CallModal() {
  const {
    user, incomingCall, activeCall,
    localStream, remoteStream, remoteVideoFrame,
    callDuration, isMuted, isCameraOff,
    acceptCall, declineCall, endCall,
    toggleMute, toggleCamera,
  } = useContext(AppContext)

  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)
  // Dedicated audio element always in DOM — never conditionally rendered
  const remoteAudioRef = useRef(null)
  const localAudioRef  = useRef(null)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  // ── Attach LOCAL stream ─────────────────────────────────────────────────
  useEffect(() => {
    const el = localVideoRef.current || localAudioRef.current
    if (el && localStream) {
      el.srcObject = localStream
      el.play().catch(() => {})
    }
  }, [localStream])

  // ── Attach REMOTE stream (most important fix) ───────────────────────────
  useEffect(() => {
    if (!remoteStream) return

    // Try video element first, then audio element
    const videoEl = remoteVideoRef.current
    const audioEl = remoteAudioRef.current

    if (videoEl) {
      videoEl.srcObject = remoteStream
      videoEl.play().catch(() => {})
    }

    if (audioEl) {
      audioEl.srcObject = remoteStream
      audioEl.play().catch(err => {
        console.warn('Autoplay blocked, showing tap-to-hear:', err)
        setAutoplayBlocked(true)
      })
    }
  }, [remoteStream])

  // ── Re-attach when elements mount (fixes timing issue) ─────────────────
  const attachRemoteAudio = (el) => {
    remoteAudioRef.current = el
    if (el && remoteStream) {
      el.srcObject = remoteStream
      el.play().catch(() => setAutoplayBlocked(true))
    }
  }

  function tapToHear() {
    const el = remoteAudioRef.current
    if (el) el.play().then(() => setAutoplayBlocked(false)).catch(() => {})
  }

  // ── Incoming call screen ─────────────────────────────────────────────────
  if (incomingCall && !activeCall) {
    const isVideo = incomingCall.callType === 'video'
    return (
      <div className={s.overlay}>
        <div className={s.modal}>
          <div className={s.ringing}>
            <div className={s.callerAvatar} style={{ background: incomingCall.callerColor }}>
              {incomingCall.callerName.slice(0,2).toUpperCase()}
            </div>
            <div className={s.callerName}>{incomingCall.callerName}</div>
            <div className={s.callTypeLabel}>
              {isVideo ? '📹 Incoming video call' : '📞 Incoming audio call'}
            </div>
            <div className={s.pulseDots}><span /><span /><span /></div>
          </div>
          <div className={s.incomingBtns}>
            <button className={`${s.callBtn} ${s.decline}`} onClick={declineCall}>
              <span>📵</span>Decline
            </button>
            <button className={`${s.callBtn} ${s.accept}`} onClick={acceptCall}>
              <span>{isVideo ? '📹' : '📞'}</span>Accept
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Active call ──────────────────────────────────────────────────────────
  if (!activeCall) return null

  const isVideo = activeCall.callType === 'video'

  return (
    <div className={s.overlay}>
      {/* ── ALWAYS render audio elements regardless of video/audio mode ── */}
      {/* This ensures they exist in DOM before stream arrives           */}
      <audio ref={attachRemoteAudio} autoPlay playsInline
             style={{ display:'none' }} />
      <audio ref={localAudioRef} autoPlay playsInline muted
             style={{ display:'none' }} />

      {/* ── Autoplay blocked warning ── */}
      {autoplayBlocked && (
        <div className={s.tapToHear} onClick={tapToHear}>
          🔊 Tap here to hear the call
        </div>
      )}

      {isVideo ? (
        /* ── VIDEO CALL ── */
        <div className={s.videoCall}>
          {/* WebSocket video: show received JPEG frames */}
          {remoteVideoFrame
            ? <img src={remoteVideoFrame} className={s.remoteVideo} alt="Remote video" />
            : <video ref={remoteVideoRef} autoPlay playsInline className={s.remoteVideo}
                     onLoadedMetadata={e => e.target.play().catch(()=>{})} />
          }
          {!remoteVideoFrame && !remoteStream && (
            <div className={s.waitingOverlay}>
              <div className={s.callerAvatar} style={{ fontSize:48, width:100, height:100 }}>
                {user?.name?.slice(0,2).toUpperCase()}
              </div>
              <div className={s.callerName}>Connecting…</div>
            </div>
          )}
          <video ref={localVideoRef} autoPlay playsInline muted className={s.localVideo}
                 onLoadedMetadata={e => e.target.play().catch(()=>{})} />
          <div className={s.callTimer}>{fmtTime(callDuration)}</div>
          <div className={s.videoControls}>
            <button className={`${s.ctrlBtn} ${isMuted?s.active:''}`} onClick={toggleMute}>
              {isMuted?'🔇':'🎙️'}
            </button>
            <button className={`${s.ctrlBtn} ${isCameraOff?s.active:''}`} onClick={toggleCamera}>
              {isCameraOff?'📷':'📹'}
            </button>
            <button className={`${s.ctrlBtn} ${s.endBtn}`} onClick={endCall}>📵</button>
          </div>
        </div>
      ) : (
        /* ── AUDIO CALL ── */
        <div className={s.modal}>
          <div style={{ marginBottom:0, color:'var(--text-secondary)', fontSize:13, textAlign:'center' }}>
            {activeCall.outgoing && callDuration === 0 ? 'Calling…' : fmtTime(callDuration)}
          </div>

          {/* Peer avatar */}
          <div className={s.audioAvatar}>
            <div className={s.callerAvatar} style={{ background:'#6366f1', width:80, height:80, fontSize:30 }}>
              {(activeCall.outgoing ? '?' : user?.name?.slice(0,1) || '?').toUpperCase()}
            </div>
            {remoteStream && <div className={s.connectedBadge}>🟢 Connected</div>}
          </div>

          <div className={s.callerName} style={{textAlign:'center', margin:'8px 0 4px'}}>
            {activeCall.outgoing ? 'Calling…' : 'On a call'}
          </div>

          {/* Audio wave animation (shows when both connected) */}
          {remoteStream && (
            <div className={s.audioWave}>
              <span /><span /><span /><span /><span />
            </div>
          )}

          <div className={s.audioControls}>
            <button className={`${s.ctrlBtn} ${isMuted?s.active:''}`} onClick={toggleMute}
                    title={isMuted?'Unmute':'Mute'}>
              {isMuted?'🔇':'🎙️'}
            </button>
            <button className={`${s.ctrlBtn} ${s.endBtn}`} onClick={endCall}>📵</button>
          </div>
        </div>
      )}
    </div>
  )
}
