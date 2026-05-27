"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  X,
  Cpu,
  Layers,
  Package,
  ShieldCheck,
  AlertCircle,
  Server,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import {
  listToolBindings,
  addToolBinding,
  updateToolBinding,
  removeToolBinding,
  listSurfacesIncludingTool,
  addToolToSurface,
  removeToolFromSurface,
  listToolBundleMemberships,
  parseGating,
  setToolGating,
  listAllUiSurfaceNames,
  listAllExecutorNames,
  type ToolBindingRow,
  type SurfaceInclusion,
  type BundleMembership,
  type ToolGateEntry,
} from "@/features/tool-registry/tools-admin/services/dimensions.service";

interface Props {
  toolId: string;
  toolName: string;
  initialGating: unknown;
}

export function RegistryTab({ toolId, toolName, initialGating }: Props) {
  return (
    <div className="space-y-8 max-w-5xl">
      <BindingsSection toolId={toolId} />
      <SurfacesSection toolId={toolId} />
      <BundlesSection toolId={toolId} />
      <GatingSection toolId={toolId} initialGating={initialGating} />
    </div>
  );
}

// ─── Section header primitive ────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  count,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-2">
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            {typeof count === "number" && (
              <Badge variant="outline" className="text-[10px]">
                {count}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
      <AlertCircle className="h-3.5 w-3.5" />
      {msg}
    </div>
  );
}

// ─── Bindings (was: Executors) ───────────────────────────────────────────────
//
// Post-2026 tool-system refactor: bindings are a pure (tool_id, executor_name)
// join with just `is_active`. The dispatcher applies a single code-level
// policy (client > MCP > server) — no per-binding priority or auto-load
// flags. Adding a binding declares the tool runnable on that executor;
// presence = capability.

