import { useState, useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import s from './Auth.module.css'

export default function Login() {
  const { login, addToast } = useContext(AppContext)
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await login(form.email, form.password)
      addToast('Welcome back!', 'success')
      navigate('/')
    } catch(err) {
      setError(err.response?.data?.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <div className={s.icon}>💬</div>
          <h1 className={s.title}>Welcome back</h1>
          <p className={s.subtitle}>Sign in to THE CHATING</p>
        </div>

        <form onSubmit={handleSubmit} className={s.form}>
          {error && <div className={s.error}>{error}</div>}

          <label className={s.label}>Email</label>
          <input
            className={s.input}
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={set('email')}
            required
          />

          <label className={s.label}>Password</label>
          <input
            className={s.input}
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={set('password')}
            required
          />

          <button className={s.submit} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign In'}
          </button>
        </form>

        <p className={s.switch}>
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  )
}
