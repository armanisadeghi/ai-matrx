import { redirect } from 'next/navigation'

import { getServerAuth } from '@/utils/supabase/getServerAuth'

export default async function PrivatePage() {
  const { user, authUnavailable } = await getServerAuth()

  if (!user) {
    // Could-not-verify is not signed-out: say so rather than bouncing a
    // signed-in person to /login over a network blink.
    if (authUnavailable) {
      console.warn('[/private] identity could not be verified — showing the retry notice, not redirecting.')
      return <p>We could not verify who you are right now. You have not been signed out — reload in a moment.</p>
    }
    redirect('/login?redirectTo=%2Fprivate')
  }

  return <p>Hello {user.email}</p>
}
