import { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './Extras.module.css'

const GIFTS = [
  { type:'rose',     emoji:'🌹', name:'Rose'        },
  { type:'heart',    emoji:'❤️',  name:'Heart'       },
  { type:'cake',     emoji:'🎂',  name:'Cake'        },
  { type:'trophy',   emoji:'🏆',  name:'Trophy'      },
  { type:'star',     emoji:'⭐',  name:'Gold Star'   },
  { type:'diamond',  emoji:'💎',  name:'Diamond'     },
  { type:'hug',      emoji:'🤗',  name:'Virtual Hug' },
  { type:'confetti', emoji:'🎊',  name:'Confetti'    },
]

export default function Extras() {
  const { api, user, onlineUsers, addToast } = useContext(AppContext)
  const navigate  = useNavigate()
  const [tab,          setTab]          = useState('gifts')
  const [achievements, setAchievements] = useState([])
  const [stats,        setStats]        = useState(null)
  const [friends,      setFriends]      = useState([])
  const [birthdays,    setBirthdays]    = useState([])
  const [sosContacts,  setSosContacts]  = useState([])
  const [suggestions,  setSuggestions]  = useState([])
  const [bookmarks,    setBookmarks]    = useState([])
  // Gift state
  const [giftTarget, setGiftTarget]     = useState(null)
  const [giftType,   setGiftType]       = useState('heart')
  const [giftMsg,    setGiftMsg]        = useState('')
  const [gifting,    setGifting]        = useState(false)
  // Music
  const [song,   setSong]   = useState(user?.music_status  || '')
  const [artist, setArtist] = useState(user?.music_artist  || '')
  // Birthday
  const [birthday, setBirthday] = useState(user?.birthday || '')

  useEffect(() => {
    api('/friends').then(r=>setFriends(r.data)).catch(()=>{})
    api('/birthdays/today').then(r=>setBirthdays(r.data)).catch(()=>{})
    api('/sos/contacts').then(r=>setSosContacts(r.data)).catch(()=>{})
    api('/users/suggestions').then(r=>setSuggestions(r.data)).catch(()=>{})
    api('/bookmarks').then(r=>setBookmarks(r.data)).catch(()=>{})
  }, []) // eslint-disable-line

  useEffect(() => {
    if (tab==='achievements') api('/achievements').then(r=>setAchievements(r.data)).catch(()=>{})
    if (tab==='stats') api('/messages/stats/mine').then(r=>setStats(r.data)).catch(()=>{})
  }, [tab]) // eslint-disable-line

  async function sendGift() {
    if (!giftTarget) return
    setGifting(true)
    try {
      await api('/gifts', { method:'POST', data:{ to:giftTarget.id, gift_type:giftType, message:giftMsg } })
      addToast(`${GIFTS.find(g=>g.type===giftType)?.emoji} Gift sent to ${giftTarget.name}!`, 'success')
      setGiftTarget(null); setGiftMsg('')
    } catch { addToast('Failed to send gift', 'error') }
    finally { setGifting(false) }
  }

  async function sendSOS() {
    if (!window.confirm('Send SOS to your emergency contacts?')) return
    try {
      let lat=null, lng=null
      try {
        const pos = await new Promise((res,rej) => navigator.geolocation.getCurrentPosition(res,rej,{timeout:5000}))
        lat=pos.coords.latitude; lng=pos.coords.longitude
      } catch {}
      const r = await api('/sos/send', { method:'POST', data:{ lat, lng } })
      addToast(`🚨 ${r.data.message}`, 'success')
    } catch { addToast('SOS failed', 'error') }
  }

  async function addSosContact(uid) {
    await api('/sos/contacts', { method:'POST', data:{ contact_id:uid } })
    const f = friends.find(x=>x.id===uid)
    if (f) setSosContacts(p => [...p, f])
    addToast('Added to SOS contacts', 'success')
  }

  async function saveMusicStatus() {
    await api('/users/music', { method:'PUT', data:{ song, artist } })
    addToast('Music status updated 🎵', 'success')
  }

  async function saveBirthday() {
    await api('/users/birthday', { method:'PUT', data:{ birthday } })
    addToast('Birthday saved 🎂', 'success')
  }

  async function addFriend(uid) {
    await api(`/friends/request/${uid}`, { method:'POST' })
    setSuggestions(p => p.filter(x => x.id!==uid))
    addToast('Friend request sent!', 'success')
  }

  const TABS = [
    { id:'gifts',        icon:'🎁',  label:'Gifts'       },
    { id:'achievements', icon:'🏆',  label:'Achievements'},
    { id:'stats',        icon:'📊',  label:'My Stats'    },
    { id:'birthdays',    icon:'🎂',  label:'Birthdays'   },
    { id:'sos',          icon:'🚨',  label:'SOS'         },
    { id:'suggest',      icon:'🤝',  label:'Suggestions' },
    { id:'music',        icon:'🎵',  label:'Music'       },
    { id:'bookmarks',    icon:'🔖',  label:'Bookmarks'   },
  ]

  return (
    <div className={s.page}>
      <h1 className={s.title}>✨ Extras</h1>

      <div className={s.tabBar}>
        {TABS.map(t=>(
          <button key={t.id} className={`${s.tabBtn} ${tab===t.id?s.tabActive:''}`} onClick={()=>setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── GIFTS ── */}
      {tab==='gifts' && (
        <div className={s.section}>
          <p className={s.hint}>Send a virtual gift to make someone's day! 🎁</p>
          {!giftTarget ? (
            <div className={s.friendGrid}>
              {friends.map(f => (
                <div key={f.id} className={s.friendCard} onClick={() => setGiftTarget(f)}>
                  <Avatar user={f} size={44} online={onlineUsers.has(f.id)} />
                  <div className={s.friendName}>{f.name.split(' ')[0]}</div>
                </div>
              ))}
              {friends.length===0 && <div className={s.empty}>Add friends first to send gifts!</div>}
            </div>
          ) : (
            <div className={s.giftBox}>
              <div className={s.giftHeader}>
                <Avatar user={giftTarget} size={42} />
                <div>Sending to <strong>{giftTarget.name}</strong></div>
                <button className={s.closeBtn} onClick={()=>setGiftTarget(null)}>✕</button>
              </div>
              <div className={s.giftGrid}>
                {GIFTS.map(g => (
                  <button key={g.type} className={`${s.giftBtn} ${giftType===g.type?s.giftActive:''}`} onClick={() => setGiftType(g.type)}>
                    <span style={{fontSize:28}}>{g.emoji}</span>
                    <span style={{fontSize:11}}>{g.name}</span>
                  </button>
                ))}
              </div>
              <input className={s.inp} placeholder="Add a message... (optional)" value={giftMsg} onChange={e=>setGiftMsg(e.target.value)} maxLength={100} />
              <button className={s.sendBtn} onClick={sendGift} disabled={gifting}>
                {gifting ? <span className="spinner"/> : `Send ${GIFTS.find(g=>g.type===giftType)?.emoji} Gift`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── ACHIEVEMENTS ── */}
      {tab==='achievements' && (
        <div className={s.section}>
          <div className={s.achievGrid}>
            {achievements.map(a => (
              <div key={a.key} className={`${s.achievCard} ${a.earned?s.achievEarned:s.achievLocked}`}>
                <div className={s.achievIcon}>{a.icon}</div>
                <div className={s.achievName}>{a.name}</div>
                <div className={s.achievDesc}>{a.description}</div>
                {a.earned && <div className={s.earnedBadge}>✓ Earned</div>}
                {!a.earned && <div className={s.lockedBadge}>🔒 Locked</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STATS ── */}
      {tab==='stats' && stats && (
        <div className={s.section}>
          <div className={s.statsGrid}>
            {[
              { icon:'📤', v:stats.total_sent,     l:'Messages Sent'     },
              { icon:'📥', v:stats.total_received, l:'Messages Received' },
              { icon:'⏰', v:stats.busiest_hour ? `${stats.busiest_hour}:00` : '—', l:'Most Active Hour' },
            ].map(({icon,v,l}) => (
              <div key={l} className={s.statCard}>
                <div className={s.statIcon}>{icon}</div>
                <div className={s.statVal}>{v}</div>
                <div className={s.statLabel}>{l}</div>
              </div>
            ))}
          </div>
          {stats.top_friends?.length > 0 && (
            <>
              <div className={s.sectionLabel}>Top Friends</div>
              {stats.top_friends.map(f => (
                <div key={f.friend_id} className={s.topFriendRow}>
                  <div className={s.topFriendDot} style={{background:f.avatar_color}} />
                  <div className={s.topFriendName}>{f.friend_name}</div>
                  <div className={s.topFriendCount}>{f.msg_count} messages</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── BIRTHDAYS ── */}
      {tab==='birthdays' && (
        <div className={s.section}>
          <div className={s.sectionLabel}>🎂 Today's Birthdays</div>
          {birthdays.length===0 ? <div className={s.empty}>No birthdays today</div> : birthdays.map(u => (
            <div key={u.id} className={s.birthdayRow}>
              <Avatar user={u} size={40} />
              <div className={s.birthdayInfo}>
                <div className={s.birthdayName}>{u.name}</div>
                <div className={s.birthdayMsg}>🎂 Happy Birthday!</div>
              </div>
              <button className={s.wishBtn} onClick={() => navigate(`/messages/${u.id}`)}>Wish 💌</button>
            </div>
          ))}
          <div className={s.sectionLabel} style={{marginTop:20}}>My Birthday</div>
          <div className={s.row}>
            <input type="date" className={s.inp} value={birthday} onChange={e=>setBirthday(e.target.value)} />
            <button className={s.saveBtn} onClick={saveBirthday}>Save</button>
          </div>
          <p className={s.hint}>Your friends will be notified on your birthday 🎁</p>
        </div>
      )}

      {/* ── SOS ── */}
      {tab==='sos' && (
        <div className={s.section}>
          <div className={s.sosBox}>
            <div style={{fontSize:48}}>🚨</div>
            <div className={s.sosTitle}>Emergency SOS</div>
            <div className={s.sosDesc}>Sends your location to all SOS contacts instantly</div>
            <button className={s.sosBtn} onClick={sendSOS}>🆘 SEND SOS NOW</button>
          </div>
          <div className={s.sectionLabel}>SOS Contacts ({sosContacts.length})</div>
          {sosContacts.map(c => (
            <div key={c.id} className={s.sosContactRow}>
              <Avatar user={c} size={36} />
              <div className={s.sosContactName}>{c.name}</div>
              <button className={s.removeBtn} onClick={async()=>{
                await api('/sos/contacts',{method:'DELETE',data:{contact_id:c.id}})
                setSosContacts(p=>p.filter(x=>x.id!==c.id))
              }}>Remove</button>
            </div>
          ))}
          <div className={s.sectionLabel} style={{marginTop:16}}>Add SOS Contact</div>
          <div className={s.friendGrid}>
            {friends.filter(f=>!sosContacts.find(s=>s.id===f.id)).map(f => (
              <div key={f.id} className={s.friendCard} onClick={()=>addSosContact(f.id)}>
                <Avatar user={f} size={36} />
                <div className={s.friendName}>{f.name.split(' ')[0]}</div>
                <div style={{fontSize:10,color:'var(--green)'}}>+ Add</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUGGESTIONS ── */}
      {tab==='suggest' && (
        <div className={s.section}>
          <p className={s.hint}>People you may know based on mutual friends</p>
          {suggestions.length===0 && <div className={s.empty}>No suggestions right now</div>}
          {suggestions.map(u => (
            <div key={u.id} className={s.suggestRow}>
              <Avatar user={u} size={44} online={onlineUsers.has(u.id)} />
              <div className={s.suggestInfo}>
                <div className={s.suggestName}>{u.name}</div>
                {u.mutual_count && <div className={s.suggestMutual}>{u.mutual_count} mutual friends</div>}
              </div>
              <button className={s.addFriendBtn} onClick={()=>addFriend(u.id)}>+ Add</button>
            </div>
          ))}
        </div>
      )}

      {/* ── MUSIC ── */}
      {tab==='music' && (
        <div className={s.section}>
          <div className={s.musicPreview}>
            <span style={{fontSize:36}}>🎵</span>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:'var(--text-primary)'}}>{song || 'Not playing'}</div>
              {artist && <div style={{fontSize:13,color:'var(--text-muted)'}}>by {artist}</div>}
            </div>
          </div>
          <label className={s.fieldLabel}>Song / Track name</label>
          <input className={s.inp} placeholder="e.g. Blinding Lights" value={song} onChange={e=>setSong(e.target.value)} maxLength={80} />
          <label className={s.fieldLabel}>Artist</label>
          <input className={s.inp} placeholder="e.g. The Weeknd" value={artist} onChange={e=>setArtist(e.target.value)} maxLength={60} />
          <button className={s.saveBtn} onClick={saveMusicStatus}>Save Music Status 🎵</button>
          <button className={s.clearBtn} onClick={()=>{setSong('');setArtist('');api('/users/music',{method:'PUT',data:{song:'',artist:''}});addToast('Music status cleared','info')}}>Clear</button>
        </div>
      )}

      {/* ── BOOKMARKS ── */}
      {tab==='bookmarks' && (
        <div className={s.section}>
          {bookmarks.length===0 && <div className={s.empty}>No bookmarks yet<br/>Right-click any message → Bookmark</div>}
          {bookmarks.map(b => (
            <div key={b.id} className={s.bookmarkRow}>
              <div className={s.bookmarkIcon}>🔖</div>
              <div className={s.bookmarkContent}>
                {b.sender_name && <div className={s.bookmarkFrom}>{b.sender_name}</div>}
                <div className={s.bookmarkText}>{b.msg_content || b.note || 'Saved item'}</div>
              </div>
              <button className={s.removeBtn} onClick={async()=>{
                await api(`/bookmarks/${b.id}`,{method:'DELETE'})
                setBookmarks(p=>p.filter(x=>x.id!==b.id))
              }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
