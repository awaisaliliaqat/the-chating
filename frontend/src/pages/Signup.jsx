import { useState, useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import s from './Auth.module.css'

export default function Signup() {
  const { signup, addToast } = useContext(AppContext)
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await signup(form.name, form.email, form.password, form.phone)
      addToast('Account created! Welcome to THE CHATING 🎉', 'success')
      navigate('/')
    } catch(err) {
      setError(err.response?.data?.message || 'Sign up failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <div className={s.icon}>💬</div>
          <h1 className={s.title}>Create account</h1>
          <p className={s.subtitle}>Join THE CHATING today</p>
        </div>

        <form onSubmit={handleSubmit} className={s.form}>
          {error && <div className={s.error}>{error}</div>}

          <label className={s.label}>Full Name</label>
          <input className={s.input} placeholder="John Doe" value={form.name} onChange={set('name')} required />

          <label className={s.label}>Email</label>
          <input className={s.input} type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />

          <label className={s.label}>Phone (optional)</label>
          <input className={s.input} type="tel" placeholder="+1 234 567 8900" value={form.phone} onChange={set('phone')} />

          <label className={s.label}>Password</label>
          <input className={s.input} type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required minLength={6} />

          <button className={s.submit} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create Account'}
          </button>
        </form>

        <p className={s.switch}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
