"use client";

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { encoreListConfig } from "./browse/listConfig";

/**
 * WHAT ENCORE IS, SAID ON THE PAGE (cold walk 12, D13).
 *
 * The header is the single word "Encore", and nothing on the page said what
 * that word meant. A first-time Expert met an invented-sounding name with no
 * explanation and no way to find out: "a page titled only 'Encore' with no
 * sentence saying what it is".
 *
 * The NAME is not ours to change — naming belongs to the owner, and "Encore"
 * is in the canonical vocabulary (`common-docs/systems/platform/vocabulary/
 * FEATURE.md`): *"The Operator-facing invocation surface — where a released
 * Masterwork is run on demand. Every run is an encore of the Expert's original
 * performance."* So the word stays and the page explains itself, in the plain
 * words a person uses rather than the vocabulary's own.
 *
 * It rides the shell's existing `notice` slot — the banner above the tabs —
 * rather than a new surface or a new config field, so nothing else on the
 * platform changes shape for one sentence.
 */
const WHAT_THIS_IS =
  "A Masterwork is a finished piece of your expertise you can run on demand. " +
  "Every one you have released, or that someone shared with you, is here — " +
  "open one, give it the work, and it does the job the way you would.";

export function EncoreHomePage() {
  return (
    <EntityListPage
      config={encoreListConfig}
      notice={
        <p className="px-1 pb-1 text-sm text-muted-foreground">
          {WHAT_THIS_IS}
        </p>
      }
    />
  );
}
