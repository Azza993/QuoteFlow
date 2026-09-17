import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabaseConfigured } from '@/data/supabase/config'
import { getSupabase } from '@/data/supabase/client'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, businessName: string) => Promise<{ confirmationRequired: boolean }>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }

    const client = getSupabase()
    let active = true

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(error ? null : data.session)
      setLoading(false)
    })

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    configured: supabaseConfigured,
    signIn: async (email, password) => {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message)
    },
    signUp: async (email, password, businessName) => {
      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: { data: { business_name: businessName.trim() || 'My Business' } },
      })
      if (error) throw new Error(error.message)
      return { confirmationRequired: !data.session }
    },
    resetPassword: async (email) => {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      })
      if (error) throw new Error(error.message)
    },
    signOut: async () => {
      const { error } = await getSupabase().auth.signOut()
      if (error) throw new Error(error.message)
    },
  }), [loading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside an <AuthProvider>')
  return value
}
