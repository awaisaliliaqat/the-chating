import { useState, useEffect, useRef, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import { getSocket } from '../utils/socket'
import Avatar from '../components/Avatar'
import s from './LiveStream.module.css'

export default function LiveStream() {
  const { api, user, addToast } = useContext(AppContext)
  const [streams,    setStreams]    = useState([])
  const [activeStream, setActiveStream] = useState(null)  // stream I'm watching
  const [myStream,   setMyStream]  = useState(null)       // stream I'm hosting
  const [title,      setTitle]     = useState('')
  const [chat,       setChat]      = useState([])
  const [chatInput,  setChatInput] = useState('')
  const [viewerCount,setViewerCount]=useState(0)
  const [localStream,setLocalStream]=useState(null)
  const videoRef   = useRef(null)
  const remoteRef  = useRef(null)
  const wsCallRef  = useRef(null)
  const chatEnd    = useRef(null)

  useEffect(() => {
    api('/live-streams').then(r => setStreams(r.data)).catch(()=>{})
    const socket = getSocket()
    if (!socket) return
    socket.on('live_stream_started', (s) => setStreams(p => [s,...p]))
    socket.on('live_stream_ended', ({stream_id}) => setStreams(p => p.filter(s => s.id!==stream_id)))
    socket.on('stream_viewer_count', ({stream_id,count}) => { if (activeStream?.id===stream_id || myStream?.id===stream_id) setViewerCount(count) })
    socket.on('stream_video_frame', ({frame}) => { if (remoteRef.current) remoteRef.current.src=frame })
    socket.on('stream_chat', (msg) => setChat(p => [...p, msg]))
    return () => {
      socket.off('live_stream_started')
      socket.off('live_stream_ended')
      socket.off('stream_viewer_count')
      socket.off('stream_video_frame')
      socket.off('stream_chat')
    }
  }, [activeStream, myStream]) // eslint-disable-line

  useEffect(() => { chatEnd.current?.scrollIntoView({behavior:'smooth'}) }, [chat])

  async function goLive() {
    if (!title.trim()) { addToast('Enter a title first', 'error'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:true,audio:true})
      setLocalStream(stream)
      if (videoRef.current) videoRef.current.srcObject = stream
      const r = await api('/live-streams', { method:'POST', data:{title} })
      setMyStream(r.data)
      addToast('🔴 You are live!', 'success')
      // Stream frames via WebSocket
      const canvas = document.createElement('canvas')
      canvas.width=320; canvas.height=240
      const ctx = canvas.getContext('2d')
      const vEl = document.createElement('video')
      vEl.srcObject=stream; vEl.autoplay=true; vEl.muted=true
      const interval = setInterval(() => {
        ctx.drawImage(vEl,0,0,320,240)
        const frame = canvas.toDataURL('image/jpeg',0.3)
        getSocket()?.emit('stream_video_frame',{stream_id:r.data.id,frame})
      }, 100)
      wsCallRef.current = interval
    } catch(err) { addToast('Camera/mic access denied', 'error') }
  }

  async function endStream() {
    if (wsCallRef.current) clearInterval(wsCallRef.current)
    localStream?.getTracks().forEach(t=>t.stop())
    setLocalStream(null)
    if (myStream) await api(`/live-streams/${myStream.id}`,{method:'DELETE'})
    setMyStream(null); setViewerCount(0); setChat([])
  }

  function watchStream(stream) {
    setActiveStream(stream)
    setChat([]); setViewerCount(stream.viewer_count||0)
    getSocket()?.emit('join_live_stream',{stream_id:stream.id})
  }

  function leaveStream() {
    getSocket()?.emit('leave_live_stream',{stream_id:activeStream?.id})
    setActiveStream(null); setChat([])
  }

  function sendChat() {
    if (!chatInput.trim()) return
    const sid = myStream?.id || activeStream?.id
    getSocket()?.emit('stream_chat_msg',{stream_id:sid,text:chatInput,name:user?.name})
    setChat(p=>[...p,{name:'You',text:chatInput}])
    setChatInput('')
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>📺 Live Streams</h1>
        {!myStream && !activeStream && (
          <div className={s.goLiveArea}>
            <input className={s.titleInput} placeholder="Stream title..." value={title} onChange={e=>setTitle(e.target.value)} />
            <button className={s.liveBtn} onClick={goLive}>🔴 Go Live</button>
          </div>
        )}
      </div>

      {/* Hosting a stream */}
      {myStream && (
        <div className={s.streamBox}>
          <div className={s.streamHeader}>
            <div className={s.liveBadge}>🔴 LIVE</div>
            <div className={s.streamTitle}>{myStream.title}</div>
            <div className={s.viewerBadge}>👁 {viewerCount}</div>
            <button className={s.endBtn} onClick={endStream}>End Stream</button>
          </div>
          <div className={s.streamBody}>
            <video ref={videoRef} autoPlay playsInline muted className={s.video} />
            <div className={s.chatPanel}>
              <div className={s.chatMessages}>
                {chat.map((m,i) => <div key={i} className={s.chatMsg}><strong>{m.name}:</strong> {m.text}</div>)}
                <div ref={chatEnd}/>
              </div>
              <div className={s.chatInput}>
                <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder="Say something..." className={s.chatField}/>
                <button className={s.sendChat} onClick={sendChat}>➤</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Watching a stream */}
      {activeStream && !myStream && (
        <div className={s.streamBox}>
          <div className={s.streamHeader}>
            <div className={s.liveBadge}>🔴 LIVE</div>
            <div className={s.streamTitle}>{activeStream.title}</div>
            <div className={s.viewerBadge}>👁 {viewerCount}</div>
            <button className={s.endBtn} onClick={leaveStream}>Leave</button>
          </div>
          <div className={s.streamBody}>
            <img ref={remoteRef} className={s.video} alt="Stream" style={{objectFit:'cover'}}/>
            <div className={s.chatPanel}>
              <div className={s.chatMessages}>
                {chat.map((m,i) => <div key={i} className={s.chatMsg}><strong>{m.name}:</strong> {m.text}</div>)}
                <div ref={chatEnd}/>
              </div>
              <div className={s.chatInput}>
                <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder="Say something..." className={s.chatField}/>
                <button className={s.sendChat} onClick={sendChat}>➤</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stream list */}
      {!myStream && !activeStream && (
        <>
          {streams.length===0 && <div className={s.empty}><div style={{fontSize:52}}>📺</div><div style={{fontSize:18,fontWeight:700,color:'var(--text-primary)'}}>No live streams right now</div><div style={{fontSize:13,color:'var(--text-muted)'}}>Be the first to go live!</div></div>}
          {streams.map(st => (
            <div key={st.id} className={s.streamCard} onClick={() => watchStream(st)}>
              <div className={s.streamCardBg} />
              <div className={s.streamCardInfo}>
                <div className={s.streamCardLive}>🔴 LIVE</div>
                <div className={s.streamCardTitle}>{st.title}</div>
                <div className={s.streamCardHost}>by {st.host_name}</div>
                <div className={s.streamCardViewers}>👁 {st.viewer_count||0} watching</div>
              </div>
              <button className={s.watchBtn}>Watch →</button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
