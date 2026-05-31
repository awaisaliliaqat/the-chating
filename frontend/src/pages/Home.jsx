import { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import StoryBar from '../components/StoryBar'
import s from './Home.module.css'

function timeAgo(dt) {
  if (!dt) return ''
  const d=new Date(dt+'Z'),diff=(Date.now()-d)/1000
  if (diff<60) return 'just now'
  if (diff<3600) return `${Math.floor(diff/60)}m ago`
  if (diff<86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

function getGreeting() {
  const h=new Date().getHours()
  if (h<12) return 'Good morning'
  if (h<18) return 'Good afternoon'
  return 'Good evening'
}

export default function Home() {
  const { user, api, onlineUsers, startCall } = useContext(AppContext)
  const navigate = useNavigate()
  const [friends, setFriends] = useState([])
  const [convos,  setConvos]  = useState([])

  useEffect(() => {
    api('/friends').then(r=>setFriends(r.data)).catch(()=>{})
    api('/messages/conversations').then(r=>setConvos(r.data)).catch(()=>{})
  }, []) // eslint-disable-line

  const onlineFriends = friends.filter(f => onlineUsers.has(f.id))

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div>
          <div className={s.greeting}>{getGreeting()}, {user?.name?.split(' ')[0]} 👋</div>
          <div className={s.subtext}>Here's what's happening</div>
        </div>
        <Avatar user={user} size={44} online />
      </div>

      {/* Stories */}
      <div className={s.storiesSection}>
        <div className={s.sectionLabel}>📖 Stories</div>
        <StoryBar />
      </div>

      {/* Stats */}
      <div className={s.stats}>
        {[
          { icon:'👥', value: user?.friends_count||0, label:'Friends'      },
          { icon:'💬', value: convos.length,           label:'Conversations'},
          { icon:'🟢', value: onlineFriends.length,    label:'Online now'  },
          { icon:'📨', value: user?.unread_count||0,   label:'Unread'      },
        ].map(({ icon,value,label }) => (
          <div key={label} className={s.statCard}>
            <span className={s.statIcon}>{icon}</span>
            <div>
              <div className={s.statValue}>{value}</div>
              <div className={s.statLabel}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Two panels */}
      <div className={s.grid}>
        {/* Online friends */}
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <span className={s.panelTitle}>🟢 Online Friends</span>
            <button className={s.seeAll} onClick={()=>navigate('/friends')}>See all</button>
          </div>
          {onlineFriends.length===0 ? (
            <div className={s.empty}>No friends online right now</div>
          ) : (
            <div className={s.onlineList}>
              {onlineFriends.slice(0,6).map(f=>(
                <div key={f.id} className={s.onlineItem}>
                  <Avatar user={f} size={38} online />
                  <div className={s.onlineInfo}>
                    <div className={s.onlineName}>{f.name}</div>
                    <div className={s.onlineStatus}><span className="online-dot" style={{width:6,height:6}}/> Active now</div>
                  </div>
                  <div className={s.onlineActions}>
                    <button className={s.iconBtn} onClick={()=>navigate(`/messages/${f.id}`)}>💬</button>
                    <button className={s.iconBtn} onClick={()=>startCall(f.id,'audio')}>📞</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent conversations */}
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <span className={s.panelTitle}>💬 Recent Chats</span>
            <button className={s.seeAll} onClick={()=>navigate('/messages')}>See all</button>
          </div>
          {convos.length===0 ? (
            <div className={s.empty}>No conversations yet</div>
          ) : (
            <div className={s.convoList}>
              {convos.slice(0,6).map(c=>(
                <div key={c.peer_id} className={s.convoItem} onClick={()=>navigate(`/messages/${c.peer_id}`)}>
                  <Avatar user={{name:c.peer_name,avatar_color:c.peer_color,avatar_b64:c.peer_avatar}} size={38} online={onlineUsers.has(c.peer_id)} />
                  <div className={s.convoInfo}>
                    <div className={s.convoName}>{c.peer_name}</div>
                    <div className={s.convoLast}>
                      {c.sender_id===user?.id?'You: ':''}
                      {c.msg_type==='image'?'📷 Photo':c.msg_type==='audio'?'🎤 Voice':c.content}
                    </div>
                  </div>
                  <div className={s.convoMeta}>
                    <span className={s.convoTime}>{timeAgo(c.created_at)}</span>
                    {c.unread>0&&<span className={s.unreadBadge}>{c.unread}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
