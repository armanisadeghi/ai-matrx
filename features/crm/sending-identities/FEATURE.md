# Sending mailboxes — the frontend of THE RIGHT TO SEND

> **Status:** live · **Updated:** 2026-08-17 · Routes `/crm/sending-identities`,
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
| **The three setup gates, as a DECLARED checklist** (domain → SPF/DKIM/DMARC → warm-up) | `sending-identities/sendingIdentityChecklist.tsx` on `lib/guided-setup/` — see [its FEATURE.md](../../../lib/guided-setup/FEATURE.md). **Do not add a fourth gate as another card**: add a step to that definition, or the surface goes back to having two checklist systems |
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
- **The plan gate explains itself and never hides the page.** Outreach *sending*
  needs a paid plan (handoff §5.6); connecting a mailbox, proving the domain and
  warming up stay free. `<CapabilityGate capability="outreach.send">` renders at
  the top as a notice-only banner (`{null}` children) naming the tier held, the
  tier required, and one click there — so a user learns the cost BEFORE spending
  an afternoon on DNS records, and the setup work stays fully usable. Gating the
  teaching is how a non-technical expert's outreach ends on day one.

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

## The org-level production bring-up checklist (2026-08-15)

`outreach.production_bring_up` ([bringUpChecklist.tsx](./bringUpChecklist.tsx),
mounted by `features/crm/components/sending-identities/OutreachBringUpSection.tsx`
on `/crm/sending-identities`) answers the question ABOVE the per-mailbox
checklist: what still stands between this ORGANIZATION and its first real
outreach message. Six steps: named mailbox on a proven domain (verified) ·
the Google Cloud reply pipe (confirmed, exact copy-paste values) · server
listening for replies (verified against `GET
/sending-identities/bring-up-readiness`, hand-typed shape in types.ts until the
generated spec carries it) · sending rules accepted (verified against
`crm.outreach_acceptance`; the fix opens `AcceptSendingRulesDialog` — the FIRST
caller of `acceptOutreachPolicy`, full text on screen, exact words recorded) ·
vendor keys present (verified, booleans only) · gmail.readonly (verified +
OPTIONAL — queued behind Google's review; no user action can hurry it, so it
must not block the done verdict).

Traps: the readiness endpoint on a server that predates it falls into
`/{identity_id}` and answers 400 — the checks map ANY readiness failure to
`unknown`, never `fail`, so a stale deployment reads as "couldn't check", not
"you broke something". The Pub/Sub push URL is
`https://server.app.matrxserver.com/outreach/inbound/gmail/<delivery-secret>` —
**there is no `/api` segment** because aidream mounts this public router at the
bare `/outreach/inbound` prefix. Dialog fixes resolve their promise on CLOSE
(accepted or not) so the re-check fires either way and reads the truth from the
DB.

- 2026-08-16 — ConnectMailboxDialog dead end fixed: "Connect a different Google account" is now ALWAYS offered (inline GIS popup via LazyGoogleAPIProvider + gmail.send scopes, exchange, list reload) — previously the door existed only in the empty state, so a user with existing connections could never add a third account.
