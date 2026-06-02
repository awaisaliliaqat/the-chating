import { useState, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import s from './Profile.module.css'

export default function Profile() {
  const { user, setUser, api, addToast } = useContext(AppContext)

  const [form, setForm] = useState({
    name:     user?.name     || '',
    username: user?.username || '',
    phone:    user?.phone    || '',
    bio:      user?.bio      || '',
    avatar_b64: user?.avatar_b64 || null,
  })
  const [nickname,     setNickname]     = useState(user?.nickname || '')
  const [nickSaving,   setNickSaving]   = useState(false)
  const [nickError,    setNickError]    = useState('')
  const [pwdForm, setPwdForm] = useState({ current: '', new: '', confirm: '' })
  const [saving,  setSaving]  = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setP = k => e => setPwdForm(f => ({ ...f, [k]: e.target.value }))

  async function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setForm(f => ({ ...f, avatar_b64: ev.target.result }))
    reader.readAsDataURL(file)
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await api('/profile', { method: 'PUT', data: form })
      setUser(u => ({ ...u, ...r.data }))
      addToast('Profile updated!', 'success')
    } catch { addToast('Update failed', 'error') }
    finally { setSaving(false) }
  }

  async function handleSaveNickname(e) {
    e.preventDefault()
    setNickError('')
    if (!nickname.trim()) { setNickError('Nickname cannot be empty'); return }
    if (nickname.length < 3) { setNickError('At least 3 characters'); return }
    setNickSaving(true)
    try {
      const r = await api('/users/nickname', { method:'PUT', data:{ nickname:nickname.trim() } })
      setUser(u => ({ ...u, nickname: r.data.nickname }))
      addToast('Nickname updated! 🎉', 'success')
    } catch(err) {
      setNickError(err.response?.data?.message || 'Failed to update nickname')
    } finally { setNickSaving(false) }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (pwdForm.new !== pwdForm.confirm) {
      addToast('Passwords do not match', 'error'); return
    }
    setPwdSaving(true)
    try {
      await api('/password', { method: 'PUT', data: { current: pwdForm.current, new: pwdForm.new } })
      setPwdForm({ current: '', new: '', confirm: '' })
      addToast('Password changed!', 'success')
    } catch(err) {
      addToast(err.response?.data?.message || 'Failed', 'error')
    } finally { setPwdSaving(false) }
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString([], { year:'numeric', month:'long' })
    : ''

  // Show status
  const statusLine = user?.status_emoji || user?.status_text
    ? `${user.status_emoji || ''} ${user.status_text || ''}`.trim()
    : null

  return (
    <div className={s.page}>
      {/* Profile header */}
      <div className={s.hero}>
        <div style={{position:'relative',display:'inline-block'}}>
          <Avatar user={{...user, avatar_b64: form.avatar_b64}} size={80} online />
          <label style={{position:'absolute',bottom:0,right:0,background:'var(--accent)',borderRadius:'50%',width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:14,border:'2px solid var(--bg-primary)'}}>
            📷<input type="file" accept="image/*" style={{display:'none'}} onChange={handleAvatarChange}/>
          </label>
        </div>
        <div className={s.heroInfo}>
          <div className={s.heroName}>
            {user?.name}
            {user?.is_verified && <span style={{color:'#3b82f6',fontSize:16,marginLeft:4}} title="Verified">✓</span>}
          </div>
          {user?.username && <div style={{fontSize:13,color:'var(--accent)',fontWeight:600}}>@{user.username}</div>}
          {statusLine && <div style={{fontSize:13,color:'var(--text-secondary)',marginTop:2}}>{statusLine}</div>}
          <div className={s.heroEmail}>{user?.email}</div>
          {user?.bio_link && <a href={user.bio_link} target="_blank" rel="noreferrer" style={{fontSize:12,color:'var(--accent)'}}>{user.bio_link}</a>}
          <div className={s.heroMeta}>
            <span>👥 {user?.friends_count || 0} friends</span>
            <span>📅 Joined {memberSince}</span>
          </div>
        </div>
      </div>

      <div className={s.grid}>

        {/* Nickname card */}
        <div className={s.card} style={{gridColumn:'1/-1',background:'linear-gradient(135deg,rgba(99,102,241,.1),rgba(236,72,153,.1))',border:'1px solid rgba(99,102,241,.3)'}}>
          <h2 className={s.cardTitle}>🎭 Your Public Nickname</h2>
          <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:12,lineHeight:1.6}}>
            <strong>Only your nickname is visible to strangers.</strong> Your real name is only shown to confirmed friends.<br/>
            When someone sends you a friend request, they see your <strong>real name</strong> so you know who it is.
          </p>
          <form onSubmit={handleSaveNickname} style={{display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:200}}>
              <input
                className={s.input}
                value={nickname}
                onChange={e => { setNickname(e.target.value); setNickError('') }}
                placeholder="Your public nickname"
                maxLength={30}
                minLength={3}
              />
              {nickError && <div style={{fontSize:12,color:'var(--red)',marginTop:4}}>{nickError}</div>}
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>3–30 characters · Must be unique · Shown to everyone</div>
            </div>
            <button type="submit" className={s.saveBtn} disabled={nickSaving} style={{marginTop:0}}>
              {nickSaving ? <span className="spinner"/> : 'Save Nickname'}
            </button>
          </form>
          <div style={{marginTop:12,padding:'8px 12px',background:'var(--bg-secondary)',borderRadius:8,fontSize:13}}>
            <span style={{color:'var(--text-muted)'}}>Strangers see you as: </span>
            <strong style={{color:'var(--accent)'}}>{nickname || user?.nickname || '...'}</strong>
            <span style={{color:'var(--text-muted)',marginLeft:12}}>Friends see: </span>
            <strong style={{color:'var(--green)'}}>{user?.real_name || user?.name}</strong>
          </div>
        </div>

        {/* Edit profile */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>Edit Profile</h2>
          <form onSubmit={handleSaveProfile} className={s.form}>
            <label className={s.label}>Display Name</label>
            <input className={s.input} value={form.name} onChange={set('name')} placeholder="Your name" required />

            <label className={s.label}>Username</label>
            <input className={s.input} value={form.username} onChange={set('username')} placeholder="@username (optional)" />

            <label className={s.label}>Phone Number</label>
            <input className={s.input} value={form.phone} onChange={set('phone')} placeholder="+1 234 567 8900" type="tel" />

            <label className={s.label}>Bio</label>
            <textarea
              className={s.textarea}
              value={form.bio}
              onChange={set('bio')}
              placeholder="Tell people about yourself…"
              rows={3}
              maxLength={200}
            />
            <div className={s.charCount}>{form.bio.length}/200</div>

            <button type="submit" className={s.saveBtn} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>Change Password</h2>
          <form onSubmit={handleChangePassword} className={s.form}>
            <label className={s.label}>Current Password</label>
            <input className={s.input} type="password" value={pwdForm.current} onChange={setP('current')} placeholder="••••••••" required />

            <label className={s.label}>New Password</label>
            <input className={s.input} type="password" value={pwdForm.new} onChange={setP('new')} placeholder="••••••••" required minLength={6} />

            <label className={s.label}>Confirm New Password</label>
            <input className={s.input} type="password" value={pwdForm.confirm} onChange={setP('confirm')} placeholder="••••••••" required />

            <button type="submit" className={s.saveBtn} disabled={pwdSaving}>
              {pwdSaving ? <span className="spinner" /> : 'Update Password'}
            </button>
          </form>

          {/* Account info */}
          <div className={s.infoSection}>
            <h3 className={s.infoTitle}>Account Info</h3>
            <div className={s.infoRow}><span>Email</span><strong>{user?.email}</strong></div>
            <div className={s.infoRow}><span>Member since</span><strong>{memberSince}</strong></div>
            <div className={s.infoRow}><span>Status</span><strong style={{color:'var(--green)'}}>🟢 Online</strong></div>
          </div>
        </div>
      </div>
    </div>
  )
}
