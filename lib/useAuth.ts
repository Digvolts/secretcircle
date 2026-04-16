'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function initAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session?.user) {
          await loadUser(session.user.id)
        } else {
          setUser(null)
        }
      } catch (err) {
        console.error('Auth init error:', err)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          if (event === 'SIGNED_IN' && session?.user) {
            await loadUser(session.user.id)
          } else if (event === 'SIGNED_OUT') {
            setUser(null)
          }
        } catch (err) {
          console.error('Auth state change error:', err)
        }
      }
    )

    return () => {
      authListener?.subscription.unsubscribe()
    }
  }, [])

  async function loadUser(authId: string) {
    try {
      // Fetch user dari database
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authId)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned
        throw error
      }

      if (data) {
        setUser(data)
      } else {
        setUser(null)
      }
    } catch (err) {
      console.error('Error loading user:', err)
      setUser(null)
    }
  }

  async function signUp(email: string, password: string) {
    try {
      // Sign up ke auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (authError) throw authError

      if (!authData.user) {
        throw new Error('No user returned from sign up')
      }

      // Create user profile
      const username = email.split('@')[0]

      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          auth_id: authData.user.id,
          email,
          username,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${authData.user.id}`,
        })
        .select()
        .single()

      if (userError) throw userError

      setUser(userData)
      return { user: userData, error: null }
    } catch (err: any) {
      console.error('Sign up error:', err)
      return { user: null, error: err.message }
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data.user) {
        await loadUser(data.user.id)
      }

      return { user: data.user, error: null }
    } catch (err: any) {
      console.error('Sign in error:', err)
      return { user: null, error: err.message }
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
      setUser(null)
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  return { user, loading, signOut, signUp, signIn }
}