function BindingsSection({ toolId }: { toolId: string }) {
  const [rows, setRows] = useState<ToolBindingRow[]>([]);
  const [executors, setExecutors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingExecutor, setPendingExecutor] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, e] = await Promise.all([
        listToolBindings(toolId),
        listAllExecutorNames(),
      ]);
      setRows(r);
      setExecutors(e);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bindings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [toolId]);

  const availableExecutors = executors.filter(
    (e) => !rows.some((r) => r.executor_name === e),
  );

  const onAdd = async () => {
    if (!pendingExecutor) return;
    setAdding(true);
    try {
      await addToolBinding({
        toolId,
        executorName: pendingExecutor,
        isActive: true,
      });
      setPendingExecutor("");
      await load();
      toast.success(`Bound to ${pendingExecutor}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add binding");
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (row: ToolBindingRow) => {
    const ok = await confirm({
      title: `Unbind from ${row.executor_name}?`,
      description: "The tool will no longer be runnable on this executor.",
      confirmLabel: "Unbind",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeToolBinding({
        toolId: row.tool_id,
        executorName: row.executor_name,
      });
      await load();
      toast.success(`Unbound from ${row.executor_name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unbind failed");
    }
  };

  const onToggleActive = async (row: ToolBindingRow, isActive: boolean) => {
    try {
      await updateToolBinding({
        toolId: row.tool_id,
        executorName: row.executor_name,
        isActive,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<Cpu className="h-4 w-4" />}
        title="Executor bindings"
        count={rows.length}
        description="Executors that can run this tool. Dispatch policy: client > MCP > server."
      />
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
        </div>
      )}
      {error && <ErrorBox msg={error} />}
      {!loading && rows.length === 0 && (
        <EmptyHint>
          No executor bindings — this tool cannot be dispatched anywhere. Bind
          one below.
        </EmptyHint>
      )}
      {rows.length > 0 && (
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Executor</TableHead>
                <TableHead className="w-[120px]">Active</TableHead>
                <TableHead className="w-[80px] text-right">—</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.tool_id}-${row.executor_name}`}
                  className={row.is_active ? "" : "opacity-50"}
                >
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <Server className="h-3 w-3 text-muted-foreground" />
                      {row.executor_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.is_active}
                      onCheckedChange={(v) => void onToggleActive(row, v)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void onRemove(row)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      aria-label="Unbind"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 pt-1">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Bind to executor
          </Label>
          <Select
            value={pendingExecutor}
            onValueChange={setPendingExecutor}
            disabled={adding || availableExecutors.length === 0}
          >
            <SelectTrigger className="h-8 w-[320px] text-xs">
              <SelectValue
                placeholder={
                  availableExecutors.length === 0
                    ? "All executors bound"
                    : "Pick an executor…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {availableExecutors.map((e) => (
                <SelectItem key={e} value={e}>
                  <span className="font-mono text-xs">{e}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => void onAdd()}
          disabled={adding || !pendingExecutor}
        >
          {adding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Bind
        </Button>
      </div>
    </section>
  );
}

// ─── Surfaces (now derived from tool_surface_defaults.always_include_*) ──────

function SurfacesSection({ toolId }: { toolId: string }) {
  const [rows, setRows] = useState<SurfaceInclusion[]>([]);
  const [allSurfaces, setAllSurfaces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSurface, setPendingSurface] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, all] = await Promise.all([
        listSurfacesIncludingTool(toolId),
        listAllUiSurfaceNames(),
      ]);
      setRows(r);
      setAllSurfaces(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load surfaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [toolId]);

  // Only direct (always_include_tools) inclusions are editable here; bundle
  // inclusions are managed from the bundle, not the tool.
  const directlyIncludedNames = new Set(
    rows.filter((r) => r.via === "always_include_tools").map((r) => r.surface_name),
  );
  const available = allSurfaces.filter((s) => !directlyIncludedNames.has(s));

  const onAdd = async () => {
    if (!pendingSurface) return;
    setAdding(true);
    try {
      await addToolToSurface({ toolId, surfaceName: pendingSurface });
      setPendingSurface("");
      await load();
      toast.success(`Force-included on ${pendingSurface}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add inclusion");
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (surfaceName: string) => {
    const ok = await confirm({
      title: `Remove from ${surfaceName}?`,
      description:
        "The tool will no longer be force-included on this surface. It may still resolve through bundle inclusions or executor bindings.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeToolFromSurface({ toolId, surfaceName });
      await load();
      toast.success(`Removed from ${surfaceName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<Layers className="h-4 w-4" />}
        title="Surface inclusions"
        count={rows.length}
        description="Surfaces that force-include this tool. Tools NOT in this list still resolve through executor bindings + surface defaults inheritance."
      />
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
        </div>
      )}
      {error && <ErrorBox msg={error} />}
      {!loading && rows.length === 0 && (
        <EmptyHint>
          Not force-included on any surface. The tool resolves wherever its
          executor bindings + surface inheritance allow.
        </EmptyHint>
      )}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((row, idx) => (
            <Badge
              key={`${row.surface_name}-${row.via}-${row.bundle_name ?? idx}`}
              variant={row.via === "always_include_tools" ? "secondary" : "outline"}
              className="text-[11px] gap-1 pr-1 font-mono"
              title={
                row.via === "always_include_bundles"
                  ? `Included via bundle: ${row.bundle_name}`
                  : "Direct inclusion (always_include_tools)"
              }
            >
              {row.surface_name}
              {row.via === "always_include_bundles" && row.bundle_name && (
                <span className="text-[10px] opacity-70">
                  ← {row.bundle_name}
                </span>
              )}
              {row.via === "always_include_tools" && (
                <button
                  onClick={() => void onRemove(row.surface_name)}
                  className="ml-0.5 rounded hover:bg-background/50 p-0.5"
                  aria-label={`Remove ${row.surface_name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 pt-1">
        <div className="space-y-1 flex-1 max-w-md">
          <Label className="text-[11px] text-muted-foreground">
            Add direct surface inclusion
          </Label>
          <Select
            value={pendingSurface}
            onValueChange={setPendingSurface}
            disabled={adding || available.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue
                placeholder={
                  available.length === 0
                    ? "All active surfaces included"
                    : "Pick a surface…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {available.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => void onAdd()}
          disabled={adding || !pendingSurface}
        >
          {adding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Include
        </Button>
      </div>
    </section>
  );
}

// ─── Bundles (read-only reverse view) ────────────────────────────────────────

function BundlesSection({ toolId }: { toolId: string }) {
  const [rows, setRows] = useState<BundleMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listToolBundleMemberships(toolId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bundles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [toolId]);

  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<Package className="h-4 w-4" />}
        title="Bundles"
        count={rows.length}
        description="Bundles this tool is a member of. Manage membership from each bundle's detail page."
      />
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
        </div>
      )}
      {error && <ErrorBox msg={error} />}
      {!loading && rows.length === 0 && (
        <EmptyHint>This tool is not in any bundle.</EmptyHint>
      )}
      {rows.length > 0 && (
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bundle</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead>Local alias</TableHead>
                <TableHead className="w-[80px] text-right">Sort</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ member, bundle }) => (
                <TableRow key={`${member.bundle_id}-${member.tool_id}`}>
                  <TableCell className="text-xs">
                    <a
                      href={`/administration/bundles?b=${bundle.id}`}
                      className="font-mono text-foreground hover:text-primary hover:underline"
                    >
                      {bundle.name}
                    </a>
                    {bundle.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {bundle.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={bundle.is_system ? "default" : "secondary"} className="text-[10px]">
                      {bundle.is_system ? "system" : "personal"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{member.local_alias}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {member.sort_order}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

// ─── Gating ──────────────────────────────────────────────────────────────────
//
// Post-2026 refactor: tl_gate was dropped. Gates live in matrx-ai code
// (matrx_ai.tools.gates.*). There's no DB list to pick from anymore, so we
// seed the few known names + accept free-typed names.

const KNOWN_GATE_NAMES: { name: string; description: string }[] = [
  {
    name: "has_optional_permission",
    description:
      "Pass when the calling user holds the named optional permission.",
  },
  {
    name: "has_role",
    description: "Pass when the calling user has the named role.",
  },
  {
    name: "feature_flag",
    description: "Pass when the named feature flag is enabled for the user.",
  },
  {
    name: "admin_only",
    description: "Pass only for super-admin callers.",
  },
];

function GatingSection({
  toolId,
  initialGating,
}: {
  toolId: string;
  initialGating: unknown;
}) {
  const [gates, setGates] = useState<ToolGateEntry[]>(parseGating(initialGating));
  const [argsJson, setArgsJson] = useState<string[]>(
    parseGating(initialGating).map((g) => JSON.stringify(g.args, null, 2)),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customGate, setCustomGate] = useState("");

  const onAdd = (gateName: string) => {
    if (!gateName.trim()) return;
    if (gates.some((g) => g.gate === gateName.trim())) {
      toast.error(`Gate "${gateName.trim()}" is already configured`);
      return;
    }
    setGates((prev) => [...prev, { gate: gateName.trim(), args: {} }]);
    setArgsJson((prev) => [...prev, "{}"]);
    setCustomGate("");
  };

  const onRemove = (idx: number) => {
    setGates((prev) => prev.filter((_, i) => i !== idx));
    setArgsJson((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSave = async () => {
    setBusy(true);
    try {
      const parsed = gates.map((g, i) => ({
        gate: g.gate,
        args: argsJson[i] ? (JSON.parse(argsJson[i]) as Record<string, unknown>) : {},
      }));
      await setToolGating(toolId, parsed);
      toast.success("Gating saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const available = KNOWN_GATE_NAMES.filter(
    (g) => !gates.some((cur) => cur.gate === g.name),
  );

  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Gating"
        count={gates.length}
        description="Named gate functions that must pass at dispatch time. ALL must pass (AND). Gates live in matrx-ai code (matrx_ai.tools.gates.*)."
        action={
          <Button size="sm" onClick={() => void onSave()} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save gating"}
          </Button>
        }
      />
      {error && <ErrorBox msg={error} />}
      {gates.length === 0 && <EmptyHint>No gating — this tool is unrestricted.</EmptyHint>}
      <div className="space-y-2">
        {gates.map((g, idx) => {
          const meta = KNOWN_GATE_NAMES.find((m) => m.name === g.gate);
          return (
            <div key={idx} className="rounded-md border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs">{g.gate}</div>
                  {meta?.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{meta.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(idx)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove gate"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">args (JSON)</Label>
                <Textarea
                  value={argsJson[idx] ?? "{}"}
                  onChange={(e) =>
                    setArgsJson((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                  rows={3}
                  className="font-mono text-xs"
                  style={{ fontSize: "13px" }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-2 pt-1">
        {available.length > 0 && (
          <div className="flex items-end gap-2">
            <div className="space-y-1 flex-1 max-w-md">
              <Label className="text-[11px] text-muted-foreground">Add known gate</Label>
              <Select onValueChange={(v) => onAdd(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Pick a gate to add…" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((g) => (
                    <SelectItem key={g.name} value={g.name}>
                      <div className="flex flex-col items-start">
                        <span className="font-mono text-xs">{g.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {g.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1 max-w-md">
            <Label className="text-[11px] text-muted-foreground">
              Or add custom gate name (must match a gate function in matrx_ai.tools.gates)
            </Label>
            <Input
              value={customGate}
              onChange={(e) => setCustomGate(e.target.value)}
              placeholder="my_custom_gate"
              className="h-8 text-xs font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdd(customGate);
                }
              }}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAdd(customGate)}
            disabled={!customGate.trim()}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>
    </section>
  );
}
