// features/scopes/service/scopesReadKnob.ts
//
// THE ONE SWITCH for where the web app READS the scope system (lane 9 SCOPES-ON-THE-STORE, builder E,
// 2026-10-02; first cut lane SCOPES-WEB-REVERT, 2026-09-29).
//
// The switch is the platform knob `custom.scope_readers_read_the_store` — the same row the database
// readers (`public.get_scope_tree`, `get_scope_context`, …) consult — resolved for the SIGNED-IN
// PERSON in their active organization through the one knob snapshot (`platform.knob_snapshot`,
// `lib/scoped-config/effectiveKnobs.ts`), so the nearest rung wins:
//   - false — scope types, scopes, context items and values are read from the `context.*` tables, as
//     they were before lane SCOPES-READS-WEB (commit 3ed36176d1);
//   - true  — they are read through the record store's `custom.context_*` doors
//     (`storeScopeReads.ts` + `storeScopeAdapter.ts`).
//
// Why a knob and not a build flag: the store path has to be seen side by side with the old one — by
// one person (test@test.com, admin@admin.com) or one organization — on the shared localhost and on
// production, with no rebuild for everyone (the memory rule: no redirect until validated, old and
// new side by side, one flip later). An override is written through the admin door
// (Administration → Users & Access → Limits & Knobs → this knob → add an override for a person or an
// organization), never by SQL. The retired env flag `NEXT_PUBLIC_SCOPES_READ_FROM_STORE` decides
// nothing any more.
//
// Decided ONCE PER PAGE LOAD (the knob's `propagation` is `next_load`): the first scope read asks,
// every later read on the page takes the same answer, so a page never mixes the two paths. A knob that
// cannot be answered — no snapshot, a non-boolean, nobody signed in — is the old path with a console
// warning, never a silent pick. Switching organization does not re-decide; a reload does.
//
// The server's two readers (the scope short link, the class checkout) use `scopesReadKnob.server.ts`.

import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { whenOrgBootstrapResolved } from "@/lib/organizations/orgBootstrapGate";

/** The register's own (feature, key) pair. */
export const SCOPES_READ_KNOB = { feature: "custom", key: "scope_readers_read_the_store" } as const;

type Principals = { organizationId: string | null; userId: string | null };

function principals(): Principals {
  const store = getStoreSingleton();
  if (!store) return { organizationId: null, userId: null };
  const state = store.getState() as {
    appContext?: { organization_id?: string | null };
    userAuth?: { id?: string | null };
  };
  return {
    organizationId: state.appContext?.organization_id ?? null,
    userId: state.userAuth?.id ?? null,
  };
}

let testOverride: boolean | null = null;
/** This page load's answer, for the person it was decided for. */
let decided: { userId: string; value: boolean } | null = null;
let pending: { userId: string; promise: Promise<boolean> } | null = null;

function oldPath(why: string): false {
  console.warn(
    `[scopes] the read switch ${SCOPES_READ_KNOB.feature}.${SCOPES_READ_KNOB.key} could not be answered ` +
      `(${why}), so this page reads the scope system from the old tables. Reload once the knob answers.`,
  );
  return false;
}

async function decide(userId: string): Promise<boolean> {
  let { organizationId } = principals();
  // The person's override is on the user rung, which is organization-qualified: wait (bounded) for the
  // boot to answer which organization is active rather than resolve without one and miss it.
  if (!organizationId) {
    await whenOrgBootstrapResolved();
    organizationId = principals().organizationId;
  }
  try {
    const value = await ensureEffectiveKnob(organizationId, userId, SCOPES_READ_KNOB);
    if (typeof value !== "boolean") return oldPath(`it answered ${JSON.stringify(value)}, not true or false`);
    return value;
  } catch (error) {
    return oldPath(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Should this page read the scope system from the record store? The platform knob, for the signed-in
 * person in their active organization, decided once per page load.
 */
export async function scopesReadFromStore(): Promise<boolean> {
  if (testOverride !== null) return testOverride;
  const { userId } = principals();
  if (!userId) return oldPath("nobody is signed in on this page yet");
  if (decided?.userId === userId) return decided.value;
  if (pending?.userId === userId) return pending.promise;
  const promise = decide(userId).then((value) => {
    decided = { userId, value };
    pending = null;
    return value;
  });
  pending = { userId, promise };
  return promise;
}

/**
 * The answer this page load already decided, or `undefined` before the first scope read has asked.
 * For a synchronous reader (a reference chip's door): `undefined` means "read neither table yet".
 */
export function peekScopesReadFromStore(): boolean | undefined {
  if (testOverride !== null) return testOverride;
  const { userId } = principals();
  return decided && decided.userId === userId ? decided.value : undefined;
}

/** TEST SEAM: force the path (true/false), or pass null to return to the knob. */
export function __setScopesReadFromStoreForTests(value: boolean | null): void {
  testOverride = value;
}

/** TEST SEAM: forget this "page load"'s decision. */
export function __resetScopesReadDecisionForTests(): void {
  decided = null;
  pending = null;
}
