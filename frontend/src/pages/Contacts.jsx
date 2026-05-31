import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import s from './Contacts.module.css'

const EMPTY = { name: '', phone: '', email: '', notes: '' }

export default function Contacts() {
  const { api, addToast } = useContext(AppContext)
  const [contacts, setContacts] = useState([])
  const [search,   setSearch]   = useState('')
  const [modal,    setModal]    = useState(null) // null | 'add' | contact_obj
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [viewContact, setViewContact] = useState(null)

  useEffect(() => { api('/contacts').then(r => setContacts(r.data)) }, []) // eslint-disable-line

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  function openAdd() { setForm(EMPTY); setModal('add') }
  function openEdit(c) { setForm({ name: c.name, phone: c.phone, email: c.email, notes: c.notes }); setModal(c) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (modal === 'add') {
        const r = await api('/contacts', { method: 'POST', data: form })
        setContacts(p => [...p, r.data])
        addToast('Contact added!', 'success')
      } else {
        const r = await api(`/contacts/${modal.id}`, { method: 'PUT', data: form })
        setContacts(p => p.map(c => c.id === modal.id ? r.data : c))
        addToast('Contact updated!', 'success')
      }
      setModal(null)
    } catch { addToast('Save failed', 'error') }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this contact?')) return
    await api(`/contacts/${id}`, { method: 'DELETE' })
    setContacts(p => p.filter(c => c.id !== id))
    setViewContact(null)
    addToast('Contact deleted', 'success')
  }

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) || c.email.toLowerCase().includes(search.toLowerCase())
  )

  // Group alphabetically
  const grouped = filtered.reduce((acc, c) => {
    const key = c.name[0]?.toUpperCase() || '#'
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  const initials = n => n?.split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase() || '?'

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Contacts</h1>
          <p className={s.sub}>{contacts.length} saved contacts</p>
        </div>
        <button className={s.addBtn} onClick={openAdd}>+ Add Contact</button>
      </div>

      {/* Search */}
      <input
        className={s.search}
        placeholder="🔍  Search contacts…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* List */}
      {contacts.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📒</div>
          <div className={s.emptyTitle}>No contacts yet</div>
          <div className={s.emptySub}>Add phone numbers and emails to your contact book</div>
          <button className={s.addBtn} onClick={openAdd}>+ Add First Contact</button>
        </div>
      ) : (
        <div className={s.list}>
          {Object.keys(grouped).sort().map(letter => (
            <div key={letter}>
              <div className={s.letter}>{letter}</div>
              {grouped[letter].map(c => (
                <div key={c.id} className={s.card} onClick={() => setViewContact(c)}>
                  <div className={s.avatar}>{initials(c.name)}</div>
                  <div className={s.info}>
                    <div className={s.name}>{c.name}</div>
                    {c.phone && <div className={s.detail}>📞 {c.phone}</div>}
                    {c.email && <div className={s.detail}>✉️ {c.email}</div>}
                  </div>
                  <div className={s.cardActions}>
                    <button className={s.iconBtn} onClick={e => { e.stopPropagation(); openEdit(c) }}>✏️</button>
                    <button className={`${s.iconBtn} ${s.del}`} onClick={e => { e.stopPropagation(); handleDelete(c.id) }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {modal && (
        <div className={s.overlay} onClick={() => setModal(null)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>{modal === 'add' ? 'Add Contact' : 'Edit Contact'}</h2>
              <button className={s.closeBtn} onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={handleSave} className={s.form}>
              <label className={s.label}>Name *</label>
              <input className={s.input} placeholder="Full name" value={form.name} onChange={set('name')} required />

              <label className={s.label}>Phone</label>
              <input className={s.input} type="tel" placeholder="+1 234 567 8900" value={form.phone} onChange={set('phone')} />

              <label className={s.label}>Email</label>
              <input className={s.input} type="email" placeholder="email@example.com" value={form.email} onChange={set('email')} />

              <label className={s.label}>Notes</label>
              <textarea className={s.textarea} placeholder="Any notes…" value={form.notes} onChange={set('notes')} rows={3} />

              <div className={s.modalBtns}>
                <button type="button" className={s.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className={s.saveBtn} disabled={saving}>
                  {saving ? <span className="spinner" /> : modal === 'add' ? 'Add Contact' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View contact detail */}
      {viewContact && (
        <div className={s.overlay} onClick={() => setViewContact(null)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Contact Details</h2>
              <button className={s.closeBtn} onClick={() => setViewContact(null)}>✕</button>
            </div>
            <div className={s.viewBody}>
              <div className={s.viewAvatar}>{initials(viewContact.name)}</div>
              <div className={s.viewName}>{viewContact.name}</div>
              {viewContact.phone && <div className={s.viewRow}><span>📞</span>{viewContact.phone}</div>}
              {viewContact.email && <div className={s.viewRow}><span>✉️</span>{viewContact.email}</div>}
              {viewContact.notes && <div className={s.viewNotes}>{viewContact.notes}</div>}
              <div className={s.modalBtns} style={{marginTop:20}}>
                <button className={s.cancelBtn} onClick={() => { openEdit(viewContact); setViewContact(null) }}>✏️ Edit</button>
                <button className={`${s.cancelBtn} ${s.dangerBtn}`} onClick={() => handleDelete(viewContact.id)}>🗑 Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
