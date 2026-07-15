// Users & Access › Accounts (hub landing).
//
// The canonical roster — full user data, per-column sort/filter, Copy-for-AI,
// and per-row actions (magic link, password reset, email, onboarding flag) plus
// cross-links to each user's preferences / usage / admin level. Thin shell over
// the feature client.

import { AccountsTableClient } from "@/features/admin/users/components/AccountsTableClient";

export default function UsersAccountsPage() {
  return <AccountsTableClient />;
}
