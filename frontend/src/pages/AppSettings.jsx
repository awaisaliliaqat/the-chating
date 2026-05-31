import { useState, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import s from './AppSettings.module.css'

const ACCENTS  = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#06b6d4','#84cc16']
const WALLPAPERS = ['none','gradient1','gradient2','dots','lines','stars']

export default function AppSettings() {
  const { theme, toggleTheme, addToast } = useContext(AppContext)

  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('s_prefs') || '{}') } catch { return {} }
  })

  function save(key, val) {
    const next = { ...prefs, [key]: val }
    setPrefs(next)
    localStorage.setItem('s_prefs', JSON.stringify(next))
    if (key === 'accent') document.documentElement.style.setProperty('--accent', val)
    if (key === 'fontSize') document.documentElement.style.setProperty('--chat-font', val+'px')
  }

  function testSound() {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(); osc.stop(ctx.currentTime + 0.4)
      addToast('Sound test played!', 'success')
    } catch { addToast('Sound not available', 'error') }
  }

  async function testPush() {
    if (!('Notification' in window)) { addToast('Notifications not supported', 'error'); return }
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      new Notification('THE CHATING', { body: 'Push notifications are working! 🎉', icon: '/favicon.ico' })
      save('pushEnabled', true)
      addToast('Push notifications enabled!', 'success')
    } else {
      addToast('Permission denied. Enable in browser settings.', 'warning')
    }
  }

  const rows = [
    {
      section: 'Appearance',
      items: [
        { label: 'Theme', sub: 'Switch between dark and light', action: (
          <button className={`${s.toggleBtn} ${theme==='light'?s.on:''}`} onClick={toggleTheme}>
            {theme==='dark' ? '🌙 Dark' : '☀️ Light'}
          </button>
        )},
        { label: 'Accent Color', sub: 'Change the main highlight color', action: (
          <div className={s.colorRow}>
            {ACCENTS.map(c => (
              <button key={c} className={`${s.colorBtn} ${prefs.accent===c?s.colorActive:''}`}
                style={{background:c}} onClick={() => save('accent', c)} />
            ))}
          </div>
        )},
        { label: 'Font Size', sub: 'Adjust message text size', action: (
          <div className={s.sliderRow}>
            <span>A</span>
            <input type="range" min={12} max={20} value={prefs.fontSize||14}
              onChange={e => save('fontSize', parseInt(e.target.value))} className={s.slider} />
            <span style={{fontSize:18}}>A</span>
            <span className={s.fontVal}>{prefs.fontSize||14}px</span>
          </div>
        )},
        { label: 'Compact Mode', sub: 'Show more messages with less spacing', action: (
          <button className={`${s.toggleBtn} ${prefs.compact?s.on:''}`} onClick={() => save('compact', !prefs.compact)}>
            {prefs.compact ? 'On' : 'Off'}
          </button>
        )},
      ]
    },
    {
      section: 'Notifications',
      items: [
        { label: 'Sound Alerts', sub: 'Play a sound for new messages', action: (
          <div className={s.row2}>
            <button className={`${s.toggleBtn} ${prefs.soundEnabled?s.on:''}`} onClick={() => save('soundEnabled', !prefs.soundEnabled)}>
              {prefs.soundEnabled ? 'On' : 'Off'}
            </button>
            {prefs.soundEnabled && <button className={s.testBtn} onClick={testSound}>Test</button>}
          </div>
        )},
        { label: 'Push Notifications', sub: 'Get browser notifications when someone messages you', action: (
          <div className={s.row2}>
            <button className={`${s.toggleBtn} ${prefs.pushEnabled?s.on:''}`} onClick={testPush}>
              {prefs.pushEnabled ? 'Enabled' : 'Enable'}
            </button>
          </div>
        )},
        { label: 'Do Not Disturb', sub: 'Mute all sounds and notifications', action: (
          <button className={`${s.toggleBtn} ${prefs.dnd?s.on:''}`} onClick={() => save('dnd', !prefs.dnd)}>
            {prefs.dnd ? '🔕 On' : '🔔 Off'}
          </button>
        )},
      ]
    },
    {
      section: 'Privacy',
      items: [
        { label: 'Read Receipts', sub: 'Let others know when you\'ve read their messages', action: (
          <button className={`${s.toggleBtn} ${prefs.readReceipts!==false?s.on:''}`}
            onClick={() => save('readReceipts', prefs.readReceipts===false ? true : false)}>
            {prefs.readReceipts===false ? 'Off' : 'On'}
          </button>
        )},
        { label: 'Online Status', sub: 'Show when you\'re active', action: (
          <button className={`${s.toggleBtn} ${prefs.showOnline!==false?s.on:''}`}
            onClick={() => save('showOnline', prefs.showOnline===false ? true : false)}>
            {prefs.showOnline===false ? 'Hidden' : 'Visible'}
          </button>
        )},
        { label: 'Disappearing Messages', sub: 'Auto-delete new messages after set time', action: (
          <select className={s.select} value={prefs.disappear||'off'} onChange={e=>save('disappear', e.target.value)}>
            <option value="off">Off</option>
            <option value="60">1 hour</option>
            <option value="1440">24 hours</option>
            <option value="10080">7 days</option>
          </select>
        )},
      ]
    },
    {
      section: 'Chat',
      items: [
        { label: 'Enter to Send', sub: 'Press Enter to send, Shift+Enter for new line', action: (
          <button className={`${s.toggleBtn} ${prefs.enterSend!==false?s.on:''}`}
            onClick={() => save('enterSend', prefs.enterSend===false ? true : false)}>
            {prefs.enterSend===false ? 'Off' : 'On'}
          </button>
        )},
        { label: 'Link Previews', sub: 'Show previews for links in messages', action: (
          <button className={`${s.toggleBtn} ${prefs.linkPreview!==false?s.on:''}`}
            onClick={() => save('linkPreview', prefs.linkPreview===false ? true : false)}>
            {prefs.linkPreview===false ? 'Off' : 'On'}
          </button>
        )},
      ]
    },
  ]

  return (
    <div className={s.page}>
      <h1 className={s.title}>Settings</h1>
      {rows.map(({ section, items }) => (
        <div key={section} className={s.section}>
          <div className={s.sectionTitle}>{section}</div>
          {items.map(({ label, sub, action }) => (
            <div key={label} className={s.row}>
              <div className={s.rowLeft}>
                <div className={s.rowLabel}>{label}</div>
                <div className={s.rowSub}>{sub}</div>
              </div>
              <div className={s.rowAction}>{action}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
