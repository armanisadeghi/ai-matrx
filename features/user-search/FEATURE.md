# FEATURE.md — User Search

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-24`

---

## Purpose

User Search is the canonical account-selection control. It keeps inline typing immediate and opens one sortable, filterable window for deliberate user discovery.

---

## Entry points

**Components**

- `features/user-search/UserSearchField.tsx` — inline input plus advanced-search window action.
- `features/window-panels/windows/admin/user-search/UserSearchWindow.tsx` — shared MatrxDataTable picker.

**Hooks**

- `useOpenUserSearchWindow()` — opens an isolated picker instance and returns the selected account through callback events.

**API endpoints**

- `GET /api/admin/users` — full account directory for super-admin callers only.

---

## Data model

**Key types**

- `UserSearchCandidate` (`features/user-search/types.ts`) — minimal display/search projection passed between callers and the window.
- `UserSearchWindowData` (`features/user-search/types.ts`) — runtime-validated serializable overlay payload.

---

## Key flows

1. A caller renders `UserSearchField` and continues to own its inline value.
2. The search icon calls `useOpenUserSearchWindow()` with either the protected admin directory or caller-provided permitted candidates.
3. `UserSearchWindow` loads, searches, sorts, filters, and paginates through `MatrxDataTable`.
4. Select emits one typed callback event, closes the exact window instance, and lets the caller decide what the chosen user means.

---

## Invariants & gotchas

- **Selection is read-only.** Mutations remain in each feature's existing protected RPC/service path.
- **Never broaden visibility.** `directory="admin"` uses the super-admin endpoint; ordinary surfaces pass only candidates the current user may already see.
- **Inline typing is immediate.** Debounce belongs to a remote query owner, never the controlled input.
- **Overlay data stays serializable and runtime-validated.** Callbacks live in `callbackManager`, never Redux.

---

## Related features

- Depends on: `features/window-panels`, `components/official/matrx-data-table`, `features/admin/users`.
- Depended on by: admin-level management and bulk email, organization membership/admin/email/invitations, task assignment, shared-knowledge access and curator assignment, resource sharing, and direct messaging.

---

## Doctrine compliance

**Primitives reused**

- Components: `Input`, `Button`, `MatrxDataTable`, `WindowPanel`, `AdminUserRef`.
- Redux: canonical `overlaySlice` open/close actions.
- Services: existing `/api/admin/users`; no parallel user-directory endpoint.

**Primitives introduced**

- `UserSearchField` — one shared field/window launcher was required because existing user pickers independently combined exact-email lookup, connection lists, and searchable selects.
- `UserSearchCandidate` — one serializable cross-surface selection projection was required; full auth/admin rows cannot be exposed to ordinary callers.

---

## Current work / migration state

All discovered existing-account selectors now expose `UserSearchField`; invitation-only email inputs remain separate because they create an invitation rather than select an existing account.

---

## Change log

- `2026-08-24` — Codex: Added the canonical inline plus advanced-window user picker and its protected/provided directory modes.
