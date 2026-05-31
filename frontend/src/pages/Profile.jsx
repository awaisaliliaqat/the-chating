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
          <div className={s.heroName}>{user?.name}</div>
          {user?.username && <div style={{fontSize:13,color:'var(--accent)',fontWeight:600}}>@{user.username}</div>}
          <div className={s.heroEmail}>{user?.email}</div>
          <div className={s.heroMeta}>
            <span>👥 {user?.friends_count || 0} friends</span>
            <span>📅 Joined {memberSince}</span>
          </div>
        </div>
      </div>

      <div className={s.grid}>
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
