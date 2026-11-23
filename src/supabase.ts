import { createClient, type Session } from '@supabase/supabase-js'

// R83: Public account auth is explicitly gated; cloud DATA synchronization remains closed.
const url = import.meta.env.VITE_CAP_PRO_SUPABASE_URL?.trim() || ''
const publishableKey = import.meta.env.VITE_CAP_PRO_SUPABASE_PUBLISHABLE_KEY?.trim() || ''
function validIsolatedUrl(value: string): boolean {
  try {
    const candidate = new URL(value)
    // Public project ref; prevents accidental use of the other Supabase accounts.
    return candidate.origin === 'https://rhtbqetskghkarxhrgee.supabase.co' &&
      candidate.pathname === '/' && !candidate.username && !candidate.password &&
      !candidate.search && !candidate.hash
  } catch { return false }
}
const localDevOrigin = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port === '5173'
// Public auth must be explicitly enabled in a dedicated launch build.
// R80 and previous GitHub Pages/Vercel builds remain guest-only.
const publicLaunchOrigin = typeof window !== 'undefined' &&
  window.location.origin === 'https://rutacap.es'
const publicAuth = import.meta.env.PROD &&
  import.meta.env.VITE_CAP_LAUNCH === 'true' &&
  import.meta.env.VITE_RUTACAP_PUBLIC_AUTH === 'true' &&
  publicLaunchOrigin && validIsolatedUrl(url) &&
  publishableKey.startsWith('sb_publishable_')
const devAuth = import.meta.env.DEV &&
  import.meta.env.VITE_CAP_PREVIEW !== 'true' &&
  import.meta.env.VITE_RUTACAP_AUTH_DEV === 'true' &&
  localDevOrigin && validIsolatedUrl(url) &&
  publishableKey.startsWith('sb_publishable_')
export const authConfigured = publicAuth || devAuth
// Google and email OTP can be enabled separately; never show an unconfigured provider.
export const googleConfigured = authConfigured &&
  import.meta.env.VITE_RUTACAP_GOOGLE_AUTH === 'true'
// Testing brand-new accounts locally is opt-in, never the default for local development.
const devSignupConfigured = devAuth &&
  import.meta.env.VITE_RUTACAP_DEV_SIGNUPS === 'true'
export const emailOtpConfigured = authConfigured &&
  import.meta.env.VITE_RUTACAP_EMAIL_OTP === 'true'
export const cloudConfigured = false
export const supabase = authConfigured
  ? createClient(url, publishableKey, { auth: {
      flowType: 'pkce', persistSession: true, autoRefreshToken: true,
      detectSessionInUrl: true, storageKey: publicAuth ? 'rutacap-public-oauth-v1' : 'rutacap-dev-oauth-v1'
    } })
  : null
function requireAuth() {
  if (!supabase) throw new Error('El acceso con cuenta no está configurado.')
  return supabase
}
function callbackUrl() { return (publicAuth ? 'https://rutacap.es' : window.location.origin) + '/auth/callback' }
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
  if (!googleConfigured) throw new Error('Google no está configurado para este entorno.')
  const { error } = await requireAuth().auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: callbackUrl() }
  })
  if (error) throw error
}
export async function signInWithEmail(email: string): Promise<void> {
  if (!emailOtpConfigured) throw new Error('El acceso por código todavía no está habilitado.')
  const { error } = await requireAuth().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: callbackUrl(), shouldCreateUser: publicAuth || devSignupConfigured }
  })
  if (error) throw error
}
export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  if (!emailOtpConfigured) throw new Error('El acceso por código todavía no está habilitado.')
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !/^\d{6}$/.test(token.trim()))
    throw new Error('Introduce el código de seis cifras recibido por correo.')
  const { error } = await requireAuth().auth.verifyOtp({
    email: normalizedEmail, token: token.trim(), type: 'email'
  })
  if (error) throw error
  if (!(await getSession())) throw new Error('No se pudo verificar la nueva sesión.')
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
