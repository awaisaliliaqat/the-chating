import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import s from './StoryBar.module.css'

const BG_COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#06b6d4']

export default function StoryBar() {
  const { user, api, addToast } = useContext(AppContext)
  const [stories,   setStories]   = useState([])
  const [viewing,   setViewing]   = useState(null)   // story object
  const [composing, setComposing] = useState(false)
  const [storyText, setStoryText] = useState('')
  const [storyColor, setStoryColor] = useState(BG_COLORS[0])

  useEffect(() => {
    api('/stories/feed').then(r => setStories(r.data)).catch(() => {})
  }, []) // eslint-disable-line

  // Group stories by user
  const grouped = stories.reduce((acc, st) => {
    const key = st.user_id
    if (!acc[key]) acc[key] = { user_id: st.user_id, user_name: st.user_name, user_color: st.user_color, user_avatar: st.user_avatar, stories: [] }
    acc[key].stories.push(st)
    return acc
  }, {})
  const groups = Object.values(grouped)

  async function postStory() {
    if (!storyText.trim()) return
    try {
      const r = await api('/stories', { method:'POST', data:{ content: storyText, bg_color: storyColor, type:'text' } })
      setStories(p => [{ ...r.data, user_name: user.name, user_color: user.avatar_color, user_avatar: user.avatar_b64 }, ...p])
      setComposing(false); setStoryText('')
      addToast('Story posted! Expires in 24h', 'success')
    } catch { addToast('Failed to post story', 'error') }
  }

  async function viewStory(story) {
    setViewing(story)
    api(`/stories/${story.id}/view`, { method:'POST' }).catch(()=>{})
  }

  const initials = n => (n||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()
  const myGroup  = grouped[user?.id]

  return (
    <>
      <div className={s.bar}>
        {/* Add your story */}
        <div className={s.addStory} onClick={() => setComposing(true)}>
          <div className={s.addAvatar} style={{ background: user?.avatar_color }}>
            {user?.avatar_b64
              ? <img src={user.avatar_b64} className={s.avatarImg} alt="" />
              : initials(user?.name)
            }
            <span className={s.addPlus}>+</span>
          </div>
          <span className={s.storyLabel}>Your story</span>
        </div>

        {/* Friend stories */}
        {groups.filter(g => g.user_id !== user?.id).map(g => {
          const allViewed = g.stories.every(st => st.viewed)
          return (
            <div key={g.user_id} className={s.storyItem} onClick={() => viewStory(g.stories[0])}>
              <div className={`${s.storyRing} ${allViewed ? s.viewed : ''}`}>
                <div className={s.storyAvatar} style={{ background: g.user_color }}>
                  {g.user_avatar
                    ? <img src={g.user_avatar} className={s.avatarImg} alt="" />
                    : initials(g.user_name)
                  }
                </div>
              </div>
              <span className={s.storyLabel}>{g.user_name.split(' ')[0]}</span>
            </div>
          )
        })}

        {/* Own story preview */}
        {myGroup && (
          <div className={s.storyItem} onClick={() => viewStory(myGroup.stories[0])}>
            <div className={s.storyRing}>
              <div className={s.storyAvatar} style={{ background: user?.avatar_color }}>
                {user?.avatar_b64 ? <img src={user.avatar_b64} className={s.avatarImg} alt="" /> : initials(user?.name)}
              </div>
            </div>
            <span className={s.storyLabel}>My story</span>
          </div>
        )}
      </div>

      {/* View story overlay */}
      {viewing && (
        <div className={s.overlay} onClick={() => setViewing(null)}>
          <div className={s.storyView} style={{ background: viewing.bg_color }} onClick={e => e.stopPropagation()}>
            <div className={s.storyHeader}>
              <div className={s.storyUserAvatar} style={{ background: viewing.user_color || user?.avatar_color }}>
                {initials(viewing.user_name || user?.name)}
              </div>
              <div>
                <div className={s.storyUserName}>{viewing.user_name || user?.name}</div>
                <div className={s.storyTime}>{timeAgo(viewing.created_at)}</div>
              </div>
              <button className={s.closeBtn} onClick={() => setViewing(null)}>✕</button>
            </div>
            {viewing.type === 'image' && viewing.file_b64
              ? <img src={viewing.file_b64} className={s.storyImage} alt="" />
              : <div className={s.storyContent}>{viewing.content}</div>
            }
          </div>
        </div>
      )}

      {/* Compose story */}
      {composing && (
        <div className={s.overlay} onClick={() => setComposing(false)}>
          <div className={s.compose} onClick={e => e.stopPropagation()}>
            <h3 className={s.composeTitle}>Add to Story</h3>
            <div className={s.preview} style={{ background: storyColor }}>
              <div className={s.previewText}>{storyText || 'Type something…'}</div>
            </div>
            <textarea
              className={s.textInput}
              placeholder="What's on your mind?"
              value={storyText}
              onChange={e => setStoryText(e.target.value)}
              rows={3}
              maxLength={200}
              autoFocus
            />
            <div className={s.colorRow}>
              {BG_COLORS.map(c => (
                <button key={c} className={`${s.colorBtn} ${storyColor===c?s.colorActive:''}`}
                  style={{ background: c }} onClick={() => setStoryColor(c)} />
              ))}
            </div>
            <div className={s.composeBtns}>
              <button className={s.cancelBtn} onClick={() => setComposing(false)}>Cancel</button>
              <button className={s.postBtn} onClick={postStory} disabled={!storyText.trim()}>Share Story</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function timeAgo(dt) {
  if (!dt) return ''
  const diff = (Date.now() - new Date(dt+'Z')) / 1000
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  return `${Math.floor(diff/3600)}h ago`
}
