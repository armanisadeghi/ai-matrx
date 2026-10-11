# FEATURE.md — `education/compliance` (COPPA age gate, client side)

**Status:** `live` · **Tier:** 2
Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/child-safety/STATE.md — read it before touching this feature in ANY repo. It owns every COPPA rule, status and open item; this file is only how the client uses the gate.

## What it is

Captures a user's age band (`users.profiles.age_band`: `under_13 | 13_17 | adult`, NULL = undeclared) and decides, before any education AI action, whether it may run. An under-13 needs a VERIFIED guardian link (`features/education/family`) — never a second consent store. A block is always a visible "a parent must approve" state, never silent.

Three layers read ONE verdict, `public.edu_coppa_gate_for(user_id)`: this client gate (`edu_coppa_gate()` wraps it for `auth.uid()`), aidream's `enforce_education_coppa` (server contract: `aidream/aidream/services/education_compliance/FEATURE.md`), and `utils/education/serverCoppaGate.ts`. Never re-derive the verdict in another place.

## Where it lives

`features/education/compliance/`: `coppaService.ts` (typed RPC wrappers; `getGate()` checks the live Supabase session first and returns the `no_subject` allow locally when there is none; concurrent callers share one 3s in-flight result, `{ force: true }` re-reads after a declaration), `useAiComplianceGate.tsx` (the primitive), `components/` (`AiConsentRequiredDialog`, `AgeDeclarationDialog`, `AgeBandPrivacyCard`), `consent/` (guardian card-verification client + webhook confirm, see `../family/FEATURE.md`), and the two mounts below. Surfaced on `/education/data` via `AgeBandPrivacyCard`. DB: `migrations/edu_compliance_age_band_coppa.sql`, `edu_coppa_gate_applies.sql`, `edu_coppa_gate_guest_declaration.sql`, `edu_undeclared_age_allows_at_gate.sql`, `edu_age_band_write_guard.sql`, `edu_age_band_escape_hatches_closed.sql`.

## The rule for every AI entry point

Every AI entry point calls the gate first, then the entitlement guard, and renders `<coppa.Gate />` once near the action:

```ts
const coppa = useAiComplianceGate();
if (!(await coppa.ensureAllowed())) return;   // COPPA first
await entitlementGuard.guard(runGeneration);  // then billing
```

Find the live consumers with `grep -rl useAiComplianceGate`. Never re-implement either dialog at a call site. `engage/` (games) triggers no AI generation and needs no gate. The composer-based tutor gates at session start (no per-send hook).

## How a learner is identified (up front, never via an error)

1. `FirstSignInAgeGateMount` (platform-wide, in `app/DeferredSingletonCore.tsx`): a signed-in account with no band is asked once, after first sign-in. Never at signup (owner ruling: VISION.md § "Age band").
2. `EducationAgeGateMount` (education layout): the same ask for GUESTS only (`guest_age_undeclared`), with a sign-in link. It must not handle `age_undeclared` — layer 1 owns it, and two dialogs on `/education` is a bug.
3. `ensureAllowed()` per action: an undeclared learner or guest is prompted and the clicked action resumes on answer; an under-13 without a verified guardian gets the consent dialog.
4. The server gate refuses a declared under-13 without verified consent and an undeclared guest even if the client is bypassed.

`AgeDeclarationDialog` asks "18 or older / under 18" first and only then the 13-17 vs under-13 split. Dismissal writes nothing, blocks nothing, and re-asks next tab session (`sessionStorage` key `matrx.age_band_prompt.asked.v1`); there is no permanent "don't ask again".

## Rules specific to this code

- Undeclared signed-in = ALLOW with a nudge (`age_undeclared`); a guest with no band = refuse (`guest_age_undeclared`).
- `edu_set_age_band` returns `{status, age_band, reason}` and does NOT raise on a blocked `under_13 → 13_17|adult`; callers must read `status` (raising would roll back the audit row). The route out is `edu_guardian_set_age_band` by a verified adult guardian (`family/components/StudentAgeBandControl.tsx`).
- `ensureAllowed()` fails CLOSED for the minor path on a resolver error (signed-in with no already-resolved allowed verdict is blocked); an already-resolved allow and a not-signed-in visitor keep the soft allow. Always loud (`console.error`). Concurrent `ensureAllowed()` calls all resolve when the prompt is answered.
- The COPPA gate runs BEFORE the entitlement gate: "may this account collect data" precedes "can the plan afford it".
- Any Next.js route that hands the browser the means to reach a model (a minted provider credential, e.g. `/api/voice-agent/token`) MUST call `resolveServerCoppaVerdict(userId)` and refuse when `aiAllowed` is false — aidream never sees that generation. It is account-scoped, fails closed, and shares the two refusal `error_type`s with the server (`coppaRefusal`).
- A server refusal is a stream `fatal_error` with `error_type` `education_coppa_consent_required` or `education_age_declaration_required`; `user_message` is safe to show, `message` is diagnostic. No education surface maps these types to the dialogs yet (the proactive prompt and per-action gate settle COPPA first); mapping them is the open belt-and-suspenders item.
- Enforcement for a browser guest is the SERVER gate: aidream mints the guest's anonymous user server-side and the browser holds no Supabase session, so `edu_coppa_gate()` sees `no_subject`.
- The gate is education-scoped (`source_feature` prefix), not account-scoped; the account-wide gate is an open item in the STATE.
- A guardian must be an adult (child-safety STATE rule 4); the age band is self-attested at first declaration.
