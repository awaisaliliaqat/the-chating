import { useContext, useRef, useEffect } from 'react'
import { AppContext } from '../context/AppContext'
import Avatar from './Avatar'
import s from './CallModal.module.css'

function fmtTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2,'0')
  const ss = (secs % 60).toString().padStart(2,'0')
  return `${m}:${ss}`
}

export default function CallModal() {
  const {
    user, incomingCall, activeCall,
    localStream, remoteStream,
    callDuration, isMuted, isCameraOff,
    acceptCall, declineCall, endCall,
    toggleMute, toggleCamera,
  } = useContext(AppContext)

  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)

  useEffect(() => {
    if (localVideoRef.current && localStream)
      localVideoRef.current.srcObject = localStream
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream)
      remoteVideoRef.current.srcObject = remoteStream
  }, [remoteStream])

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
            <div className={s.pulseDots}>
              <span /><span /><span />
            </div>
          </div>
          <div className={s.incomingBtns}>
            <button className={`${s.callBtn} ${s.decline}`} onClick={declineCall}>
              <span>📵</span>
              Decline
            </button>
            <button className={`${s.callBtn} ${s.accept}`} onClick={acceptCall}>
              <span>{isVideo ? '📹' : '📞'}</span>
              Accept
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Active call screen ───────────────────────────────────────────────────
  if (activeCall) {
    const isVideo = activeCall.callType === 'video'
    const peerUser = { id: activeCall.peerId, name: 'Calling…', avatar_color: '#6366f1' }

    if (isVideo) {
      return (
        <div className={s.overlay}>
          <div className={s.videoCall}>
            {/* Remote video */}
            <video ref={remoteVideoRef} autoPlay playsInline className={s.remoteVideo} />
            {!remoteStream && (
              <div className={s.waitingOverlay}>
                <div className={s.callerAvatar} style={{ fontSize: 48, width: 100, height: 100 }}>
                  {(incomingCall?.callerName || 'C').slice(0,2).toUpperCase()}
                </div>
                <div className={s.callerName}>Connecting…</div>
              </div>
            )}
            {/* Local video PiP */}
            <video ref={localVideoRef} autoPlay playsInline muted className={s.localVideo} />
            {/* Timer */}
            <div className={s.callTimer}>{fmtTime(callDuration)}</div>
            {/* Controls */}
            <div className={s.videoControls}>
              <button className={`${s.ctrlBtn} ${isMuted ? s.active : ''}`} onClick={toggleMute}>
                {isMuted ? '🔇' : '🎙️'}
              </button>
              <button className={`${s.ctrlBtn} ${isCameraOff ? s.active : ''}`} onClick={toggleCamera}>
                {isCameraOff ? '📷' : '📹'}
              </button>
              <button className={`${s.ctrlBtn} ${s.endBtn}`} onClick={endCall}>📵</button>
            </div>
          </div>
        </div>
      )
    }

    // Audio call
    return (
      <div className={s.overlay}>
        <div className={s.modal}>
          <div className={s.callTimer} style={{ marginBottom: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
            {activeCall.outgoing && !remoteStream ? 'Calling…' : fmtTime(callDuration)}
          </div>
          <div className={s.callerAvatar} style={{ background: '#6366f1', margin: '16px auto' }}>
            {user?.name?.slice(0,1).toUpperCase()}
          </div>
          <div className={s.callerName}>{activeCall.outgoing ? 'Outgoing call' : 'On a call'}</div>
          <div className={s.audioWave}>
            <span /><span /><span /><span /><span />
          </div>
          <div className={s.audioControls}>
            <button className={`${s.ctrlBtn} ${isMuted ? s.active : ''}`} onClick={toggleMute}>
              {isMuted ? '🔇' : '🎙️'}
            </button>
            <button className={`${s.ctrlBtn} ${s.endBtn}`} onClick={endCall}>📵</button>
          </div>
          {/* Invisible audio elements */}
          <audio ref={remoteVideoRef} autoPlay />
          <audio ref={localVideoRef} autoPlay muted />
        </div>
      </div>
    )
  }

  return null
}
