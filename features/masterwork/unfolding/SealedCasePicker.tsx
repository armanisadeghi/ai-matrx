"use client";

/**
 * THE SEALED-CASE PICKER — how the Expert points a desk at a case it has
 * never seen.
 *
 * It appears ONLY when the Masterwork's definition carries a
 * `masterwork.case.disclose` node, because only a desk can unfold a case; on
 * every other Masterwork the run box is exactly what it was.
 *
 * What it shows is the label and the publication date, and nothing else. The
 * timeline and the resolution are sealed (§3, THE WITHHOLDING LAW) — a picker
 * that previewed the case would hand the reader the answer before the run
 * started.
 *
 * Every failure state here names its remedy: a Rulebook with no sealed cases
 * says how to add one, and a read that fails says so instead of rendering an
 * empty dropdown that reads as "you have none".
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileLock2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  listSealedCases,
  rulebookIdForMasterwork,
  type SealedCase,
} from "./sealedCases";

export type SealedCasesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rulebookId: string | null; cases: SealedCase[] }
  | { status: "error"; message: string };

/**
 * Load this desk's sealed cases. `enabled` is the definition's answer to "is
 * this a desk" — a non-desk Masterwork never reads the corpus at all.
 */
export function useSealedCases(
  masterworkId: string,
  enabled: boolean,
): SealedCasesState {
  const [state, setState] = useState<SealedCasesState>({ status: "idle" });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    void (async () => {
      try {
        const rulebookId = await rulebookIdForMasterwork(masterworkId);
        if (!alive) return;
        if (!rulebookId) {
          setState({
            status: "error",
            message:
              "This Masterwork does not record which Rulebook it was built from, so its sealed cases cannot be found. Rebuild it from the Rulebook page and the picker fills in.",
          });
          return;
        }
        const cases = await listSealedCases(rulebookId);
        if (!alive) return;
        setState({ status: "ready", rulebookId, cases });
      } catch (err) {
        if (!alive) return;
        setState({
          status: "error",
          message: `Could not read this Rulebook's sealed cases: ${
            err instanceof Error ? err.message : String(err)
          }. Reload the page; if it keeps happening the corpus read is failing, not your setup.`,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [masterworkId, enabled]);

  return state;
}

export function SealedCasePicker({
  state,
  value,
  onChange,
}: {
  state: SealedCasesState;
  value: string | null;
  onChange: (caseItemId: string) => void;
}) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-masterwork-sealed-case="loading"
      >
        Looking for the sealed cases this Rulebook holds…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p
        className="text-xs text-destructive"
        data-masterwork-sealed-case="error"
      >
        {state.message}
      </p>
    );
  }

  if (state.cases.length === 0) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-masterwork-sealed-case="none"
      >
        This Rulebook holds no sealed cases yet, so there is nothing for this
        desk to work on.{" "}
        {state.rulebookId ? (
          <Link
            href={`/masterwork/${state.rulebookId}/sources?intake=timeline`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Add a case and mark it held-out
          </Link>
        ) : null}
      </p>
    );
  }

  return (
    <div className="space-y-1" data-masterwork-sealed-case="picker">
      <Label
        htmlFor="masterwork-sealed-case"
        className="flex items-center gap-1.5 text-xs font-medium text-foreground"
      >
        <FileLock2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        Which sealed case should it work?
      </Label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger id="masterwork-sealed-case">
          <SelectValue placeholder="Choose a case it has never seen…" />
        </SelectTrigger>
        <SelectContent>
          {state.cases.map((sealed) => (
            <SelectItem key={sealed.id} value={sealed.id}>
              {sealed.label}
              {sealed.published ? ` · ${sealed.published}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">
        The desk starts with the opening facts only. It has to ask for the rest,
        and you will see every question it asks.{" "}
        {state.rulebookId ? (
          <Link
            href={`/masterwork/${state.rulebookId}/sources?intake=timeline`}
            className="text-primary underline-offset-2 hover:underline"
          >
            Add another case
          </Link>
        ) : null}
      </p>
    </div>
  );
}
