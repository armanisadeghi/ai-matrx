"use client";

/**
 * features/administration/canonicalization/components/VerifyCanonicalPanel.tsx
 *
 * Per-table gate from the §5d flip loop:
 *   iam.verify_canonical / verify_canonical_ok — full checklist + floor gate.
 *   iam.canonical_certify / canonical_certify_ok — blocking rows (FAIL/WARN +
 *     currently-broken dependent fns); empty = perfect, the loop's "done"
 *     gate.
 *
 * Deep-linked from Summary/Findings with schema+table+token already known —
 * fetches and shows results immediately (no manual "Run" click needed), and
 * re-fetches whenever the user jumps here again with a different table
 * while this page stays mounted.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldQuestion, Wand2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { GateStatusBadge } from "./StatusBadge";
import { RLS_VARIANTS } from "../utils/queryBuilders";
import type { CanonicalCertifyRow, VerifyCanonicalRow } from "../types";
import { errorMessageFrom, readJsonObject } from "../utils/apiClient";

interface VerifyResult {
  checks: VerifyCanonicalRow[];
  verifyOk: boolean;
  certifyBlocking: CanonicalCertifyRow[];
  certifyOk: boolean;
}

function isVerifyCanonicalRow(v: unknown): v is VerifyCanonicalRow {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).check_name === "string" &&
    typeof (v as Record<string, unknown>).status === "string"
  );
}

function isCanonicalCertifyRow(v: unknown): v is CanonicalCertifyRow {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).category === "string" &&
    typeof (v as Record<string, unknown>).status === "string"
  );
}

function isVerifyResult(v: unknown): v is VerifyResult {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    Array.isArray(r.checks) &&
    r.checks.every(isVerifyCanonicalRow) &&
    typeof r.verifyOk === "boolean" &&
    Array.isArray(r.certifyBlocking) &&
    r.certifyBlocking.every(isCanonicalCertifyRow) &&
    typeof r.certifyOk === "boolean"
  );
}

interface VerifyTarget {
  schema: string;
  table: string;
  token: string;
}

function GateChip({
  ok,
  okLabel,
  notOkLabel,
}: {
  ok: boolean | null;
  okLabel: string;
  notOkLabel: string;
}) {
  if (ok == null) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2.5 text-xs text-muted-foreground">
        <ShieldQuestion className="h-3.5 w-3.5" />
        Not run
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium",
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {ok ? okLabel : notOkLabel}
    </span>
  );
}

const checklistColumns: AuditColumnDef<VerifyCanonicalRow>[] = [
  {
    key: "check_name",
    label: "Check",
    type: "text",
    getValue: (r) => r.check_name,
    width: "200px",
    monospace: true,
  },
  {
    key: "status",
    label: "Status",
    type: "enum",
    getValue: (r) => r.status,
    width: "90px",
    render: (r) => <GateStatusBadge status={r.status} />,
  },
  {
    key: "detail",
    label: "Detail",
    type: "text",
    getValue: (r) => r.detail,
    width: "minmax(220px, 1fr)",
    copyable: true,
    noValueList: true,
  },
];

const blockingColumns: AuditColumnDef<CanonicalCertifyRow>[] = [
  {
    key: "category",
    label: "Category",
    type: "text",
    getValue: (r) => r.category,
    width: "200px",
    monospace: true,
  },
  {
    key: "status",
    label: "Status",
    type: "enum",
    getValue: (r) => r.status,
    width: "90px",
    render: (r) => <GateStatusBadge status={r.status} />,
  },
  {
    key: "detail",
    label: "Detail",
    type: "text",
    getValue: (r) => r.detail,
    width: "minmax(220px, 1fr)",
    copyable: true,
    noValueList: true,
  },
];

export function VerifyCanonicalPanel() {
  const searchParams = useSearchParams();
  const [schema, setSchema] = useState(searchParams.get("schema") ?? "");
  const [table, setTable] = useState(searchParams.get("table") ?? "");
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [variant, setVariant] = useState<string>("auto");
  const [autofilling, setAutofilling] = useState(false);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const autofillToken = useCallback(async () => {
    if (!schema || !table) {
      toast.error("Enter schema and table first");
      return;
    }
    setAutofilling(true);
    try {
      const res = await fetch(
        `/api/admin/canonicalization/verify?schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`,
      );
      const data = await readJsonObject(res);
      if (!res.ok) throw new Error(errorMessageFrom(data, res));
      if (typeof data.token === "string" && data.token) {
        setToken(data.token);
        toast.success(`Token: ${data.token}`);
      } else {
        toast.warning("No registered token found for that schema.table");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setAutofilling(false);
    }
  }, [schema, table]);

  const runVerify = useCallback(
    async (override?: VerifyTarget) => {
      const target = override ?? { schema, table, token };
      if (!target.schema || !target.table || !target.token) {
        toast.error("Schema, table, and token are all required");
        return;
      }
      setRunning(true);
      setHasRun(true);
      try {
        const res = await fetch("/api/admin/canonicalization/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: target.schema,
            table: target.table,
            token: target.token,
            variant: variant === "auto" ? undefined : variant,
          }),
        });
        const data = await readJsonObject(res);
        if (!res.ok) throw new Error(errorMessageFrom(data, res));
        if (!isVerifyResult(data)) throw new Error("Unexpected verify response shape");
        setResult(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        setResult(null);
      } finally {
        setRunning(false);
      }
    },
    [schema, table, token, variant],
  );

  useEffect(() => {
    const s = searchParams.get("schema");
    const t = searchParams.get("table");
    const tok = searchParams.get("token");
    if (s && t && tok) {
      setSchema(s);
      setTable(t);
      setToken(tok);
      void runVerify({ schema: s, table: t, token: tok });
    }
    // Re-run only when the deep-link params themselves actually change
    // (e.g. clicking a different Summary row while this page stays
    // mounted) — not on every keystroke of a manual edit below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("schema"), searchParams.get("table"), searchParams.get("token")]);

  const failCount = useMemo(
    () =>
      result?.checks.filter((c) => c.status?.toUpperCase() === "FAIL").length ??
      0,
    [result],
  );
  const warnCount = useMemo(
    () =>
      result?.checks.filter((c) => c.status?.toUpperCase() === "WARN").length ??
      0,
    [result],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Schema</span>
          <Input
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            placeholder="public"
            className="h-8 w-28 text-base"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Table</span>
          <Input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="notes"
            className="h-8 w-36 text-base"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Token</span>
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="note"
            className="h-8 w-32 text-base"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="Autofill token from platform.entity_types"
            onClick={() => void autofillToken()}
            disabled={autofilling}
          >
            {autofilling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <Select value={variant} onValueChange={setVariant}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            {RLS_VARIANTS.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8" onClick={() => void runVerify()} disabled={running}>
          {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Run
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <GateChip
            ok={hasRun ? (result?.verifyOk ?? null) : null}
            okLabel="Gate OK"
            notOkLabel={`${failCount} FAIL · ${warnCount} WARN`}
          />
          <GateChip
            ok={hasRun ? (result?.certifyOk ?? null) : null}
            okLabel="Certify OK"
            notOkLabel={`${result?.certifyBlocking.length ?? 0} blocking`}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-2">
        {!hasRun ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Enter a schema, table, and token above, then click Run.
          </div>
        ) : (
          <div className="grid h-full min-h-0 grid-cols-1 gap-2 xl:grid-cols-2">
            <div className="min-h-0">
              <AdminAuditTable
                rows={result?.checks ?? []}
                columns={checklistColumns}
                loading={running}
                csvFilename="canonicalization-verify-checklist.csv"
                defaultSort={{ key: "status", dir: "asc" }}
                emptyMessage="No checks returned."
                toolbarExtra={
                  <Badge variant="outline" className="h-6 shrink-0 whitespace-nowrap text-[10px]">
                    Checklist · {result?.checks.length ?? 0}
                  </Badge>
                }
              />
            </div>
            <div className="min-h-0">
              <AdminAuditTable
                rows={result?.certifyBlocking ?? []}
                columns={blockingColumns}
                loading={running}
                csvFilename="canonicalization-verify-blocking.csv"
                emptyMessage="Empty — perfect. Nothing is blocking certification."
                toolbarExtra={
                  <Badge variant="outline" className="h-6 shrink-0 whitespace-nowrap text-[10px]">
                    Blocking · {result?.certifyBlocking.length ?? 0}
                  </Badge>
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
