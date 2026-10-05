---
type: Reference
title: User profile implementation rules
description: Code-path invariants for profile, account access, bounded account export and reversible closure.
timestamp: 2026-10-05
---

# User profile

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/account/billing/PLAN.md — read it before touching this feature in ANY repo.

## File map

- `components/UserProfilePage.tsx` is shared by the account settings page, window and phone drawer. The five lazy settings children supply stable `PROFILE_SECTION_IDS` anchors, not parallel forms. Writing voice has its own tab.
- `hooks/useUserProfile.ts` edits Auth metadata and the chat-visible profile; `hooks/useUserFormProfile.ts` edits the section-saved contact/identity form. Form-profile state stays local rather than in Redux.
- `app/api/user/profile/route.ts` and `app/api/user/form-profile/route.ts` are the existing profile read/patch paths. `types.ts` owns the form and JSONB normalization shapes.
- `account-access` owns verified Auth email changes and other-session revocation; password recovery reuses `/forgot-password`.
- `account-export/service.ts` reads the authenticated person's explicitly whitelisted account datasets directly through the client. `AccountExportSection.tsx` downloads that bounded JSON export.
- `features/account-lifecycle` and `/api/account/closure`, `/api/account/restore` own the restartable Auth-admin/Stripe closure workflow. The public restore page never restores on GET.
- `users.user_email_preferences` belongs to `features/settings/tabs/EmailTab.tsx`, not this feature. Avatar upload reuses `features/image-manager/components/ProfilePhotoTab`.

## Invariants

1. Update Auth metadata through `supabase.auth.updateUser({ data })`, never a direct Auth-table write. Profile save dispatches `setUserMetadata(...)` so global name/avatar consumers refresh. Any new save path must preserve that dispatch.
2. `users.profiles.display_name` cannot be null: preserve the Auth full-name → `User` fallback. Profile writes require the caller's `X-Organization-Id`; refuse before any metadata mutation when the organization cannot be named.
3. Existing `users.user_form_profile` rows retain their filed `organization_id`. A first save requires the caller's organization header; never silently move a contact profile or let a database default choose its organization. Upsert by `user_id`, not insert-then-update; no row and an empty row have the same form defaults.
4. Chat-visible display names, avatars and status are separate from private legal/contact/address/DOB/emergency fields. Never place sensitive contact data in `users.profiles`. Extend each defensive `normalize*` reader when extending a JSONB entry; malformed entries are dropped on profile reads.
5. Both hooks' `idle` state is loading during SSR/first render. Wait for both sources before rendering hydrated identity or locale timestamps. Failed saves preserve unsaved local edits and permit retry.
6. Empty editable lists render one welcoming first-item action without repeated heading/icon. It creates and focuses the first field; ordinary add controls appear after a row exists.
7. Auth email changes go through the account-access reverification flow, never a profile PATCH. Global refresh-token revocation does not instantly invalidate already-issued access tokens; keep the UI honest about expiry.
8. Account export must use a freshly verified identity, explicit personal filters and field lists, complete pagination, and all-or-nothing dataset reads. It is not a backup of projects, conversations, notes or files. Never include Vault/Auth/payment credentials, shared/company records or operational logs.
9. Closure must hold its fenced journal lease, verify each subscription's personal beneficiary/purpose, stop personal recurring billing before disabling access, retain shared data/memberships and refuse a shared organization's sole-owner closure. Recovery email precedes cancellation. Failures retain retryable checkpoints; restoration invalidates its token only after access/link recovery succeeds. Reclosure starts a fresh journal without stealing an existing lease.

The canonical database is `https://db.matrxserver.com`; no project-reference URL belongs in this feature. Storing a shipping address does not establish an ordering/shipping integration.
