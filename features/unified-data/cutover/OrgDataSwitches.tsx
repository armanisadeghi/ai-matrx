"use client";

// OrgDataSwitches — the organization's "old system → new system" switches, on its settings page
// (the Data section). One row per seam: which side it is on, whether it is ready (measured now,
// by the database), what switching does, and the one control that applies — Switch to the new
// system when it is ready, Switch back when it is on the new side, nothing when neither applies.
// The rules live in platform.cutover_seams / platform.cutover_seam_press; this screen shows their
// answers as they are. Lane FLIP-SEAMS, 2026-09-25.

import React from "react";
import { Check, CircleDashed, Copy, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePageCaptureContribution } from "@/components/agent-copy/page-capture/usePageCapture";
import { useAppDispatch } from "@/lib/redux/hooks";
import { pressSeam, readSeamBoard, type Seam, type SeamBoard, type SeamState } from "./seamSwitches";
import { copyAgain, copyAgainClears } from "./copyAgain";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type Pending = { seam: Seam; to: SeamState } | null;

/** A sentence ends once: the door's words may already carry their own full stop. */
function sentence(words: string): string {
  return /[.!?…]$/.test(words.trim()) ? words : `${words}.`;
}

function whenText(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function OrgDataSwitches({ organizationId }: { organizationId: string }) {
  const [board, setBoard] = React.useState<SeamBoard | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState<Pending>(null);
  const [pressing, setPressing] = React.useState(false);
  const [outcome, setOutcome] = React.useState<{ seamKey: string; ok: boolean; says: string } | null>(null);
  const dispatch = useAppDispatch();
  // "Copy again" (lane COPY-AGAIN-DOOR): the mover's rerun from this page, then measured again.
  const [copying, setCopying] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<{ ok: boolean; says: string } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setBoard(await readSeamBoard(organizationId));
      setProblem(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // The alchemy capture (lane ALCHEMY-BUTTON): the switch board as shown, the problem, the last press.
  usePageCaptureContribution(
    "org-data-switches",
    () => [
      {
        id: "data-switches",
        title: "Old system to new system switches",
        role: "data",
        value: { board, problem, pending: pending ? { seam: pending.seam.key, to: pending.to } : null, outcome, copyAgain: copied },
        brief: problem ?? (board ? "Board loaded" : "Loading"),
      },
    ],
    `${board ? JSON.stringify(board).length : 0}|${problem}|${outcome?.says}|${pending?.seam.key}|${copied?.says}`,
  );

  const press = async () => {
    if (!pending) return;
    setPressing(true);
    const answer = await pressSeam({
      organizationId,
      seamKey: pending.seam.key,
      to: pending.to,
      note: pending.to === "new" ? "switched on the organization settings page" : "switched back on the organization settings page",
    });
    setOutcome({ seamKey: pending.seam.key, ok: answer.ok, says: answer.says });
    setPressing(false);
    setPending(null);
    await load();
  };

  const runCopyAgain = async () => {
    setCopied(null);
    setCopying("Starting…");
    const answer = await copyAgain(dispatch, { organizationId }, (p) => setCopying(p.says));
    setCopying(null);
    setCopied({ ok: answer.ok, says: answer.says });
    await load();
  };

  if (loading && !board) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking each switch…
      </div>
    );
  }
  if (problem && !board) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-destructive">{problem} <ErrorAlchemyMenu error={problem} /></p>
        <div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!board) return null;

  const pressable = board.seams.filter((s) => s.pressKind === "owner_press");
  // Offered only when the tables switch is on the old side and an unmet check has a difference copying
  // again clears (the readiness answer says so per check; the rest are named with what to do instead).
  const tables = board.seams.find((s) => s.key === "older_tables");
  const offerCopyAgain =
    board.mayPress &&
    tables?.state === "old" &&
    tables.checks.some(copyAgainClears);
  const elsewhere = board.seams.filter((s) => s.pressKind !== "owner_press");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Checked {whenText(board.checkedAt)}</span>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          Check again
        </Button>
        {(offerCopyAgain || copying) && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            onClick={() => void runCopyAgain()}
            disabled={copying != null || loading}
          >
            {copying ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1" />
            )}
            Copy again
          </Button>
        )}
        {!board.mayPress && <span>{board.mayPressDetail}</span>}
      </div>
      {copying && <p className="text-xs text-muted-foreground -mt-2">Copying the older tables again. {copying}</p>}
      {copied && !copying && (
        <p className={`text-xs -mt-2 ${copied.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
          {copied.says}
        </p>
      )}

      <ul className="flex flex-col divide-y rounded-lg border">
        {pressable.map((seam) => (
          <li key={seam.key} className="p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{seam.title}</h3>
                  <Badge className="shrink-0 whitespace-nowrap" variant={seam.state === "new" ? "default" : "secondary"}>
                    {seam.state === "new" ? "New system" : "Old system"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {seam.state === "new" ? seam.newSide : seam.oldSide}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {seam.mayFlip && (
                  <Button size="sm" onClick={() => setPending({ seam, to: "new" })}>
                    Switch to the new system
                  </Button>
                )}
                {seam.mayReverse && (
                  <Button size="sm" variant="outline" onClick={() => setPending({ seam, to: "old" })}>
                    Switch back
                  </Button>
                )}
              </div>
            </div>

            {seam.state === "new" && seam.switched ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Switched {whenText(seam.switched.at)}
                  {seam.switched.by ? ` by ${seam.switched.by}` : ""}. Switching back: {seam.reverseDoes}
                </p>
                {seam.reverseChecks
                  .filter((c) => !c.met)
                  .map((c) => (
                    <p key={c.key} className="flex items-start gap-2 text-xs">
                      <CircleDashed className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <span>
                        <span className="font-medium">Not ready to switch back: {sentence(c.says)}</span>{" "}
                        {c.detail && <span className="text-muted-foreground">{c.detail}</span>}
                      </span>
                    </p>
                  ))}
              </>
            ) : (
              <>
                <ul className="flex flex-col gap-1.5">
                  {seam.checks.map((c) => (
                    <li key={c.key} className="flex items-start gap-2 text-xs">
                      {c.met ? (
                        <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <CircleDashed className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      )}
                      <span>
                        <span className={c.met ? "" : "font-medium"}>{sentence(c.says)}</span>{" "}
                        {c.detail && <span className="text-muted-foreground">{c.detail}</span>}
                        {c.measured_at && (
                          <span className="block text-muted-foreground">
                            Last measured {whenText(c.measured_at)}; measured again with every release.
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {seam.ready ? "Ready. " : "Not ready yet. "}Switching: {seam.flipDoes}
                </p>
              </>
            )}

            {outcome?.seamKey === seam.key && (
              <p className={`text-xs ${outcome.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                {outcome.says}
              </p>
            )}
          </li>
        ))}
      </ul>

      {elsewhere.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Switched for everyone at once, not from here</p>
          <ul className="flex flex-col gap-1">
            {elsewhere.map((seam) => (
              <li key={seam.key} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-medium">{seam.title}</span>
                <span className="text-muted-foreground">
                  {seam.pressKind === "already_switched"
                    ? `On the new system. ${seam.flipDoes}`
                    : `On the old system. When it switches: ${seam.flipDoes}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={pending != null}
        onOpenChange={(open) => {
          if (!open && !pressing) setPending(null);
        }}
        title={
          pending
            ? pending.to === "new"
              ? `Switch "${pending.seam.title}" to the new system?`
              : `Switch "${pending.seam.title}" back to the old system?`
            : ""
        }
        description={
          pending
            ? pending.to === "new"
              ? `${pending.seam.flipDoes} You can switch back here at any time: ${pending.seam.reverseDoes}`
              : pending.seam.reverseDoes
            : ""
        }
        confirmLabel={pending?.to === "new" ? "Switch to the new system" : "Switch back"}
        busy={pressing}
        onConfirm={press}
      />
    </div>
  );
}
