"use client";

// features/mandates/candidate-dialog/SetCandidateDialog.tsx
//
// SET A LIVE CANDIDATE (Mandate Candidates, PLAN §2.6 / P9 / P17 / P18).
// One dialog, three doors: the record's Candidates tab, "Try as candidate" on a
// graded impact row, and "Set as live candidate" on a test-bench result. It:
//   · reuses the ONE holder chooser (`HolderAssignment` — agent or workflow,
//     pinned version or latest; the bench's and the member Test tab's picker);
//   · names the rung it applies to — by default the rung whose holder actually
//     serves this mandate's runs for this person (the live holder's rung, V1
//     D18; a door that names its own rung keeps it), each rung with one label
//     for what it collects;
//   · asks how many runs (empty = the `mandates.candidate_default_runs` knob,
//     read through `platform.knob_resolve`; the server applies the same knob);
//   · shows the P17 forecast BEFORE confirming — which doors this job ran
//     through lately and how many of those runs could have fed a candidate;
//   · keeps a server refusal on screen, in place, with its reason (P9); and
//     says a refusal it can already see (a workflow on a chat-only job) before
//     the click.

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { HolderAssignment } from "@/features/bindings/HolderAssignment";
import { useMandateHolder } from "@ai-matrx/chat/mandates/useMandateHolder";
import type { HolderDraft } from "@/features/bindings/ScopeHolderBar";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  COVERED_DOORS,
  candidateFailureSentence,
  fetchLiveCandidates,
  setLiveCandidate,
  type CandidateRung,
  type LiveCandidate,
  type LiveCandidatesResponse,
} from "./api";
import {
  EMPTY_TARGET,
  RUNG_COLLECTS,
  RUNG_LABEL,
  doorLabel,
  liveRungOf,
  holderOfDraft,
  workflowRefusalOf,
  type CandidateRungChoice,
} from "./target";

export interface SetCandidateDialogProps {
  mandateKey: AnyMandateKey;
  /** The mandate's name as a person reads it (title). */
  mandateName: string;
  /** Pre-filled target (impact row, bench result). */
  initialTarget?: HolderDraft | null;
  /** The rung the person is viewing — the default until the live rung answers. */
  rung: CandidateRungChoice;
  /**
   * Default "Applies to" to the rung the live holder sits at (the record's
   * Candidates tab). Doors that already name a rung (an impact row) leave it off.
   */
  followLiveRung?: boolean;
  /** The mandate's declared output kind, for the workflow picker. */
  outputKind?: string | null;
  onClose: () => void;
  onSet?: (candidate: LiveCandidate) => void;
}

const RUNG_ORDER: readonly CandidateRung[] = ["global", "org", "user"];

