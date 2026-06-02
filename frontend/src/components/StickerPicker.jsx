import { useState, useRef, useEffect } from 'react'
import s from './StickerPicker.module.css'

// Built-in emoji sticker packs
const PACKS = {
  Vibes: ['🔥','💯','✨','🎉','🥳','💅','😤','🫡','💀','🗿','😭','🤌','👀','🫶','🙏','🤝','💪','🦾','😈','👑'],
  Hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','❤️‍🔥','💕','💞','💓','💗','💖','💝','💘','💟','♥️','💔'],
  Fun: ['🎮','🎲','🎯','🎪','🎭','🎨','🎬','🎤','🎸','🎺','🏆','🥇','🎁','🎀','🎊','🪅','🧨','🪄','🃏','🎰'],
  Food: ['🍕','🍔','🍟','🌮','🍜','🍣','🍩','🧁','🍫','🍦','☕','🧋','🍺','🥂','🍾','🥑','🍓','🍉','🌶️','🍪'],
  Animals: ['🐶','🐱','🐻','🐼','🦊','🐯','🦁','🐸','🐵','🦋','🐝','🦄','🐙','🦑','🦀','🐬','🦈','🦁','🐧','🦉'],
  Space: ['🚀','🌍','🌙','⭐','🌟','💫','✨','☄️','🪐','👽','🤖','🛸','🌌','🔭','🌠','💥','🌞','🌛','🪨','🛰️'],
}

const CUSTOM_KEY = 'chat_custom_stickers'

function loadCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]') } catch { return [] }
}
function saveCustom(arr) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr))
}

// Sample community stickers (emoji-art style)
const COMMUNITY = [
  { id:'c1', emoji:'🗿', label:'stonks' },
  { id:'c2', emoji:'💀', label:'ded' },
  { id:'c3', emoji:'🤌', label:'chefs kiss' },
  { id:'c4', emoji:'🫡', label:'sir yes sir' },
  { id:'c5', emoji:'😤', label:'no cap' },
  { id:'c6', emoji:'🥺👉👈', label:'pretty pls' },
  { id:'c7', emoji:'👁️👄👁️', label:'witness' },
  { id:'c8', emoji:'🦆', label:'quack' },
  { id:'c9', emoji:'🫠', label:'melting' },
  { id:'c10', emoji:'🧌', label:'troll' },
  { id:'c11', emoji:'🪬', label:'evil eye' },
  { id:'c12', emoji:'🫶🏽', label:'love u' },
]

