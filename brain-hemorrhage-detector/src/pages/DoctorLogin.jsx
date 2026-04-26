import { useState } from 'react'
import { toast } from 'sonner'

const API = 'http://localhost:5000/api'

export default function DoctorLogin ({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error('Please enter email and password')
      return
    }
    setLoading(true)
    const toastId = toast.loading('Signing in...')
    try {
      const res = await fetch(`${API}/doctor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      localStorage.setItem('doctor_token', data.token)
      localStorage.setItem('doctor_name', data.name)
      localStorage.setItem('doctor_email', data.email)
      toast.success(`Welcome Dr. ${data.name}!`, { id: toastId })
      onLogin(data)
    } catch (err) {
      toast.error(err.message, { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='portal-center'>
      <div className='login-card'>
        <div className='login-icon'>👨‍⚕️</div>
        <h2 className='login-title'>Doctor Portal</h2>
        <p className='login-sub'>Sign in with your hospital credentials</p>

        <div className='form-group'>
          <label className='form-label'>Email</label>
          <input
            className='form-input'
            type='email'
            placeholder='doctor@hospital.com'
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        <div className='form-group'>
          <label className='form-label'>Password</label>
          <input
            className='form-input'
            type='password'
            placeholder='••••••••'
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
        </div>

        <button
          className='btn-analyze'
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <p className='login-note'>
          ⚕️ Access restricted to authorized medical personnel only
        </p>
      </div>
    </div>
  )
}