export function SetCandidateDialog(props: SetCandidateDialogProps) {
  const isMobile = useIsMobile();
  const title = `Try a candidate for “${props.mandateName}”`;
  const description = "It runs beside the live one on the next real runs. Nothing changes until you promote it.";
  if (isMobile) {
    return (
      <Drawer open onOpenChange={(open) => (open ? undefined : props.onClose())}>
        <DrawerContent className="max-h-[92dvh] px-4 pb-safe">
          <DrawerHeader className="px-0">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto pb-3">
            <SetCandidateBody {...props} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <SetCandidateBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function SetCandidateBody({
  mandateKey,
  initialTarget,
  rung: seatRung,
  followLiveRung = false,
  outputKind = null,
  onClose,
  onSet,
}: SetCandidateDialogProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  // org-filter: server-call a candidate's default run count is read for the org the run executes in
  const activeOrgId = useAppSelector(selectOrganizationId);
  const [draft, setDraft] = useState<HolderDraft>(initialTarget ?? EMPTY_TARGET);
  // The live holder's rung for this person: where the runs a candidate would
  // collect are actually decided.
  const live = useMandateHolder(followLiveRung ? mandateKey : "");
  const liveRung = followLiveRung
    ? liveRungOf(live.holder?.provenance ?? null, live.holder?.organizationId ?? activeOrgId, userId)
    : null;
  // V2 D18 + FX-D1: the picker never names a level it does not KNOW is the
  // live one. While the read runs it shows the waiting state; when the read
  // cannot answer (no organization selected, the read failed, a verdict that
  // names no rung) it shows NO level and Start stays unavailable until the
  // person picks one themselves — their pick always wins. It used to fall back
  // to the seat's rung ("Personal") ~11 ms after open, and that guess could be
  // confirmed.
  const { pending: liveRungPending, rung: initialRung } = appliesToDefault({
    followLiveRung,
    liveLoading: live.loading,
    liveRung,
    seatRung,
  });
  const [picked, setRung] = useState<CandidateRungChoice | null>(null);
  const rung = picked ?? initialRung;
  const [runs, setRuns] = useState("");
  const [defaultRuns, setDefaultRuns] = useState<number | null>(null);
  const [state, setState] = useState<LiveCandidatesResponse | null>(null);
  const [readFailure, setReadFailure] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rungChoices = useMemo(
    () =>
      rungChoicesOf(
        initialRung ? [initialRung, seatRung] : [seatRung],
        activeOrgId,
        userId,
      ),
    [initialRung, seatRung, activeOrgId, userId],
  );

  useEffect(() => {
    let cancelled = false;
    fetchLiveCandidates(dispatch, mandateKey).then(
      (answer) => {
        if (!cancelled) setState(answer);
      },
      (error: unknown) => {
        if (!cancelled) setReadFailure(candidateFailureSentence(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dispatch, mandateKey]);

  // The default the server will apply when "runs" is left empty — the same knob.
  const knobOrg = rung?.rung === "org" ? rung.principalId : activeOrgId;
  useEffect(() => {
    let cancelled = false;
    // org-filter: server-call the default the server applies to a run, and a run executes in the active org
    void supabase
      .schema("platform")
      .rpc("knob_resolve", {
        p_feature: "mandates",
        p_key: "candidate_default_runs",
        p_organization_id: knobOrg as string,
        p_user_id: userId as string,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[mandate candidates] candidate_default_runs knob unread:", error.message);
          setDefaultRuns(null);
          return;
        }
        setDefaultRuns(typeof data === "number" ? data : Number(data) || null);
      });
    return () => {
      cancelled = true;
    };
  }, [knobOrg, userId]);

  const holder = holderOfDraft(draft);
  const knownRefusal = workflowRefusalOf(draft, state?.forecast ?? null);
  const runsNumber = runs.trim() ? Number(runs) : null;
  const runsInvalid =
    runsNumber !== null && (!Number.isInteger(runsNumber) || runsNumber < 1 || runsNumber > 50);
  const replaces = (state?.open ?? []).find(
    (c) =>
      rung !== null &&
      c.status === "collecting" &&
      c.rung === rung.rung &&
      (c.rung_principal_id ?? null) === (rung.principalId ?? null),
  );

  async function confirm() {
    if (!holder || !rung) return;
    setBusy(true);
    setRefusal(null);
    try {
      const candidate = await setLiveCandidate(dispatch, mandateKey, {
        rung: rung.rung,
        rung_principal_id: rung.principalId,
        ...holder,
        runs_wanted: runsNumber ?? undefined,
      });
      toast.success(
        candidate.replaced
          ? candidate.replaced.message
          : `Candidate set — ${candidate.counts.runs_wanted} runs to collect.`,
      );
      onSet?.(candidate);
      onClose();
    } catch (error: unknown) {
      // P9: the server's reason stays in place until the next try.
      setRefusal(candidateFailureSentence(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <HolderAssignment
        holder={draft}
        onHolderChange={(next) => {
          setDraft(next);
          setRefusal(null);
        }}
        mandateKey={mandateKey}
        outputKind={outputKind}
        agentTabs={{ visibleTabs: ["system", "mine", "shared", "all"], initialTab: "system" }}
        consumerId={`mandate-candidate-${mandateKey}`}
        refusal={refusal ?? knownRefusal}
        disabled={busy}
      />

      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center">
        <span className="type-secondary font-medium">Applies to</span>
        <Select
          value={liveRungPending || !rung ? "" : rungValue(rung)}
          onValueChange={(value) => {
            const found = rungChoices.find((c) => rungValue(c) === value);
            if (found) {
              setRung(found);
              setRefusal(null);
            }
          }}
          disabled={busy || liveRungPending}
        >
          <SelectTrigger className="w-full max-w-[22rem]" aria-label="Applies to" aria-busy={liveRungPending || undefined}>
            <SelectValue placeholder={liveRungPending ? "Finding the live level…" : "Pick a level"} />
          </SelectTrigger>
          <SelectContent>
            {rungChoices.map((choice) => (
              <SelectItem key={rungValue(choice)} value={rungValue(choice)}>
                {RUNG_LABEL[choice.rung]}
                {liveRung && sameRung(liveRung, choice) ? " · live" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="hidden sm:block" />
        <span data-error-box className="min-h-4 type-meta text-muted-foreground" data-candidate-rung-collects>
          {liveRungPending ? null : rung ? RUNG_COLLECTS[rung.rung] : "Couldn't read the live level"}
        <ErrorAlchemyMenu /></span>

        <label htmlFor="candidate-runs" className="text-[12px] font-medium">
          Runs to collect
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="candidate-runs"
            inputMode="numeric"
            className="w-24"
            value={runs}
            placeholder={defaultRuns ? String(defaultRuns) : "Default"}
            onChange={(event) => setRuns(event.target.value.replace(/[^0-9]/g, ""))}
            disabled={busy}
          />
          <span className="type-meta text-muted-foreground">
            {runsInvalid ? "1 to 50" : runs ? "" : "Default for this organization"}
          </span>
        </div>
      </div>

      <Forecast state={state} failure={readFailure} />

      {replaces ? (
        <p className="type-secondary text-amber-700 dark:text-amber-400">
          Replaces {replaces.holder_name} ({replaces.counts.runs_in ?? 0} of {replaces.counts.runs_wanted} in).
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="quiet" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          icon={busy ? <Loader2 className="animate-spin" /> : null}
          variant="primary"
          type="button"
          data-testid="set-candidate-confirm"
          disabled={!holder || !rung || busy || Boolean(knownRefusal) || runsInvalid || liveRungPending}
          onClick={() => void confirm()}
        >
          Start collecting
        </Button>
      </div>
    </div>
  );
}

/**
 * The level "Applies to" starts on. A door that names its own rung keeps it.
 * A door that follows the live rung starts on the live rung ONLY once it is
 * known: `pending` while the read runs, `rung: null` (no selection) when the
 * read could not answer — never the seat's rung as a guess.
 */
export function appliesToDefault(args: {
  followLiveRung: boolean;
  liveLoading: boolean;
  liveRung: CandidateRungChoice | null;
  seatRung: CandidateRungChoice;
}): { pending: boolean; rung: CandidateRungChoice | null } {
  if (!args.followLiveRung) return { pending: false, rung: args.seatRung };
  if (args.liveLoading) return { pending: true, rung: null };
  return { pending: false, rung: args.liveRung };
}

function sameRung(a: CandidateRungChoice, b: CandidateRungChoice): boolean {
  return a.rung === b.rung && (a.principalId ?? null) === (b.principalId ?? null);
}

function rungValue(choice: CandidateRungChoice): string {
  return `${choice.rung}:${choice.principalId ?? ""}`;
}

/**
 * The rungs this seat can name: the live one, the one it is viewing, Everyone,
 * the viewer's own, and the active organization's — each ONCE (V2 D18: the live
 * rung and the seat's rung were both pushed when they were the same, and two
 * items with one value rendered "PersonalPersonal"). The server decides rights.
 */
export function rungChoicesOf(
  first: readonly CandidateRungChoice[],
  activeOrgId: string | null | undefined,
  userId: string | null | undefined,
): CandidateRungChoice[] {
  const out: CandidateRungChoice[] = [];
  const add = (choice: CandidateRungChoice) => {
    if (!out.some((c) => c.rung === choice.rung)) out.push(choice);
  };
  first.forEach(add);
  add({ rung: "global", principalId: null });
  if (activeOrgId) add({ rung: "org", principalId: activeOrgId });
  if (userId) add({ rung: "user", principalId: userId });
  return out.sort((a, b) => RUNG_ORDER.indexOf(a.rung) - RUNG_ORDER.indexOf(b.rung));
}

/** P17 — the honest forecast: which doors ran lately, how many could feed it. */
function Forecast({
  state,
  failure,
}: {
  state: LiveCandidatesResponse | null;
  failure: string | null;
}) {
  if (failure) {
    return (
      <p className="type-secondary text-destructive">
        Forecast unavailable: {failure} <ErrorAlchemyMenu error={failure} />
      </p>
    );
  }
  if (!state) {
    return (
      <p className="flex items-center gap-1.5 type-secondary text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Reading recent runs
      </p>
    );
  }
  const forecast = state.forecast;
  const [eligible, recent] = forecast.eligible_of_recent ?? [0, 0];
  const doors = Object.entries(forecast.doors ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div data-testid="candidate-forecast" className="space-y-1.5 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 type-secondary">
        <span className="font-medium">Last {forecast.window_days} days</span>
        <span className={eligible === 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
          {recent === 0
            ? "No runs yet — it collects from the next real one"
            : `${eligible} of ${recent} runs could have fed it`}
        </span>
      </div>
      {doors.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {doors.map(([door, count]) => {
            const covered = COVERED_DOORS.includes(door);
            return (
              <Badge
                key={door}
                variant="outline"
                className={covered ? "text-[11px]" : "text-[11px] text-muted-foreground line-through"}
                title={covered ? undefined : "Not covered — these runs never feed a candidate."}
              >
                {doorLabel(door)} · {count}
              </Badge>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
