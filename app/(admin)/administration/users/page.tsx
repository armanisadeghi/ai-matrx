// Users & Access › Accounts (hub landing).
//
// The canonical roster — full user data, per-column sort/filter, Copy-for-AI,
// and per-row actions (magic link, password reset, email, onboarding flag) plus
// cross-links to each user's preferences / usage / admin level. Thin shell over
// the feature client.

import { Suspense } from "react";
import { AccountsTableClient } from "@/features/admin/users/components/AccountsTableClient";

export default function UsersAccountsPage() {
  // useSearchParams (?user focus) needs a Suspense boundary — same as the usage
  // and preferences siblings. The admin layout forces dynamic rendering, so
  // omitting this does not fail the build today; that is an accident of a
  // setting on another file, not a reason to leave the boundary out.
  return (
    <Suspense fallback={null}>
      <AccountsTableClient />
    </Suspense>
  );
}
