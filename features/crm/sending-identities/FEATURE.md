# Sending mailboxes — the frontend of THE RIGHT TO SEND

> **Status:** live · **Updated:** 2026-08-14 · Routes `/crm/sending-identities`,
> `/crm/sending-identities/[identityId]`

The surface where a user connects the mailbox their outreach is sent from, proves
they own its domain, watches it warm up, and sees whether it is healthy.

**Server contract (read it first):**
`aidream/aidream/services/sending_identity/FEATURE.md`. Work order + the decided
architecture: [`../../docs/handoffs/outreach-system.md`](../../../docs/handoffs/outreach-system.md) §5.

## THE LAW this screen renders

> Customers send from **their own** mailboxes on **their own** verified domains.
> AI Matrx never relays customer outreach through its own infrastructure or a
> shared "from" pool.

Which is why the page is a mailbox list and not a "sending settings" panel: the
mailbox is a real, owned, provable thing, and the four gates it passes (domain
proof → authentication → warm-up → limits) are the product, not friction.

## Why this one CRM sub-feature talks to Python

The rest of `features/crm/` reads and writes `crm.*` **direct to Supabase**,
which is correct for CRUD. A sending identity is not CRUD — every meaningful
operation is server-side work a browser physically cannot do:

- resolving DNS to prove domain ownership, and reading SPF/DKIM/DMARC;
- operating an OAuth mailbox credential that must never reach a client;
- running the send gate that decides whether anything may go out at all.

There is still **one canonical path per operation**; it just lives in aidream.
`sending-identities/service.ts` is the only caller, bound to the generated
contract via `@/lib/api/typed-client` so a backend rename is a compile error.

## Files

| What | Where |
|---|---|
| Types (derived from the generated contract) + status/fix copy | `sending-identities/types.ts` |
| aidream client — the only place these endpoints are called | `sending-identities/service.ts` |
| Fetch + mutate hooks | `sending-identities/hooks.ts` |
| List + org emergency stop | `../components/sending-identities/SendingIdentitiesPage.tsx` |
| One mailbox: gates, health, audit | `../components/sending-identities/SendingIdentityDetailPage.tsx` |
| **Every problem beside its one-click fix** | `../components/sending-identities/IssueList.tsx` |
| Copy-and-paste DNS proof record | `../components/sending-identities/DnsRecordCard.tsx` |
| Deliverability tiles with verdicts | `../components/sending-identities/HealthPanel.tsx` |
| Mailbox picker (incl. the ones you can't use, and why) | `../components/sending-identities/ConnectMailboxDialog.tsx` |
| Entity door | `features/scopes/registry/entityRegistry.ts` → `crm_sending_identity` |
| Nav | `features/shell/constants/nav-data.ts` → CRM group |

## No dead ends — what this surface guarantees

- **Every problem ships with its fix.** The server returns a machine-readable
  `fix_action` with every refusal; `FIX_COPY` in `types.ts` maps it to the button.
  Four shapes: `action` (call the server now), `link` (go where it is resolved),
  `guide` (the DNS card is already on the page), `wait` (a calm countdown, not an
  error). **A new server refusal reason without a `FIX_COPY` entry is a dead end**
  — add both in the same change.
- **Unusable mailboxes are still listed**, with the reason and a Fix link. An
  account that silently vanishes from a picker leaves a user certain they
  connected it and unable to find it.
- **Verdicts, not timestamps.** Health tiles say "too high — this is what burns a
  domain", not a bare percentage the reader must know the industry limit to judge.
- Every identity is reachable by its registry door (`crm_sending_identity`).

## Traps

- **Never render a green "0% bounces" without the caveat.** Inbound webhooks are
  Phase 5, so bounce/complaint counts read zero because nothing reports them yet —
  not because the mailbox is proven clean. `HealthPanel` states that on screen.
  Removing that sentence turns the panel into a lie.
- **There is no "skip warm-up" or "mark verified" control, and there must never
  be one** — no such server call exists, deliberately.
- **Mutations take the server's returned record.** Pressing "Check the domain
  now" can move an identity to `verifying` *or* PAUSE it (when a record was
  removed); guessing optimistically would put a wrong, safety-critical status on
  screen.
- **A system pause is stated as a system pause.** The copy says nothing will
  resume it on its own — that is the product behaviour, not a UI opinion.
- **The from-address is never a free-text field.** The server only accepts the
  address the OAuth account actually authenticated as, so a text input would
  only manufacture refusals.