export default function StickerPicker({ onSend, onClose }) {
  const [tab,       setTab]       = useState('packs')      // packs | my | community
  const [pack,      setPack]      = useState('Vibes')
  const [custom,    setCustom]    = useState(loadCustom)
  const [creating,  setCreating]  = useState(false)
  const [newLabel,  setNewLabel]  = useState('')
  const [newEmoji,  setNewEmoji]  = useState('⭐')
  const [newImg,    setNewImg]    = useState(null)          // data-url for custom image
  const [dragOver,  setDragOver]  = useState(false)
  const ref      = useRef(null)
  const fileRef  = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function handleSend(sticker) {
    // sticker: { type:'emoji'|'image'|'community', content, label }
    onSend?.(sticker)
    onClose?.()
  }

  function readFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => setNewImg(e.target.result)
    reader.readAsDataURL(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    readFile(e.dataTransfer.files[0])
  }

  function createSticker() {
    if (!newLabel.trim() && !newImg) return
    const sticker = {
      id: Date.now().toString(),
      label: newLabel.trim() || 'sticker',
      emoji: newImg ? null : newEmoji,
      img: newImg || null,
    }
    const updated = [sticker, ...custom]
    setCustom(updated)
    saveCustom(updated)
    setCreating(false)
    setNewLabel('')
    setNewEmoji('⭐')
    setNewImg(null)
  }

  function deleteCustom(id) {
    const updated = custom.filter(c => c.id !== id)
    setCustom(updated)
    saveCustom(updated)
  }

  return (
    <div ref={ref} className={s.picker}>
      {/* Header */}
      <div className={s.header}>
        <span className={s.title}>Stickers</span>
        <button className={s.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        <button className={`${s.tab} ${tab==='packs'?s.tabActive:''}`} onClick={() => setTab('packs')}>Packs</button>
        <button className={`${s.tab} ${tab==='my'?s.tabActive:''}`} onClick={() => setTab('my')}>My Stickers</button>
        <button className={`${s.tab} ${tab==='community'?s.tabActive:''}`} onClick={() => setTab('community')}>Community</button>
      </div>

      {/* ---- Packs tab ---- */}
      {tab === 'packs' && (
        <div className={s.body}>
          <div className={s.packTabs}>
            {Object.keys(PACKS).map(p => (
              <button key={p} className={`${s.packBtn} ${pack===p?s.packActive:''}`} onClick={() => setPack(p)}>
                {p}
              </button>
            ))}
          </div>
          <div className={s.grid}>
            {PACKS[pack].map((emoji, i) => (
              <button
                key={i}
                className={s.stickerBtn}
                onClick={() => handleSend({ type:'emoji', content: emoji, label: emoji })}
                title={emoji}
              >
                <span className={s.stickerEmoji}>{emoji}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- My Stickers tab ---- */}
      {tab === 'my' && (
        <div className={s.body}>
          {!creating ? (
            <>
              <button className={s.createBtn} onClick={() => setCreating(true)}>
                <span>+</span> Create Custom Sticker
              </button>
              {custom.length === 0 && (
                <div className={s.empty}>
                  <span>🎨</span>
                  <p>No custom stickers yet.</p>
                  <p>Create one above!</p>
                </div>
              )}
              <div className={s.customGrid}>
                {custom.map(sticker => (
                  <div key={sticker.id} className={s.customItem}>
                    <button
                      className={s.stickerBtn}
                      onClick={() => handleSend({ type: sticker.img ? 'image' : 'emoji', content: sticker.img || sticker.emoji, label: sticker.label })}
                    >
                      {sticker.img
                        ? <img src={sticker.img} alt={sticker.label} className={s.customImg} />
                        : <span className={s.stickerEmoji}>{sticker.emoji}</span>
                      }
                    </button>
                    <span className={s.customLabel}>{sticker.label}</span>
                    <button
                      className={s.deleteBtn}
                      onClick={() => deleteCustom(sticker.id)}
                      title="Delete"
                    >✕</button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={s.creator}>
              <p className={s.creatorTitle}>New Sticker</p>

              {/* Drop zone */}
              <div
                className={`${s.dropZone} ${dragOver ? s.dragOver : ''} ${newImg ? s.hasImg : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                {newImg
                  ? <img src={newImg} alt="preview" className={s.dropPreview} />
                  : <span className={s.dropHint}>
                      <span className={s.uploadIcon}>📁</span>
                      <span>Drop image or click to upload</span>
                    </span>
                }
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className={s.hiddenFile}
                  onChange={e => readFile(e.target.files[0])}
                />
              </div>

              {/* OR use emoji */}
              {!newImg && (
                <div className={s.emojiRow}>
                  <span className={s.orText}>or pick an emoji</span>
                  <input
                    className={s.emojiInput}
                    value={newEmoji}
                    onChange={e => setNewEmoji(e.target.value)}
                    maxLength={4}
                    placeholder="⭐"
                  />
                </div>
              )}
              {newImg && (
                <button className={s.clearImg} onClick={() => setNewImg(null)}>Remove image</button>
              )}

              <input
                className={s.labelInput}
                placeholder="Label (e.g. vibes)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                maxLength={20}
              />

              <div className={s.creatorActions}>
                <button className={s.cancelBtn} onClick={() => { setCreating(false); setNewImg(null); setNewLabel('') }}>
                  Cancel
                </button>
                <button
                  className={s.saveBtn}
                  onClick={createSticker}
                  disabled={!newLabel.trim() && !newImg}
                >
                  Save Sticker
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Community tab ---- */}
      {tab === 'community' && (
        <div className={s.body}>
          <p className={s.communityNote}>Popular community stickers</p>
          <div className={s.communityGrid}>
            {COMMUNITY.map(st => (
              <button
                key={st.id}
                className={s.communityItem}
                onClick={() => handleSend({ type:'emoji', content: st.emoji, label: st.label })}
              >
                <span className={s.communityEmoji}>{st.emoji}</span>
                <span className={s.communityLabel}>{st.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
