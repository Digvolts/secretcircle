'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import { X } from 'lucide-react'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signUp, signIn } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignUp) {
        const { error: signUpError } = await signUp(email, password)
        if (signUpError) throw new Error(signUpError)
      } else {
        const { error: signInError } = await signIn(email, password)
        if (signInError) throw new Error(signInError)
      }
      
      onClose()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-black border border-gray-800 rounded-2xl w-full max-w-[598px] mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold">
            {isSignUp ? 'Create account' : 'Sign in'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-900 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 text-red-500 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white outline-none focus:border-[#1d9bf0] transition"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white outline-none focus:border-[#1d9bf0] transition"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 text-white font-bold py-2 rounded-lg transition"
          >
            {loading ? 'Loading...' : isSignUp ? 'Sign up' : 'Sign in'}
          </button>

          <div className="text-center text-sm text-gray-500">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-[#1d9bf0] hover:underline font-semibold"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}