import "server-only";

/**
 * Server-side agent-mandate resolution — the SSR half of the Mandates system,
 * for Server Components that must paint a mandate's agent before first paint
 * (`/chat/new`, `/chat/talk`, `/chat/voice`, `/work/new`, the cx-chat demos).
 *
 * 🚨 THIS RESOLVES THE SYSTEM RUNG, AND ONLY THE SYSTEM RUNG — deliberately.
 *
 * Under the one-resolution ruling (D-R1, Arman 2026-09-01) the middle rung of
 * the ladder is the caller's ACTIVE organization. A Server Component has no
 * active organization: there is no Redux app-context, no workspace picker, and
 * no admitted `X-Organization-Id` — the selection is a browser-side fact that
 * does not exist yet at render time. So there is no honest org rung to walk
 * here, and this module does not pretend otherwise.
 *
 * WHAT WAS DELETED HERE, 2026-09-07: a hand-written copy of the client's
 * two-rung ladder, including an `org` binding query that named NO organization
 * (`principal_type='org'`, newest of five) and therefore applied whichever org
 * binding RLS happened to expose — measured live, that is every system-org row,
 * to users who belong to no such org. It was the same defect as the client
 * resolver's, in a second place, which is why it dies in the same commit rather
 * than being left as the surviving fork. Live impact of the deletion: none —
 * `chat.default_new_chat` and `voice.intro` carry ZERO bindings of any rung
 * (measured 2026-09-07), so every SSR call already answered at the system rung.
 *
 * THE CONTRACT WITH THE PAGE. What this returns is the PLATFORM DEFAULT for
 * first paint, and it says so in the value it hands back: `provenance` is always
 * `"system"` and `organizationId` is `null`, which is what distinguishes an SSR
 * placeholder from a real verdict. Every consumer hands off to the browser
 * (`useMandate` / `resolveMandate`), which asks the server's one resolution door
 * with the admitted organization and gets the rung that actually runs. A surface
 * that must NOT paint before the real rung is known should not use this module —
 * it should render from `useMandate`'s loading state.
 *
 * Floating-only, same as the browser: the run path the page hands off to has no
 * version channel, so a version-pinned default throws rather than running the
 * wrong row.
 *
 * No module cache: each request resolves fresh through the request-scoped
 * Supabase server client (two indexed single-row reads).
 *
 * Failure posture: throws. A page that can degrade catches and SCREAMS via
 * console.error — never a silent fallback to a hardcoded id.
 */

import { createClient } from "@/utils/supabase/server";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { parseMandateContract } from "./contract";
import { parseMandateWave1 } from "./provision-shapes";
import type { ResolvedMandate } from "./service";
import {
  MANDATE_STORAGE_LABEL,
  contractOfMandate,
  holderOfMandate,
  inputKindOfMandate,
  isFloatingMandate,
  mandateDefinitions,
  mandateTreatments,
} from "@/lib/supabase/mandateStorage";
import {
  TREATMENT_TIER_WIDGET,
  parseTreatmentConfig,
  type BindingPresentation,
} from "@/features/bindings/treatment-shape";

export async function resolveMandateServer(
  mandateKey: string,
): Promise<ResolvedMandate> {
  const supabase = await createClient();
  // `select("*")` on purpose: the wave-1 columns (provision_key, pins,
  // pinned_context) are live but ahead of the generated Row type — they ride
  // the full row and are narrowed at ingress by `parseMandateWave1`.
  const { data: mandate, error } = await mandateDefinitions(supabase)
    .select("*")
    .eq("mandate_key", mandateKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!mandate) {
    throw recordUnavailable({
      entity: "mandate",
      reason: "unknown",
      recordId: mandateKey,
      relation: "mandate.definition",
    });
  }
  if (!mandate.is_enabled) {
    throw new Error(`mandate "${mandateKey}" is disabled`);
  }
  const systemHolder = holderOfMandate(mandate);
  if (!isFloatingMandate(mandate) || !systemHolder.holderId) {
    throw new Error(
      `mandate "${mandateKey}" is version-pinned — a server-rendered mandate must be floating (no pinned Holder version), because the client run path this page hands off to has no version channel; unpin the job's default Holder, or render this surface from useMandate instead of before first paint (${MANDATE_STORAGE_LABEL})`,
    );
  }

  // THE PRESENTATION LAYER — the SSR twin of the browser resolver's read. Both
  // must answer the same question the same way, or a job would paint itself one
  // way before first paint and another after hydration. This is DISPLAY
  // identity, not a resolution rung: one row, keyed on the job.
  let presentation: BindingPresentation | null = null;
  {
    const { data: treatment, error: treatmentError } = await mandateTreatments(
      supabase,
    )
      .select("config, is_enabled")
      .eq("mandate_id", mandate.id)
      .eq("tier", TREATMENT_TIER_WIDGET)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (treatmentError) {
      console.error(
        `[resolveMandateServer] "${mandateKey}": its display options could not be read; painting the platform default presentation`,
        treatmentError,
      );
    } else if (treatment && treatment.is_enabled !== false) {
      presentation = parseTreatmentConfig(treatment.config);
    }
  }

  const wave1 = parseMandateWave1(mandate);
  return {
    mandateKey,
    mandateId: mandate.id,
    agentId: systemHolder.holderId,
    holderType: systemHolder.holderType,
    configOverrides: null,
    provenance: "system",
    // NULL is the signal, not an omission: this answer was resolved with no
    // active organization, so it is the platform default and not a verdict for
    // any particular workspace. See the module header's contract with the page.
    organizationId: null,
    freshness:
      "Rendered before first paint from the job's own default Holder, with no organization in play. Your workspace's and your own overrides are applied by the browser as soon as this page hydrates.",
    consumptionMap: null,
    autoRun: null,
    // The same contract the browser resolver carries — required variables are a
    // RUN-time precondition on the caller, not only a bind-time check on the
    // agent (disease D4).
    contract: parseMandateContract(contractOfMandate(mandate)),
    inputKind: inputKindOfMandate(mandate),
    outputKind: mandate.output_kind,
    provisionKey: wave1.provisionKey,
    pins: wave1.pins,
    pinnedContext: wave1.pinnedContext,
    presentation,
  };
}
