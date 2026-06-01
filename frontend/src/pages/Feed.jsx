import { useState, useEffect, useContext, useRef } from 'react'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './Feed.module.css'

const BG_COLORS = ['','#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6']

function timeAgo(dt) {
  if (!dt) return ''
  const diff = (Date.now() - new Date(dt+'Z')) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff/60)}m`
  if (diff < 86400) return `${Math.floor(diff/3600)}h`
  return `${Math.floor(diff/86400)}d`
}

export default function Feed() {
  const { user, api, addToast } = useContext(AppContext)
  const [posts,    setPosts]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [page,     setPage]     = useState(1)
  const [hasMore,  setHasMore]  = useState(true)
  const [compose,  setCompose]  = useState(false)
  const [postText, setPostText] = useState('')
  const [postImg,  setPostImg]  = useState(null)
  const [postBg,   setPostBg]   = useState('')
  const [posting,  setPosting]  = useState(false)
  const [comments, setComments] = useState({})   // post_id -> []
  const [showComments, setShowComments] = useState({})
  const [commentInput, setCommentInput] = useState({})
  const fileRef = useRef(null)

  useEffect(() => {
    loadPosts(1)
  }, []) // eslint-disable-line

  async function loadPosts(p = 1) {
    setLoading(true)
    try {
      const r = await api(`/feed?page=${p}`)
      if (p === 1) setPosts(r.data)
      else setPosts(prev => [...prev, ...r.data])
      setHasMore(r.data.length === 20)
      setPage(p)
    } finally { setLoading(false) }
  }

  async function createPost() {
    if (!postText.trim() && !postImg) return
    setPosting(true)
    try {
      const r = await api('/posts', { method:'POST', data:{ content:postText, image_b64:postImg, bg_color:postBg } })
      setPosts(p => [r.data, ...p])
      setCompose(false); setPostText(''); setPostImg(null); setPostBg('')
      addToast('Post shared! 🎉', 'success')
    } catch { addToast('Failed to post', 'error') }
    finally { setPosting(false) }
  }

  async function likePost(pid) {
    const r = await api(`/posts/${pid}/like`, { method:'POST' })
    setPosts(p => p.map(post => post.id===pid ? {...post, like_count:r.data.count, liked_by_me:r.data.liked?1:0} : post))
  }

  async function deletePost(pid) {
    if (!window.confirm('Delete this post?')) return
    await api(`/posts/${pid}`, { method:'DELETE' })
    setPosts(p => p.filter(post => post.id !== pid))
  }

  async function loadComments(pid) {
    const r = await api(`/posts/${pid}/comments`)
    setComments(p => ({...p, [pid]: r.data}))
    setShowComments(p => ({...p, [pid]: true}))
  }

  async function sendComment(pid) {
    const text = (commentInput[pid] || '').trim()
    if (!text) return
    const r = await api(`/posts/${pid}/comments`, { method:'POST', data:{ content:text } })
    setComments(p => ({...p, [pid]: [...(p[pid]||[]), r.data]}))
    setCommentInput(p => ({...p, [pid]: ''}))
    setPosts(p => p.map(post => post.id===pid ? {...post, comment_count:(post.comment_count||0)+1} : post))
  }

  async function pickImage(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPostImg(ev.target.result)
    reader.readAsDataURL(file)
  }

  return (
    <div className={s.page}>
      {/* Create post */}
      <div className={s.createCard} onClick={() => !compose && setCompose(true)}>
        {!compose ? (
          <div className={s.createRow}>
            <Avatar user={user} size={38} online />
            <div className={s.createPrompt}>What's on your mind, {user?.name?.split(' ')[0]}?</div>
          </div>
        ) : (
          <div className={s.composeBox}>
            {postBg ? (
              <div className={s.bgTextarea} style={{background:postBg}}>
                <textarea className={s.bgInput} placeholder="Type something..." value={postText} onChange={e=>setPostText(e.target.value)} autoFocus />
              </div>
            ) : (
              <textarea className={s.textarea} placeholder="What's on your mind?" value={postText} onChange={e=>setPostText(e.target.value)} autoFocus rows={3} />
            )}
            {postImg && <img src={postImg} className={s.imgPreview} alt="" onClick={() => setPostImg(null)} />}
            <div className={s.composeTools}>
              <div className={s.colorRow}>
                {BG_COLORS.map(c => (
                  <button key={c||'none'} className={`${s.colorDot} ${postBg===c?s.colorActive:''}`}
                    style={{background:c||'var(--bg-secondary)',border:c?'none':'1px solid var(--border)'}}
                    onClick={() => setPostBg(c)} />
                ))}
              </div>
              <div className={s.composeBtns}>
                <button className={s.addImgBtn} onClick={() => fileRef.current?.click()}>📷</button>
                <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={pickImage} />
                <button className={s.cancelBtn} onClick={()=>{setCompose(false);setPostText('');setPostImg(null);setPostBg('')}}>Cancel</button>
                <button className={s.postBtn} onClick={createPost} disabled={(!postText.trim()&&!postImg)||posting}>
                  {posting ? <span className="spinner"/> : 'Share'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Posts */}
      {posts.map(post => (
        <div key={post.id} className={s.postCard}>
          {/* Header */}
          <div className={s.postHeader}>
            <Avatar user={{name:post.user_name,avatar_color:post.user_color,avatar_b64:post.user_avatar}} size={40} />
            <div className={s.postHeaderInfo}>
              <div className={s.postAuthor}>
                {post.user_name}
                {post.user_verified ? <span className={s.verifiedBadge}>✓</span> : null}
              </div>
              <div className={s.postTime}>{timeAgo(post.created_at)}</div>
            </div>
            {post.user_id===user?.id && (
              <button className={s.deleteBtn} onClick={() => deletePost(post.id)}>🗑</button>
            )}
          </div>

          {/* Content */}
          {post.content && !post.bg_color && <div className={s.postContent}>{post.content}</div>}
          {post.content && post.bg_color && (
            <div className={s.postBgContent} style={{background:post.bg_color}}>{post.content}</div>
          )}
          {post.image_b64 && <img src={post.image_b64} className={s.postImage} alt="" onClick={() => window.open(post.image_b64)} />}

          {/* Actions */}
          <div className={s.postActions}>
            <button className={`${s.actionBtn} ${post.liked_by_me?s.liked:''}`} onClick={() => likePost(post.id)}>
              {post.liked_by_me ? '❤️' : '🤍'} {post.like_count||0}
            </button>
            <button className={s.actionBtn} onClick={() => showComments[post.id] ? setShowComments(p=>({...p,[post.id]:false})) : loadComments(post.id)}>
              💬 {post.comment_count||0}
            </button>
            <button className={s.actionBtn} onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}/post/${post.id}`)
              addToast('Link copied!', 'success')
            }}>🔗 Share</button>
          </div>

          {/* Comments */}
          {showComments[post.id] && (
            <div className={s.commentsSection}>
              {(comments[post.id]||[]).map(c => (
                <div key={c.id} className={s.comment}>
                  <div className={s.commentAvatar} style={{background:c.user_color}}>{c.user_name?.slice(0,1)}</div>
                  <div className={s.commentBody}>
                    <span className={s.commentAuthor}>{c.user_name}</span>
                    <span className={s.commentText}> {c.content}</span>
                  </div>
                </div>
              ))}
              <div className={s.commentInput}>
                <Avatar user={user} size={28} />
                <input className={s.commentField} placeholder="Add a comment..."
                  value={commentInput[post.id]||''}
                  onChange={e => setCommentInput(p=>({...p,[post.id]:e.target.value}))}
                  onKeyDown={e => e.key==='Enter' && sendComment(post.id)} />
                <button className={s.sendComment} onClick={() => sendComment(post.id)}>➤</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {loading && <div className={s.loading}><span className="spinner" style={{width:28,height:28,borderWidth:3}}/></div>}
      {!loading && posts.length===0 && (
        <div className={s.empty}>
          <div style={{fontSize:52}}>📸</div>
          <div style={{fontSize:18,fontWeight:700,color:'var(--text-primary)',marginTop:8}}>No posts yet</div>
          <div style={{fontSize:13,color:'var(--text-muted)'}}>Be the first to share something!</div>
        </div>
      )}
      {hasMore && !loading && (
        <button className={s.loadMore} onClick={() => loadPosts(page+1)}>Load more</button>
      )}
    </div>
  )
}
