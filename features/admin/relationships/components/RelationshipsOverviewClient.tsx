"use client";

// features/admin/relationships/components/RelationshipsOverviewClient.tsx
//
// Overview tab of the Relationships hub: system status tiles, the global
// controls (Rebuild cache, Enforcement switch), the unified drift report,
// and the direction legend. Rule CRUD lives on the Rules tab; drift actions
// that need another tab navigate there with a consume-once query param.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, LockOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProblemsPanel } from "./ProblemsPanel";
import { StatusTile } from "./shared";
import { label } from "../utils";
import type {
  RelationshipProblem,
  RelationshipSystemStatus,
} from "../types";

interface Props {
  status: RelationshipSystemStatus | null;
  problems: RelationshipProblem[];
}

export function RelationshipsOverviewClient({ status, problems }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [, startTransition] = useTransition();

  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [confirmEnforce, setConfirmEnforce] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warningCount = problems.filter((p) => p.severity === "warning").length;
  const problemCount = problems.length;
  const unregisteredCount = problems.filter(
    (p) => p.kind === "unregistered_pair",
  ).length;

  async function registerKnown(
    source: string,
    target: string,
    ruleLabel: string | null,
  ) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_upsert_relationship_rule", {
        p_source_type: source,
        p_target_type: target,
        p_label: ruleLabel ?? undefined,
        p_container_side: "none",
        p_conveys_max: "editor",
        p_is_active: true,
        p_notes: "Registered as known from the Relationship Manager",
      });
      if (error) throw error;
      toast.success(`Registered ${label(source)} → ${label(target)} as known`);
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't register: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function rebuildCache() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_rebuild_reachability");
      if (error) throw error;
      toast.success(`Cache rebuilt — ${data ?? 0} closure rows`);
      refresh();
    } catch (e) {
      toast.error(
        `Rebuild failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
      setConfirmRebuild(false);
    }
  }

  async function setEnforcement(enabled: boolean) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc(
        "admin_set_association_enforcement",
        { p_enabled: enabled },
      );
      if (error) throw error;
      toast.success(
        enabled
          ? "Enforcement ON — unregistered edge shapes are now rejected at write time"
          : "Enforcement OFF — any edge shape can be written",
      );
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't toggle enforcement: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
      setConfirmEnforce(null);
    }
  }

  const enforcementOn = status?.enforcement_enabled ?? false;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status + global controls */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusTile label="Rules" value={status?.total_rules ?? 0} />
        <StatusTile
          label="Conveying"
          value={status?.rules_conveying ?? 0}
          accent
        />
        <StatusTile label="Closure rows" value={status?.closure_rows ?? 0} />
        <StatusTile label="Max depth" value={status?.max_depth ?? 0} />
        <StatusTile
          label="Problems"
          value={problemCount}
          tone={errorCount > 0 ? "danger" : warningCount > 0 ? "warn" : "ok"}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmRebuild(true)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Rebuild cache
          </Button>
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
            {enforcementOn ? (
              <Lock className="h-3.5 w-3.5 text-primary" />
            ) : (
              <LockOpen className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-xs font-medium">Enforcement</span>
            <Switch
              checked={enforcementOn}
              disabled={busy || (!enforcementOn && unregisteredCount > 0)}
              onCheckedChange={(v) => setConfirmEnforce(v)}
              title={
                !enforcementOn && unregisteredCount > 0
                  ? "Cannot enable while unregistered pairs exist"
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {/* Unified drift / problems report */}
      <ProblemsPanel
        problems={problems}
        errorCount={errorCount}
        warningCount={warningCount}
        busy={busy}
        onRegister={registerKnown}
        onRegisterShareable={(token) =>
          startTransition(() =>
            router.push(
              `/administration/relationships/sharing?register=${encodeURIComponent(token)}`,
            ),
          )
        }
        onEdit={(source, target, lbl) =>
          startTransition(() =>
            router.push(
              `/administration/relationships/rules?edit=${encodeURIComponent(`${source}:${target}:${lbl ?? ""}`)}`,
            ),
          )
        }
      />

      {/* Direction legend — compact, high-contrast (not a novel) */}
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 text-xs font-semibold text-foreground">
                SMALL → LARGE
              </TableHead>
              <TableHead className="h-8 text-xs font-semibold text-foreground">
                Conveys?
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-transparent">
              <TableCell className="py-2 text-sm text-foreground">
                Source → Target
              </TableCell>
              <TableCell className="py-2 text-sm text-foreground">
                If you get access to the big thing, do you get the small thing?
              </TableCell>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableCell className="py-2 text-sm text-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-mono text-xs">(task)</span>
                  <ArrowRight className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono text-xs">(project)</span>
                </span>
              </TableCell>
              <TableCell className="py-2 text-sm text-foreground">
                <span className="font-medium">Yes</span>
                <span className="text-muted-foreground">
                  {" "}
                  — if I share my project, you see the tasks inside
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Guards */}
      <ConfirmDialog
        open={confirmRebuild}
        onOpenChange={setConfirmRebuild}
        title="Rebuild the reachability cache?"
        description="Always safe — the cache is disposable and is fully re-derived from the association tuples."
        confirmLabel="Rebuild"
        busy={busy}
        onConfirm={rebuildCache}
      />
      <ConfirmDialog
        open={confirmEnforce !== null}
        onOpenChange={(o) => !o && setConfirmEnforce(null)}
        title={
          confirmEnforce
            ? "Enable relationship enforcement?"
            : "Disable relationship enforcement?"
        }
        description={
          confirmEnforce
            ? "Any association whose (source, target, label) shape is not registered and active will be rejected at write time."
            : "Unregistered edge shapes will be accepted again."
        }
        confirmLabel={confirmEnforce ? "Enable" : "Disable"}
        variant={confirmEnforce ? "default" : "destructive"}
        busy={busy}
        onConfirm={() => setEnforcement(confirmEnforce === true)}
      />
    </div>
  );
}
