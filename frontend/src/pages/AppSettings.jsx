import { useState, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import s from './AppSettings.module.css'

const ACCENTS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#06b6d4','#84cc16']
const STATUS_PRESETS = [
  { emoji:'💼', text:'At work' },
  { emoji:'😴', text:'Sleeping' },
  { emoji:'🎮', text:'Gaming' },
  { emoji:'🎵', text:'Listening to music' },
  { emoji:'🏃', text:'Busy' },
  { emoji:'📵', text:'Do not disturb' },
  { emoji:'✈️', text:'Travelling' },
  { emoji:'🏠', text:'Working from home' },
]

export default function AppSettings() {
  const { theme, toggleTheme, addToast, subscribeToPush, api, user, setUser } = useContext(AppContext)

  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('s_prefs')||'{}') } catch { return {} }
  })
  const [activeTab,    setActiveTab]    = useState('appearance')
  const [statusEmoji,  setStatusEmoji]  = useState(user?.status_emoji || '')
  const [statusText,   setStatusText]   = useState(user?.status_text  || '')
  const [bioLink,      setBioLink]      = useState(user?.bio_link     || '')
  const [privacySaving,setPrivacySaving]= useState(false)
  const [twofa,        setTwofa]        = useState({ step:'idle', secret:'', uri:'', code:'', enabled: user?.twofa_enabled })
  const [lockPin,      setLockPin]      = useState('')
  const [lockConfirm,  setLockConfirm]  = useState('')
  const [history,      setHistory]      = useState([])
  const [histLoading,  setHistLoading]  = useState(false)
  const [qrUrl,        setQrUrl]        = useState('')

  function save(key, val) {
    const next = { ...prefs, [key]: val }
    setPrefs(next)
    localStorage.setItem('s_prefs', JSON.stringify(next))
    if (key === 'accent') document.documentElement.style.setProperty('--accent', val)
    if (key === 'fontSize') document.documentElement.style.setProperty('--chat-font', val+'px')
  }

  function testSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      const ctx = new AC(), osc = ctx.createOscillator(), g = ctx.createGain()
      osc.connect(g); g.connect(ctx.destination)
      osc.frequency.value = 880
      g.gain.setValueAtTime(0.3, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.4)
      osc.start(); osc.stop(ctx.currentTime+0.4)
      addToast('Sound test played!', 'success')
    } catch { addToast('Sound not available', 'error') }
  }

  async function saveStatus() {
    try {
      await api('/users/status', { method:'PUT', data:{ emoji:statusEmoji, text:statusText } })
      setUser(u => ({ ...u, status_emoji:statusEmoji, status_text:statusText }))
      addToast('Status updated!', 'success')
    } catch { addToast('Failed', 'error') }
  }

  async function saveBioLink() {
    try {
      await api('/profile', { method:'PUT', data:{ name:user?.name, phone:user?.phone, bio:user?.bio, username:user?.username, bio_link:bioLink, avatar_b64:user?.avatar_b64 } })
      setUser(u => ({ ...u, bio_link:bioLink }))
      addToast('Link saved!', 'success')
    } catch { addToast('Failed', 'error') }
  }

  async function savePrivacy(field, value) {
    setPrivacySaving(true)
    try {
      await api('/users/privacy', { method:'PUT', data:{ last_seen_privacy:value } })
      addToast('Privacy updated!', 'success')
    } catch { addToast('Failed', 'error') }
    finally { setPrivacySaving(false) }
  }

  async function setup2FA() {
    const r = await api('/2fa/setup')
    setTwofa({ ...twofa, step:'setup', secret:r.data.secret, uri:r.data.uri })
  }

  async function enable2FA() {
    try {
      await api('/2fa/enable', { method:'POST', data:{ code:twofa.code } })
      setTwofa({ ...twofa, step:'idle', enabled:true, code:'' })
      setUser(u => ({ ...u, twofa_enabled:1 }))
      addToast('2FA enabled! Your account is now secure.', 'success')
    } catch { addToast('Invalid code. Try again.', 'error') }
  }

  async function disable2FA() {
    if (!confirm('Disable 2-factor authentication?')) return
    await api('/2fa/disable', { method:'POST' })
    setTwofa({ ...twofa, step:'idle', enabled:false })
    setUser(u => ({ ...u, twofa_enabled:0 }))
    addToast('2FA disabled.', 'info')
  }

  async function setAppLock() {
    if (!lockPin) { addToast('Enter a PIN', 'error'); return }
    if (lockPin !== lockConfirm) { addToast('PINs do not match', 'error'); return }
    if (!/^\d{4,8}$/.test(lockPin)) { addToast('PIN must be 4–8 digits', 'error'); return }
    await api('/users/app-lock', { method:'PUT', data:{ pin:lockPin } })
    addToast('App lock set! 🔒', 'success')
    setLockPin(''); setLockConfirm('')
  }

  async function removeAppLock() {
    await api('/users/app-lock', { method:'PUT', data:{ pin:null } })
    addToast('App lock removed.', 'info')
  }

  async function loadHistory() {
    setHistLoading(true)
    const r = await api('/login-history')
    setHistory(r.data)
    setHistLoading(false)
  }

  async function loadQR() {
    const r = await api(`/users/${user?.id}/qr`)
    setQrUrl(r.data.qr_url)
  }

  const TABS = [
    { id:'appearance', label:'🎨 Appearance' },
    { id:'status',     label:'😊 Status' },
    { id:'privacy',    label:'🔒 Privacy' },
    { id:'security',   label:'🛡️ Security' },
    { id:'notif',      label:'🔔 Notifications' },
    { id:'chat',       label:'💬 Chat' },
    { id:'qr',         label:'📲 QR Code' },
  ]

  return (
    <div className={s.page}>
      <h1 className={s.title}>Settings</h1>

      <div className={s.tabBar}>
        {TABS.map(t => (
          <button key={t.id} className={`${s.tab} ${activeTab===t.id?s.tabActive:''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── APPEARANCE ── */}
      {activeTab === 'appearance' && (
        <div className={s.sections}>
          <Section title="Theme">
            <Row label="Dark / Light Mode">
              <button className={`${s.toggleBtn} ${s.on}`} onClick={toggleTheme}>
                {theme==='dark'?'🌙 Dark':'☀️ Light'}
              </button>
            </Row>
          </Section>
          <Section title="Accent Color">
            <Row label="Pick a colour">
              <div className={s.colorRow}>
                {ACCENTS.map(c => (
                  <button key={c} className={`${s.colorBtn} ${prefs.accent===c?s.colorActive:''}`}
                    style={{background:c}} onClick={() => save('accent',c)} />
                ))}
              </div>
            </Row>
          </Section>
          <Section title="Text Size">
            <Row label={`Font size: ${prefs.fontSize||14}px`}>
              <div className={s.sliderRow}>
                <span>A</span>
                <input type="range" min={12} max={20} className={s.slider}
                  value={prefs.fontSize||14} onChange={e => save('fontSize',parseInt(e.target.value))} />
                <span style={{fontSize:18}}>A</span>
              </div>
            </Row>
          </Section>
          <Section title="Layout">
            <Row label="Compact Mode" sub="More messages with less spacing">
              <Toggle on={prefs.compact} onClick={() => save('compact',!prefs.compact)} />
            </Row>
          </Section>
        </div>
      )}

      {/* ── STATUS ── */}
      {activeTab === 'status' && (
        <div className={s.sections}>
          <Section title="Your Status">
            <div className={s.statusPreview}>
              <span style={{fontSize:28}}>{statusEmoji || '😊'}</span>
              <span className={s.statusPreviewText}>{statusText || 'No status set'}</span>
            </div>
            <Row label="Emoji">
              <input className={s.smallInput} value={statusEmoji} onChange={e=>setStatusEmoji(e.target.value)} placeholder="😊" maxLength={2} />
            </Row>
            <Row label="Status text">
              <input className={s.smallInput} value={statusText} onChange={e=>setStatusText(e.target.value)} placeholder="What are you up to?" maxLength={50} />
            </Row>
            <button className={s.saveBtn} onClick={saveStatus}>Save Status</button>
          </Section>
          <Section title="Quick Status">
            <div className={s.presetGrid}>
              {STATUS_PRESETS.map(p => (
                <button key={p.text} className={s.preset} onClick={() => { setStatusEmoji(p.emoji); setStatusText(p.text) }}>
                  {p.emoji} {p.text}
                </button>
              ))}
              <button className={s.preset} onClick={() => { setStatusEmoji(''); setStatusText('') }}>
                ✕ Clear status
              </button>
            </div>
          </Section>
          <Section title="Profile Link">
            <Row label="Bio Link" sub="Link shown on your profile">
              <input className={s.smallInput} value={bioLink} onChange={e=>setBioLink(e.target.value)} placeholder="https://..." />
            </Row>
            <button className={s.saveBtn} onClick={saveBioLink}>Save Link</button>
          </Section>
        </div>
      )}

      {/* ── PRIVACY ── */}
      {activeTab === 'privacy' && (
        <div className={s.sections}>
          <Section title="Last Seen">
            <Row label="Who can see when you were last online">
              <select className={s.select} defaultValue={prefs.last_seen_privacy||'everyone'}
                onChange={e => { save('last_seen_privacy',e.target.value); savePrivacy('last_seen_privacy',e.target.value) }}>
                <option value="everyone">Everyone</option>
                <option value="friends">Friends only</option>
                <option value="nobody">Nobody</option>
              </select>
            </Row>
          </Section>
          <Section title="Profile Photo">
            <Row label="Who can see your profile picture">
              <select className={s.select} defaultValue="everyone">
                <option value="everyone">Everyone</option>
                <option value="friends">Friends only</option>
              </select>
            </Row>
          </Section>
          <Section title="Messaging">
            <Row label="Who can message me">
              <select className={s.select} defaultValue="everyone">
                <option value="everyone">Everyone</option>
                <option value="friends">Friends only</option>
              </select>
            </Row>
          </Section>
          <Section title="Read Receipts">
            <Row label="Show ✓✓ when messages are read">
              <Toggle on={prefs.readReceipts!==false} onClick={() => save('readReceipts',prefs.readReceipts===false)} />
            </Row>
          </Section>
          <Section title="Online Status">
            <Row label="Show when you're active">
              <Toggle on={prefs.showOnline!==false} onClick={() => save('showOnline',prefs.showOnline===false)} />
            </Row>
          </Section>
          <Section title="Disappearing Messages">
            <Row label="Auto-delete new messages after">
              <select className={s.select} value={prefs.disappear||'off'} onChange={e=>save('disappear',e.target.value)}>
                <option value="off">Off</option>
                <option value="60">1 hour</option>
                <option value="1440">24 hours</option>
                <option value="10080">7 days</option>
              </select>
            </Row>
          </Section>
        </div>
      )}

      {/* ── SECURITY ── */}
      {activeTab === 'security' && (
        <div className={s.sections}>
          <Section title="Two-Factor Authentication (2FA)">
            {twofa.enabled || user?.twofa_enabled ? (
              <>
                <div className={s.secBadge}>🔒 2FA is enabled — your account is protected</div>
                <button className={s.dangerBtn} onClick={disable2FA}>Disable 2FA</button>
              </>
            ) : twofa.step === 'setup' ? (
              <>
                <div className={s.qrSetup}>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(twofa.uri)}`} alt="2FA QR" className={s.qrImg} />
                  <div className={s.secretBox}>{twofa.secret}</div>
                  <div className={s.hint}>Scan with Google Authenticator or Authy</div>
                </div>
                <Row label="Enter 6-digit code from app">
                  <input className={s.smallInput} value={twofa.code} onChange={e=>setTwofa({...twofa,code:e.target.value})} placeholder="000000" maxLength={6} />
                </Row>
                <button className={s.saveBtn} onClick={enable2FA}>Verify & Enable</button>
              </>
            ) : (
              <button className={s.saveBtn} onClick={setup2FA}>Enable 2FA</button>
            )}
          </Section>

          <Section title="App Lock">
            <div className={s.hint}>Set a PIN to lock the app when you're away</div>
            <Row label="New PIN (4–8 digits)">
              <input className={s.smallInput} type="password" value={lockPin} onChange={e=>setLockPin(e.target.value)} placeholder="••••" maxLength={8} />
            </Row>
            <Row label="Confirm PIN">
              <input className={s.smallInput} type="password" value={lockConfirm} onChange={e=>setLockConfirm(e.target.value)} placeholder="••••" maxLength={8} />
            </Row>
            <div className={s.btnRow}>
              <button className={s.saveBtn} onClick={setAppLock}>Set Lock</button>
              <button className={s.dangerBtn} onClick={removeAppLock}>Remove Lock</button>
            </div>
          </Section>

          <Section title="Login History">
            <div className={s.hint}>See all devices that have logged into your account</div>
            <button className={s.saveBtn} onClick={loadHistory} disabled={histLoading}>
              {histLoading ? <span className="spinner"/> : 'Load History'}
            </button>
            {history.map((h,i) => (
              <div key={i} className={s.histRow}>
                <div className={s.histIcon}>{h.user_agent?.includes('Mobile')?'📱':'💻'}</div>
                <div>
                  <div className={s.histUA}>{h.user_agent?.slice(0,60)||'Unknown device'}</div>
                  <div className={s.histMeta}>{h.ip} · {new Date(h.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </Section>
        </div>
      )}

      {/* ── NOTIFICATIONS ── */}
      {activeTab === 'notif' && (
        <div className={s.sections}>
          <Section title="Call Ringing (Offline)">
            <Row label="📞 Ring when app is closed" sub="Like WhatsApp — tap Enable once per device">
              <button className={`${s.toggleBtn} ${s.on}`} onClick={() => subscribeToPush()}>Enable</button>
            </Row>
          </Section>
          <Section title="Message Sounds">
            <Row label="Sound Alerts">
              <div className={s.btnRow2}>
                <Toggle on={prefs.soundEnabled} onClick={() => save('soundEnabled',!prefs.soundEnabled)} />
                {prefs.soundEnabled && <button className={s.testSmall} onClick={testSound}>Test</button>}
              </div>
            </Row>
          </Section>
          <Section title="Push Notifications">
            <Row label="Browser notifications when someone messages you">
              <button className={`${s.toggleBtn} ${prefs.pushEnabled?s.on:''}`} onClick={async ()=>{
                const perm = await Notification.requestPermission()
                if (perm==='granted') { save('pushEnabled',true); addToast('Notifications enabled!','success') }
                else addToast('Permission denied','error')
              }}>{prefs.pushEnabled?'Enabled':'Enable'}</button>
            </Row>
          </Section>
          <Section title="Do Not Disturb">
            <Row label="Mute all sounds and notifications">
              <Toggle on={prefs.dnd} onClick={() => save('dnd',!prefs.dnd)} label={prefs.dnd?'🔕 On':'🔔 Off'} />
            </Row>
          </Section>
        </div>
      )}

      {/* ── CHAT ── */}
      {activeTab === 'chat' && (
        <div className={s.sections}>
          <Section title="Sending">
            <Row label="Enter to Send" sub="Press Enter to send, Shift+Enter for new line">
              <Toggle on={prefs.enterSend!==false} onClick={() => save('enterSend',prefs.enterSend===false)} />
            </Row>
          </Section>
          <Section title="Media">
            <Row label="Link Previews" sub="Show previews when you paste a link">
              <Toggle on={prefs.linkPreview!==false} onClick={() => save('linkPreview',prefs.linkPreview===false)} />
            </Row>
          </Section>
          <Section title="Backup">
            <Row label="Export my chats">
              <button className={s.saveBtn} onClick={async()=>{
                const r = await api('/messages/conversations')
                const blob = new Blob([JSON.stringify(r.data,null,2)],{type:'application/json'})
                const a = document.createElement('a'); a.href=URL.createObjectURL(blob)
                a.download='chats_backup.json'; a.click()
              }}>⬇ Download</button>
            </Row>
          </Section>
        </div>
      )}

      {/* ── QR CODE ── */}
      {activeTab === 'qr' && (
        <div className={s.sections}>
          <Section title="Your QR Code">
            <div className={s.hint}>Share your QR code so people can find you instantly</div>
            {qrUrl ? (
              <div className={s.qrCenter}>
                <img src={qrUrl} alt="Your QR code" className={s.qrBig} />
                <div className={s.qrLabel}>Scan to find {user?.name} on THE CHATING</div>
                <a href={qrUrl} download="my-qr.png" className={s.saveBtn} style={{display:'inline-block',textDecoration:'none',textAlign:'center'}}>⬇ Save QR Image</a>
              </div>
            ) : (
              <button className={s.saveBtn} onClick={loadQR}>Generate QR Code</button>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className={s.section}>
      <div className={s.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, sub, children }) {
  return (
    <div className={s.row}>
      <div className={s.rowLeft}>
        <div className={s.rowLabel}>{label}</div>
        {sub && <div className={s.rowSub}>{sub}</div>}
      </div>
      <div className={s.rowRight}>{children}</div>
    </div>
  )
}

function Toggle({ on, onClick, label }) {
  return (
    <button className={`${s.toggleBtn} ${on?s.on:''}`} onClick={onClick}>
      {label || (on?'On':'Off')}
    </button>
  )
}
