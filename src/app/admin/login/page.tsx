'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (res.ok) {
        router.refresh()
        router.push('/admin')
      } else {
        const data = await res.json()
        setError(data.error ?? 'Incorrect password')
      }
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50'>
      <div className='w-full max-w-sm bg-white rounded-lg border border-gray-200 shadow-sm p-8'>
        <h1 className='text-lg font-semibold text-gray-800 mb-6'>Admin Access</h1>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label className='block text-sm text-gray-600 mb-1'>Password</label>
            <input
              type='password'
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              required
              className='w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
            />
          </div>
          {error && <p className='text-sm text-red-600'>{error}</p>}
          <button
            type='submit'
            disabled={loading}
            className='w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
          >
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
