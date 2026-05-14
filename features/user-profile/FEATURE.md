# FEATURE.md — `user-profile`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-05-13`

---

## Purpose

Lets a signed-in user view and edit every field that identifies them across the
app: display name, avatar, legal name, pronouns, addresses, phones, emails,
social handles, work info, and emergency contacts. Powers both the standalone
`/settings/profile` route and the "Profile" tab in the settings drawer. The
rich form-profile data is what agents acting on behalf of the user read when
they need to fill out forms, ship something, or address a message.

---

## Entry points

**Routes**

- `app/(authenticated)/settings/profile/page.tsx` — standalone route. Thin
  wrapper that renders `<UserProfilePage />`.

**Settings registry tabs** (`features/settings/registry.ts`)

- `account` — parent "Profile" tab. Opens the form scrolled to the top.
- `account.identity` — deep-links to the Identity section.
- `account.contact` — deep-links to Contact.
- `account.addresses` — deep-links to Shipping (Billing is right below).
- `account.work` — deep-links to Work.
- `account.emergency` — deep-links to Emergency contacts.

All five children render the same `UserProfilePage` with a different
`defaultSection` prop. There is no parallel implementation per sub-tab.

**Hooks**

- `useUserProfile()` (`features/user-profile/hooks/useUserProfile.ts`) — fetch,
  edit, save the account-level identity (auth metadata + `public.profiles`).
  Dispatches `setUserMetadata(...)` after save so the global header avatar/name
  refresh immediately.
- `useUserFormProfile()` (`features/user-profile/hooks/useUserFormProfile.ts`)
  — fetch, edit, section-save the rich form profile. Exposes `saveSection(keys)`
  for per-section save buttons.

**API endpoints**

