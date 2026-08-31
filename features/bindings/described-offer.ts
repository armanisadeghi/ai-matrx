// features/bindings/described-offer.ts
//
// WHAT A JOB OFFERS, when no code declared it (D18.1).
//
// A mandate's DESCRIBED inputs ARE its provision. The server's input surface is
// the one place that knows every declaration, so it answers when there is no
// `provision_key`; this module turns that served answer into the SAME
// `ProvisionOffer` a code provision produces, so every consumer downstream —
// the rail, the middle, the AI map, the batch grid — reads one shape.
//
// 🚨 It lives here, pure and shared, because BOTH modes of the one binding UI
// need it: map mode for the one job on screen, batch mode for every place in
// the grid. It was inline in `OneBindingWorkspace` until batch mode arrived;
// a second copy would have been the fork, and the guarantee rule below is
// exactly the rule a copy gets wrong.

import { parseDraftInputs } from "@/features/mandates/authoring/service";
import type { ProvisionOffer } from "@/features/mandates/provisions";
import type { OfferedValue } from "@/features/mandates/provision-shapes";
import type { MandateInputSurface } from "@/features/mandates/input-surface";

export interface DescribedOfferArgs {
  mandateKey: string;
  label: string | null;
  /** The mandate row's raw `draft_inputs` — the authoring truth. */
  draftInputs: unknown;
  surface: MandateInputSurface;
}

/**
 * The described offer, or null when the job describes nothing.
 *
 * 🚨 GUARANTEED COMES FROM THE MANDATE'S OWN `draft_inputs`, NOT from the served
 * surface's `sourcing`. They answer DIFFERENT questions and conflating them is
 * what made the first real save 422: aidream's `offer.described_offered_values`
 * sets `guaranteed = item["required"] is True`, while the input surface serves a
 * described input as `sourcing="require"` so the RUN FORM asks for it. Reading
 * the asking policy as the guarantee tells the client every value always
 * arrives, so no row ever declares `when_absent` and the server (rightly)
 * refuses the whole map.
 *
 * The slug a nameless described input gets is the SERVER's rule
 * (`slug_for_description`), so it is never recomputed here: declared names match
 * by name, and the rest match BY POSITION, which is safe because both lists are
 * the same `draft_inputs` array in author order. When the two lists disagree in
 * length, the guarantee is refused rather than guessed — "optional" makes
 * absence a declared decision, which is never wrong to require.
 */
export function describedOfferFrom({
  mandateKey,
  label,
  draftInputs,
  surface,
}: DescribedOfferArgs): ProvisionOffer | null {
  const drafts = parseDraftInputs(draftInputs);
  const requiredByName = new Map(
    drafts
      .filter((input) => Boolean(input.name?.trim()))
      .map((input) => [input.name as string, input.required === true]),
  );
  const described = surface.inputs.filter(
    (input) => input.origin === "mandate_input" || input.origin === "provision",
  );
  const values: OfferedValue[] = described.map((input, index) => ({
    name: input.name,
    kind: input.kind,
    guaranteed:
      requiredByName.get(input.name) ??
      (drafts.length === described.length
        ? drafts[index].required === true
        : false),
    lazy: false,
    description: input.label !== input.name ? input.label : input.help,
    // D2 — the author's own example, served with the input (never re-derived
    // here; the server is the one place that knows the declaration).
    example: input.example,
  }));
  if (values.length === 0) return null;
  return {
    id: `mandate:${mandateKey}`,
    provisionKey: `mandate:${mandateKey}`,
    label: label ?? mandateKey,
    description:
      "This job's own described inputs. They ARE its provision — map them onto whatever fulfils it.",
    offerKindSlug: null,
    values,
    isEnabled: true,
  };
}
