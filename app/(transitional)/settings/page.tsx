// /settings has no content of its own — it only ever lands on Profile.
// A server-side redirect() (same convention as /education, /shapes,
// /agents) sends the browser straight to /settings/profile with no
// client render in between, so there is no "Loading settings…" screen to
// get stuck on. The previous version did this with a client `useEffect` +
// `router.replace`, which under React's dev double-invoke fired the
// replace twice, racing two `_rsc` fetches against each other; the loser
// left the tab parked on /settings showing the spinner forever (found
// 2026-09-26 while verifying settings doors as admin@admin.com).
import { redirect } from 'next/navigation';

export default function SettingsPage() {
  redirect('/settings/profile');
}

