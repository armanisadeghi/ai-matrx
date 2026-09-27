"use client";

// features/administration/final-switch/FinalSwitchScreen.tsx — THE FINAL SWITCH (lane FINAL-SWITCH).
//
// One press, for every organization at once, and one undo. The page shows every organization that
// still has anything old — its tables and pick lists, what copying again would clear, what it cannot
// clear (named, so a person fixes it first), whether its agents read the new copy of its scopes and
// how many scope edits wait for it — plus the platform's own checks and the last rehearsal on the
// dev clone. The press is present only while the switch is off; it is disabled with the database's
// own sentence until everything is green. The undo is present only after a press. Nothing here
// decides: the readiness answer and the press's refusals are the database's (finalSwitch.ts).

import React from "react";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  Loader2,
  Power,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AdminPageCapture } from "@/components/agent-copy/page-capture/AdminPageCapture";
import { usePageCaptureContribution } from "@/components/agent-copy/page-capture/usePageCapture";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import {
  organizationOrder,
  pressFinalSwitch,
  readFinalSwitch,
  undoFinalSwitch,
  type FinalSwitchBoard,
  type FinalSwitchOrganization,
  type FinalSwitchProgress,
} from "./finalSwitch";
import lastRehearsal from "./last-rehearsal.json";

type Rehearsal = {
  date: string;
  clone_ref: string;
  summary: string;
  steps: { step: string; result: string; ms?: number | null }[];
  measured: { label: string; value: string }[];
  refusals: { what: string; owner: string }[];
};

const REHEARSAL = lastRehearsal as Rehearsal;

