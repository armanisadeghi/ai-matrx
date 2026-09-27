"use client";

// features/unified-data/cutover/ScopesWriterSwitch.tsx — WHERE AN ORGANIZATION'S SCOPES ARE WRITTEN,
// and the platform admin's one-organization test press (lane SCOPES-WRITE-THROUGH).
//
// The "Scope and context screens" switch (seam scopes_screens) is pressed for every organization at
// once by the final switch (Arman, 2026-09-27: no organization-by-organization pressing). This is the
// one place a platform admin, in the admin console, switches ONE organization to test it: it rides the
// same door, readiness and log as every press (platform.cutover_seam_press), and the database refuses
// it anywhere but the admin lane. Compact on purpose: it lives in the console's existing header bar.

import React from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { pressSeam, readSeamBoard, type Seam, type SeamState } from "./seamSwitches";

const SEAM = "scopes_screens";

export function ScopesWriterSwitch({ organizationId }: { organizationId: string }) {
  const [seam, setSeam] = React.useState<Seam | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<SeamState | null>(null);
  const [pressing, setPressing] = React.useState(false);
  const [said, setSaid] = React.useState<{ ok: boolean; says: string } | null>(null);

  const [generation, setGeneration] = React.useState(0);
  const load = React.useCallback(() => setGeneration((g) => g + 1), []);

  React.useEffect(() => {
    let current = true;
    readSeamBoard(organizationId).then(
      (board) => {
        if (!current) return;
        setSeam(board.seams.find((s) => s.key === SEAM) ?? null);
        setProblem(null);
      },
      (e: unknown) => {
        if (current) setProblem(e instanceof Error ? e.message : "The switch could not be read.");
      },
    );
    return () => {
      current = false;
    };
  }, [organizationId, generation]);

  if (problem) {
    return (
      <span className="text-xs text-destructive" data-testid="scopes-writer-problem">
        {problem} <ErrorAlchemyMenu error={problem} />
      </span>
    );
  }
  if (!seam) return null;

  const notReady = seam.state === "old" && !seam.ready
    ? seam.checks.filter((c) => !c.met).map((c) => `${c.says}: ${c.detail ?? ""}`.trim())
    : [];

  const press = async (to: SeamState) => {
    setPressing(true);
    const answer = await pressSeam({
      organizationId,
      seamKey: SEAM,
      to,
      note: "tested from the admin scope console",
    });
    setPressing(false);
    setPending(null);
    setSaid({ ok: answer.ok, says: answer.says });
    load();
  };

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs" data-testid="scopes-writer-switch">
      <span className="whitespace-nowrap text-muted-foreground">Scopes written in</span>
      <Badge variant={seam.state === "new" ? "default" : "secondary"} className="whitespace-nowrap">
        {seam.state === "new" ? "Record store" : "Old tables"}
      </Badge>
      {seam.mayFlip && (
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setPending("new")} disabled={pressing}>
          Switch to the record store
        </Button>
      )}
      {seam.mayReverse && (
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setPending("old")} disabled={pressing}>
          Switch back
        </Button>
      )}
      {notReady.length > 0 && (
        <span className="min-w-0 max-w-[32rem] truncate text-muted-foreground" title={notReady.join("\n")}>
          Not ready: {notReady[0]}
        </span>
      )}
      {said?.ok && (
        <span className="min-w-0 max-w-[24rem] truncate text-emerald-700 dark:text-emerald-400" title={said.says}>
          {said.says}
        </span>
      )}
      {said && !said.ok && (
        <span className="min-w-0 max-w-[24rem] truncate text-destructive" title={said.says}>
          {said.says} <ErrorAlchemyMenu error={said.says} />
        </span>
      )}
      <ConfirmDialog
        open={pending != null}
        onOpenChange={(open) => {
          if (!open && !pressing) setPending(null);
        }}
        title={pending === "new" ? "Write this organization's scopes in the record store?" : "Write this organization's scopes in the old tables again?"}
        description={
          pending === "new"
            ? `${seam.flipDoes} This switches one organization only, to test it; every organization switches together in the final switch.`
            : `${seam.reverseDoes}`
        }
        confirmLabel={pending === "new" ? "Switch to the record store" : "Switch back"}
        busy={pressing}
        onConfirm={() => {
          if (pending) void press(pending);
        }}
      />
      {pressing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