- `GET /api/user/profile` — returns `UserAccountData` (auth metadata fields +
  the `profiles` row, with sensible defaults if the row doesn't exist yet).
- `PATCH /api/user/profile` — accepts a partial `UserAccountData`. Writes
  auth-metadata fields via `supabase.auth.updateUser({ data })` and upserts
  `public.profiles`. Echoes the canonical state back.
- `GET /api/user/form-profile` — returns `UserFormProfileData`. Empty defaults
  when the row doesn't exist yet.
- `PATCH /api/user/form-profile` — partial upsert into `public.user_form_profile`
  by `user_id`. Only fields present in the body are written.

**Redux slice(s)**

- No dedicated slice. Account fields write back into the existing
  `state.userProfile.userMetadata` via `setUserMetadata(...)` so the global
  header stays in sync. Form-profile data is intentionally **not** in Redux —
  large shape, only needed on this surface.

---

## Data model

**Database tables** (Supabase, project `txzxabzwovsujtloxrus`)

- `auth.users.user_metadata` — owner: Supabase Auth. Fields edited here:
  `full_name`, `name`, `preferred_username`, `avatar_url`, `picture`. Updated
  via `supabase.auth.updateUser({ data })`; do NOT write to this table directly.
- `public.profiles` — chat-visible profile, RLS: owner can update, all
  authenticated users can SELECT (chat needs to see other users' display names
  and avatars). Fields: `display_name` (NOT NULL, default `'User'`),
  `avatar_url`, `status_text`, `is_online`, `last_seen_at`.
- `public.user_form_profile` — RLS: owner-only on all four CRUD operations.
  PK is `user_id`. JSONB columns: `phones`, `emails`, `social_handles`,
  `emergency_contacts`, `images`, `custom_fields`. Scalar text + DOB columns
  for legal name, addresses, work info.
- `public.user_email_preferences` — NOT owned by this feature; lives in
  `EmailTab` (`features/settings/tabs/EmailTab.tsx`) via
  `/api/user/email-preferences`. Mentioned only so contributors know not to
  re-implement it here.

**Key types** (`features/user-profile/types.ts`)

- `UserAccountData` / `UserAccountPatch` — auth metadata + chat profile slice.
- `UserFormProfileData` / `UserFormProfilePatch` — full form profile shape.
- `PhoneEntry`, `EmailEntry`, `SocialHandle`, `EmergencyContact`,
  `ProfileImage`, `CustomFields` — JSONB row shapes.
- `PROFILE_SECTION_IDS` / `ProfileSectionId` — stable DOM anchors on the
  page; the settings sub-tab wrappers depend on these values.

**JSONB normalization**

- `normalizePhones`, `normalizeEmails`, `normalizeSocialHandles`,
  `normalizeEmergencyContacts`, `normalizeImages`, `normalizeCustomFields` —
  defensive read helpers. The DB has no CHECK constraints on these JSONB
  arrays, so external writers (RPCs, agents) could in theory write malformed
  entries. These helpers drop garbage instead of throwing.

---

## Key flows

### 1. User changes their display name from the Profile page

1. User edits "Display name (chat)" field in the Display section.
2. `setField("display_name", value)` (from `useUserProfile`) updates local
   state and flips `dirty=true`.
3. User clicks "Save changes" in the section footer.
4. `save()` diffs local state vs. the last server snapshot and PATCHes only
   the changed keys to `/api/user/profile`.
5. Route updates `auth.users.user_metadata` via
   `supabase.auth.updateUser({ data: {...} })` AND upserts `public.profiles`.
6. Route echoes the canonical state back; hook calls
   `dispatch(setUserMetadata({ fullName, name, preferredUsername, avatarUrl, picture }))`.
7. Every component subscribing to `selectActiveUserName` / `selectUserAvatarUrl`
   re-renders immediately. No page reload needed.

### 2. Agent reads a user's shipping address before placing an order

1. Agent server (Python) calls the user's MCP/internal API to fetch their
   profile, OR an in-app agent component calls `useUserFormProfile()` and
   reads `data.shipping_*`.
2. If the user has never saved their form profile, `useUserFormProfile`
   resolves to `EMPTY_FORM_PROFILE` — every field is `null` and every JSONB
   array is `[]`. Agents must handle the empty case.

### 3. User deep-links to the Identity sub-tab from the settings drawer

1. User clicks "Identity" under "Profile" in the settings tree.
2. `SettingsShell` activates the `account.identity` tab id and renders
   `ProfileIdentityTab` (lazy).
3. `ProfileIdentityTab` mounts `<UserProfilePage embedded
   defaultSection={PROFILE_SECTION_IDS.identity} />`.
4. The `useEffect` in `UserProfilePage` waits for both API loads to resolve
   then calls `el.scrollIntoView({ behavior: "smooth", block: "start" })` on
   `#profile-identity`.
5. The user lands inside the Identity section ready to edit.

### 4. Save fails because the database is unreachable

1. PATCH returns non-2xx or throws.
2. Hook's `sendPatch` catches the error, calls `toast.error(msg)`, and returns
   `false` from `save()`.
3. Local state is NOT touched — the user's edits remain in the form, dirty
   flag still true, they can retry.

---

## Invariants & gotchas

- **Do NOT write to `auth.users.user_metadata` directly.** Always go through
  `supabase.auth.updateUser({ data })`. Direct table writes won't update the
  JWT and the `USER_UPDATED` auth event won't fire.
- **After saving account fields, you MUST `dispatch(setUserMetadata(...))`.**
  Without it the global header avatar/name won't refresh until the page is
  reloaded. The hook handles this — if you write a new save path, replicate
  it.
- **`display_name` in `public.profiles` is `NOT NULL` with a default `'User'`.**
  If the client clears it, the API route substitutes a fallback (auth
  `full_name` → literal `'User'`) so the upsert never fails on the constraint.
- **`public.profiles` is publicly readable** (RLS qual = `true` on SELECT).
  Don't put anything sensitive in `status_text` — every authenticated user can
  read it. Address, phone, DOB, legal name, etc. all live on
  `public.user_form_profile`, which has strict owner-only SELECT.
- **`user_form_profile` rows are upserted, not inserted-then-updated.** The
  table's PK is `user_id`. First save creates the row; subsequent saves
  update it. Client code should treat "no row" and "row of nulls" identically.
- **JSONB array normalization is defensive on read.** Malformed entries are
  silently dropped. If you add a new field to `PhoneEntry`/`EmailEntry`/etc.,
  extend the matching `normalize*` helper or it will not appear after a
  round-trip.
- **Section sub-tabs are five files, not a generic factory.** Each tab is a
  lazy default export because the settings registry types require
  `ComponentType<Record<string, never>>` (no props). We deliberately accepted
  the duplication over a more clever abstraction.
- **Avatar upload is delegated to `features/image-manager/components/ProfilePhotoTab`.**
  When that component runs, it calls `supabase.auth.updateUser({ data: {
  avatar_url, picture } })` directly. After a successful upload the user's
  Redux `userMetadata.picture` is updated by the matching `setUserMetadata`
  dispatch only when triggered from this feature's save path; the
  `ProfilePhotoTab` callsite still requires page reload to refresh other
  surfaces. Future work: make `ProfilePhotoTab` dispatch `setUserMetadata`
  too.
- **Email is NOT editable here.** Changing the auth email requires Supabase
  Auth's email change flow with reverification, which is out of scope.

---

## Related features

- Depends on: `lib/redux/slices/userProfileSlice` (the `setUserMetadata`
  action), `utils/supabase/server` (server client for the API routes),
  `components/official/settings/*` (section + primitive UI),
  `features/image-manager/components/ProfilePhotoTab` (avatar uploader).
- Depended on by: agent flows that read a user's shipping/billing address,
  agent-on-behalf-of-user forms that need legal name, the chat presence
  feature (which reads `public.profiles`).
- Cross-links: `features/settings/FEATURE.md`, `features/image-manager/FEATURE.md`.

---

## Current work / migration state

None — feature shipped in one PR (the same commit as this doc). No migration
docs; no parallel implementation to retire. If a future change adds a
`pronoun_set` enum column or pulls form-profile data into Redux, this section
should describe the migration path.

---

## Change log

Newest first. Each entry: date, author/agent, one-line summary.

- `2026-05-13` — agent: Initial implementation. Two API routes
  (`/api/user/profile`, `/api/user/form-profile`), two hooks, six form
  sections, five settings registry sub-tabs. Replaces the broken read-only
  `app/(authenticated)/settings/profile/page.tsx`.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this
> feature, update this file's status, add flows you introduced/removed, and
> append to the Change log. Stale FEATURE.md cascades across parallel agents.
> Treat doc updates with the same weight as code changes in the same PR.