function when(at: string | null | undefined): string {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? at
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function StateBadge({ state }: { state: "old" | "new" }) {
  return (
    <Badge
      variant={state === "new" ? "default" : "secondary"}
      className="whitespace-nowrap"
    >
      {state === "new" ? "New system" : "Old system"}
    </Badge>
  );
}

function OrganizationRow({ org }: { org: FinalSwitchOrganization }) {
  const blocked = org.cannot_clear.length > 0;
  return (
    <tr
      className="border-t border-border align-top"
      data-testid="final-switch-org-row"
    >
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          {blocked ? (
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 text-destructive"
              aria-label="Blocked"
            />
          ) : org.needs_copy_again ? (
            <CircleDashed
              className="h-3.5 w-3.5 shrink-0 text-amber-600"
              aria-label="Copying again clears it"
            />
          ) : (
            <Check
              className="h-3.5 w-3.5 shrink-0 text-emerald-600"
              aria-label="Ready"
            />
          )}
          <a
            className="font-medium hover:underline"
            href={`/organizations/${org.id}/settings#data`}
            target="_blank"
            rel="noreferrer"
          >
            {org.name}
          </a>
          {org.archived && (
            <span className="text-xs text-muted-foreground">(archived)</span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <StateBadge state={org.tables.state} />
          <span>{org.tables.live} live older</span>
        </div>
        {org.tables.copied && (
          <div className="text-muted-foreground">{org.tables.copied}</div>
        )}
      </td>
      <td className="px-2 py-1.5 text-xs">
        <span>{org.lists.live} live older</span>
        {org.lists.copied && org.lists.live > 0 && (
          <div className="text-muted-foreground">{org.lists.copied}</div>
        )}
      </td>
      <td className="px-2 py-1.5 text-xs">
        {org.rerun_clears.length === 0 ? (
          <span className="text-muted-foreground">Nothing</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {org.rerun_clears.map((d) => (
              <li key={d.key} title={d.detail ?? undefined}>
                {d.says} ({d.clears})
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-2 py-1.5 text-xs">
        {org.cannot_clear.length === 0 ? (
          <span className="text-muted-foreground">Nothing</span>
        ) : (
          <ul className="flex flex-col gap-1 text-destructive">
            {org.cannot_clear.map((d) => (
              <li key={`${d.switch}-${d.key}`}>
                <span className="font-medium">{d.says}.</span> {d.detail}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-2 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <StateBadge state={org.scopes.state} />
          <span>{org.scopes.types} scope types</span>
        </div>
        {org.scopes.parity && (
          <div className="text-muted-foreground">{org.scopes.parity}</div>
        )}
      </td>
      <td
        className={`px-2 py-1.5 text-right text-xs tabular-nums ${org.follow_lag > 0 ? "text-destructive" : ""}`}
      >
        {org.follow_lag}
      </td>
    </tr>
  );
}

export function FinalSwitchScreen() {
  const dispatch = useAppDispatch();
  const [board, setBoard] = React.useState<FinalSwitchBoard | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [confirm, setConfirm] = React.useState<"press" | "undo" | null>(null);
  const [leaveBehind, setLeaveBehind] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<FinalSwitchProgress[]>([]);
  const [answer, setAnswer] = React.useState<{
    ok: boolean;
    says: string;
  } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBoard(await readFinalSwitch());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  usePageCaptureContribution(
    "final-switch",
    () =>
      board
        ? [
            {
              id: "final-switch-state",
              title: "The final switch",
              role: "data",
              value: {
                state: board.state,
                says: board.says,
                lastRun: board.lastRun,
                totals: board.totals,
              },
            },
            {
              id: "final-switch-platform",
              title: "Platform checks",
              role: "data",
              value: board.platform,
            },
            {
              id: "final-switch-blocking",
              title: "What must be fixed first",
              role: "data",
              value: board.blocking,
            },
            {
              id: "final-switch-organizations",
              title: "Every organization's readiness",
              role: "data",
              value: board.organizations,
            },
            {
              id: "final-switch-undo",
              title: "What the undo would carry back",
              role: "data",
              value: board.undo,
            },
            {
              id: "final-switch-rehearsal",
              title: "The last rehearsal on the dev clone",
              role: "data",
              value: REHEARSAL,
            },
            {
              id: "final-switch-run",
              title: "This page's run",
              role: "request",
              value: { progress, answer },
            },
          ]
        : [
            {
              id: "final-switch-error",
              title: "Load error",
              role: "request",
              value: error,
            },
          ],
    `${board?.checkedAt ?? ""}|${progress.length}|${answer?.says ?? ""}|${error ?? ""}`,
  );

  const orgs = [...(board?.organizations ?? [])].sort(
    (a, b) =>
      organizationOrder(a) - organizationOrder(b) ||
      a.name.localeCompare(b.name),
  );
  const toSwitch = orgs.filter(
    (o) =>
      o.plan.press_tables ||
      o.plan.press_context ||
      o.plan.sweep_lists + o.plan.sweep_tables > 0,
  );

  const run = async (which: "press" | "undo") => {
    setRunning(true);
    setProgress([]);
    setAnswer(null);
    const onProgress = (p: FinalSwitchProgress) =>
      setProgress((prev) => [...prev.slice(-199), p]);
    const out =
      which === "press"
        ? await pressFinalSwitch(dispatch, null, onProgress)
        : await undoFinalSwitch(dispatch, leaveBehind, onProgress);
    setAnswer({ ok: out.ok, says: out.says });
    if (out.ok) toast.success(out.says);
    else toast.error(out.says);
    setRunning(false);
    setConfirm(null);
    setLeaveBehind(false);
    await load();
  };

  const undoNeedsConfirm = Boolean(board?.undo?.needs_confirm);
  const pressDisabledWhy = !board
    ? null
    : board.state === "new"
      ? null
      : board.ready || board.readyAfterCopyAgain
        ? null
        : board.says;

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 pb-16 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Power className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">Final switch</h1>
          {board && <StateBadge state={board.state} />}
          <span className="text-xs text-muted-foreground">
            Every organization at once, and one undo
          </span>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void load()}
            disabled={loading || running}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="ml-1 text-xs">Check again</span>
          </Button>
          <AdminPageCapture
            title="Final switch"
            route="/administration/database/final-switch"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
            <span className="flex-1">{error}</span>
            <ErrorAlchemyMenu
              error={error}
              operation="Reading the final switch"
            />
          </div>
        )}

        {loading && !board && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Measuring every
            organization's readiness…
          </div>
        )}

        {board && (
          <>
            <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
              <p className="text-sm font-medium">{board.says}</p>
              <p className="text-xs text-muted-foreground">
                {board.totals.organizations} organizations measured{" "}
                {when(board.checkedAt)} · {board.totals.ready} ready ·{" "}
                {board.totals.need_copy_again} need copying again ·{" "}
                {board.totals.blocked} blocked
                {board.lastRun &&
                  ` · last run ${board.lastRun.direction === "new" ? "pressed" : "undone"} ${when(board.lastRun.at)}${board.lastRun.by ? ` by ${board.lastRun.by}` : ""}`}
              </p>
              {board.state === "old" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setConfirm("press")}
                    disabled={running || pressDisabledWhy !== null}
                    data-testid="final-switch-press"
                  >
                    {running ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Power className="mr-1 h-3.5 w-3.5" />
                    )}
                    Switch everything to the new system
                  </Button>
                  {pressDisabledWhy && (
                    <span
                      className="text-xs text-destructive"
                      data-testid="final-switch-press-why"
                    >
                      {board.blocking.length > 0
                        ? `Off until the ${board.blocking.length === 1 ? "thing" : `${board.blocking.length} things`} below ${board.blocking.length === 1 ? "is" : "are"} fixed.`
                        : pressDisabledWhy}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirm("undo")}
                    disabled={running}
                    data-testid="final-switch-undo"
                  >
                    {running ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Undo2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    Undo the final switch
                  </Button>
                  {board.lastRun?.says && (
                    <span className="text-xs text-muted-foreground">
                      {board.lastRun.says}
                    </span>
                  )}
                </div>
              )}
              {(progress.length > 0 || answer) && (
                <div
                  className="flex flex-col gap-0.5 rounded border border-border bg-muted/40 p-2 text-xs"
                  data-testid="final-switch-progress"
                >
                  {progress.slice(-12).map((p, i) => (
                    <span
                      key={i}
                      className={
                        p.kind === "stage"
                          ? "font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {p.says}
                    </span>
                  ))}
                  {answer && (
                    <span
                      className={
                        answer.ok
                          ? "font-medium text-emerald-700 dark:text-emerald-400"
                          : "font-medium text-destructive"
                      }
                    >
                      {answer.says}
                    </span>
                  )}
                </div>
              )}
            </section>

            {board.blocking.length > 0 && (
              <section className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-medium">
                  Fix these first — copying again cannot
                </p>
                <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs">
                  {board.blocking.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                The platform
              </p>
              <ul className="flex flex-col gap-1">
                {board.platform.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-xs">
                    {c.met ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                    <span>
                      <span className="font-medium">{c.says}.</span> {c.detail}
                      {!c.met && c.fix && (
                        <span className="text-muted-foreground">
                          {" "}
                          What to do: {c.fix}
                        </span>
                      )}
                      {c.measured_at && (
                        <span className="text-muted-foreground">
                          {" "}
                          (measured {when(c.measured_at)})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Every organization with anything old ({toSwitch.length} switch
                at the press)
              </p>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Organization</th>
                      <th className="px-2 py-1.5 font-medium">Data tables</th>
                      <th className="px-2 py-1.5 font-medium">Pick lists</th>
                      <th className="px-2 py-1.5 font-medium">
                        Copying again clears
                      </th>
                      <th className="px-2 py-1.5 font-medium">
                        Cannot be cleared by copying
                      </th>
                      <th className="px-2 py-1.5 font-medium">Scopes</th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        Edits waiting
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((o) => (
                      <OrganizationRow key={o.id} org={o} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <section
          className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-3"
          data-testid="final-switch-rehearsal"
        >
          <p className="text-xs font-medium text-muted-foreground">
            Last rehearsal on the dev clone · {when(REHEARSAL.date)} · clone{" "}
            {REHEARSAL.clone_ref}
          </p>
          <p className="text-sm">{REHEARSAL.summary}</p>
          <ul className="flex flex-col gap-0.5 text-xs">
            {REHEARSAL.steps.map((s) => (
              <li key={s.step}>
                <span className="font-medium">{s.step}:</span> {s.result}
                {typeof s.ms === "number" && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({(s.ms / 1000).toFixed(1)} s)
                  </span>
                )}
              </li>
            ))}
          </ul>
          {REHEARSAL.measured.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {REHEARSAL.measured.map((m) => (
                <li key={m.label}>
                  {m.label}: <span className="text-foreground">{m.value}</span>
                </li>
              ))}
            </ul>
          )}
          {REHEARSAL.refusals.length > 0 && (
            <div className="flex flex-col gap-0.5 text-xs">
              <p className="font-medium">
                What the rehearsal was refused on, and who fixes it
              </p>
              <ul className="flex list-disc flex-col gap-0.5 pl-5">
                {REHEARSAL.refusals.map((r) => (
                  <li key={r.what}>
                    {r.what}{" "}
                    <span className="text-muted-foreground">— {r.owner}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <ConfirmDialog
          open={confirm != null}
          onOpenChange={(open) => {
            if (!open && !running) {
              setConfirm(null);
              setLeaveBehind(false);
            }
          }}
          title={
            confirm === "press"
              ? "Switch every organization to the new system?"
              : "Undo the final switch for every organization?"
          }
          description={
            confirm === "press"
              ? `This switches ${toSwitch.length} organizations at once: their older tables and pick lists are archived with pointers to their copies (never deleted), "when a row changes" automations follow their tables, agents read the new copy of every organization's scopes, the Data page and the scope screens open the new pages for everyone, and the older write doors are closed to browsers. The older tables are copied again first where that clears a difference. One undo on this page reverses all of it.`
              : "Every organization goes back to its older tables in the same order backwards. Each one's Switch back carries what was written in the new system since the press into its older tables; the older write doors open again, the Data page and the scope screens go back."
          }
          content={
            confirm === "undo" && board?.undo ? (
              <div className="flex flex-col gap-2 text-sm">
                {board.undo.plan.some((u) => (u.carries ?? []).length > 0) && (
                  <div className="flex flex-col gap-1">
                    <p className="font-medium">
                      What the undo carries from the new system
                    </p>
                    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      {board.undo.plan.flatMap((u) =>
                        (u.carries ?? []).map((line) => (
                          <li key={`${u.id}-${line}`}>
                            {u.name}: {line}
                          </li>
                        )),
                      )}
                    </ul>
                  </div>
                )}
                {undoNeedsConfirm && (
                  <div className="flex flex-col gap-1">
                    <p className="font-medium">What cannot be carried back</p>
                    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      {board.undo.plan.flatMap((u) =>
                        (u.not_carried ?? []).map((line) => (
                          <li key={`${u.id}-${line}`}>
                            {u.name}: {line}
                          </li>
                        )),
                      )}
                    </ul>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={leaveBehind}
                        onCheckedChange={(v) => setLeaveBehind(v === true)}
                        aria-label="Leave these in the new system and undo"
                      />
                      <span>Leave these in the new system and undo.</span>
                    </label>
                  </div>
                )}
              </div>
            ) : undefined
          }
          confirmLabel={
            confirm === "press" ? "Switch everything" : "Undo everything"
          }
          confirmDisabled={
            confirm === "undo" && undoNeedsConfirm && !leaveBehind
          }
          busy={running}
          onConfirm={() => void run(confirm === "press" ? "press" : "undo")}
        />
      </div>
    </div>
  );
}
