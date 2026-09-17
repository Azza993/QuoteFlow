import { type FormEvent, useState } from 'react'
import { Building2, Loader2, LockKeyhole, Mail } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'

export function Auth() {
  const { signIn, signUp, resetPassword, updatePassword, session } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [working, setWorking] = useState(false)

  const recovery = params.get('mode') === 'reset' && Boolean(session)
  const effectiveMode = recovery ? 'reset' : mode

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    try {
      if (recovery) {
        if (password.length < 8) throw new Error('Use at least 8 characters for your new password.')
        if (password !== confirmPassword) throw new Error('The passwords do not match.')
        await updatePassword(password)
        toast.success('Password updated. You are signed in.')
        navigate('/', { replace: true })
      } else if (effectiveMode === 'reset') {
        await resetPassword(email.trim())
        toast.success('Password reset email sent. Check your inbox.')
        setMode('sign-in')
      } else if (effectiveMode === 'sign-up') {
        const result = await signUp(email.trim(), password, businessName)
        if (result.confirmationRequired) {
          toast.success('Account created. Check your email to confirm it, then sign in.')
          setMode('sign-in')
        }
      } else {
        await signIn(email.trim(), password)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-50 px-4 py-8">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Building2 className="size-7" />
          </div>
          <CardTitle className="mt-2 text-2xl">QuoteFlow</CardTitle>
          <CardDescription>
            {recovery
              ? 'Choose a new password for your account.'
              : effectiveMode === 'sign-up'
                ? 'Create your contractor account.'
                : effectiveMode === 'reset'
                  ? 'Reset your QuoteFlow password.'
                  : 'Sign in to your quotes and customers.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {effectiveMode === 'sign-up' ? (
              <Field label="Business name" htmlFor="business-name">
                <Input
                  id="business-name"
                  autoComplete="organization"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  placeholder="Your business"
                  required
                />
              </Field>
            ) : null}

            {!recovery ? (
              <Field label="Email" htmlFor="email">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="pl-9"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </Field>
            ) : null}

            {effectiveMode !== 'reset' || recovery ? (
              <Field
                label={recovery ? 'New password' : 'Password'}
                htmlFor="password"
                hint={effectiveMode === 'sign-up' || recovery ? 'Use at least 8 characters.' : undefined}
              >
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete={recovery || effectiveMode === 'sign-up' ? 'new-password' : 'current-password'}
                    className="pl-9"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              </Field>
            ) : null}

            {recovery ? (
              <Field label="Confirm new password" htmlFor="confirm-password">
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </Field>
            ) : null}

            <Button className="w-full" size="lg" disabled={working} type="submit">
              {working ? <Loader2 className="animate-spin" /> : null}
              {recovery
                ? 'Update password'
                : effectiveMode === 'sign-up'
                  ? 'Create account'
                  : effectiveMode === 'reset'
                    ? 'Send reset email'
                    : 'Sign in'}
            </Button>
          </form>

          <div className="mt-5 flex flex-col items-center gap-2 text-sm text-ink-500">
            {!recovery && effectiveMode === 'sign-in' ? (
              <>
                <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setMode('reset')}>
                  Forgot your password?
                </button>
                <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setMode('sign-up')}>
                  Create an account
                </button>
              </>
            ) : !recovery ? (
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setMode('sign-in')}>
                Back to sign in
              </button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
