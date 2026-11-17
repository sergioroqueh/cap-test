import { createClient, type Session } from '@supabase/supabase-js'

// C22: Authentication is developer-only. The cloud DATA gate remains closed.
const url = import.meta.env.VITE_CAP_PRO_SUPABASE_URL?.trim() || ''
const publishableKey = import.meta.env.VITE_CAP_PRO_SUPABASE_PUBLISHABLE_KEY?.trim() || ''
function validIsolatedUrl(value: string): boolean {
  try {
    const candidate = new URL(value)
    return candidate.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(candidate.hostname) && candidate.pathname === '/'
  } catch { return false }
}
const localDevOrigin = typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) &&
  window.location.port === '5173'
export const authConfigured = import.meta.env.DEV &&
  import.meta.env.VITE_CAP_PREVIEW !== 'true' &&
  import.meta.env.VITE_RUTACAP_AUTH_DEV === 'true' &&
  localDevOrigin && validIsolatedUrl(url) &&
  publishableKey.startsWith('sb_publishable_')
export const cloudConfigured = false
export const supabase = authConfigured
  ? createClient(url, publishableKey, { auth: {
      flowType: 'pkce', persistSession: true, autoRefreshToken: true,
      detectSessionInUrl: true, storageKey: 'rutacap-dev-oauth-v1'
    } })
  : null
function requireAuth() {
  if (!supabase) throw new Error('El acceso de desarrollo no está configurado.')
  return supabase
}
function callbackUrl() { return window.location.origin + '/auth/callback' }
export async function getSession(): Promise<Session | null> {
  const client = requireAuth()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) return null
  const { data: verified, error: userError } = await client.auth.getUser()
  if (userError || !verified.user || verified.user.id !== sessionData.session.user.id ||
      verified.user.is_anonymous) throw new Error('No se pudo verificar esta sesión.')
  return sessionData.session
}
export async function signInWithGoogle(): Promise<void> {
  const { error } = await requireAuth().auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: callbackUrl() }
  })
  if (error) throw error
}
export async function signInWithEmail(email: string): Promise<void> {
  const { error } = await requireAuth().auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: callbackUrl(), shouldCreateUser: false }
  })
  if (error) throw error
}
export async function signOut(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
