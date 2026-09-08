// features/meet/components/SignedOutMeetings.tsx
//
// A signed-out visitor at `/meetings` sees the truth and one door: creating a
// meeting needs an account and an organization; JOINING one never does (D6), so
// nothing here suggests they cannot attend a meeting they were invited to.

import Link from "next/link";
import { loginHref } from "@/utils/auth/auth-destination";

export function SignedOutMeetings() {
  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-base font-semibold">Meetings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to create a meeting and share its link. You do not need an
        account to JOIN one — if somebody sent you a meeting link, open that link
        directly, type your name, and the host will let you in.
      </p>
      <Link
        href={loginHref("/meetings")}
        className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      >
        Sign in
      </Link>
    </div>
  );
}
