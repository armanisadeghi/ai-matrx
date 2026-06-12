"use client";

import { useEffect, useState } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import {
  Loader2,
  Server,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Plus,
  Plug,
  PlugZap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import {
  listServers,
  listServerConfigs,
  listServerTools,
  countConnectedUsers,
  refreshServer,
  testMcpServer,
  computeFreshness,
  computeTestFreshness,
  formatRelativeAge,
  createServerConfig,
  updateServerConfig,
  deleteServerConfig,
  countConfigUserConnections,
  type McpServerRow,
  type McpConfigRow,
  type SyncFreshness,
  type TestFreshness,
  type McpTestResult,
} from "@/features/tool-registry/mcp-admin/services/mcpAdmin.service";
import { AddMcpServerDialog } from "@/features/tool-registry/mcp-admin/components/AddMcpServerDialog";

export function McpServersAdminPage() {
  const [servers, setServers] = useState<McpServerRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setServers(await listServers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load servers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = (() => {
    if (!search.trim()) return servers;
    const q = search.trim().toLowerCase();
    return servers.filter(
      (s) =>
        s.slug.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.vendor.toLowerCase().includes(q) ||
        idMatchesQuery(s, q),
    );
  })();

  const selected = servers.find((s) => s.slug === selectedSlug) ?? null;

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 bg-background">
        <Server className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Tool Registry · MCP Servers</h1>
        <Badge variant="outline" className="text-[10px]">
          {servers.length}
        </Badge>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void load()}
          className="h-7 ml-auto gap-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh list
        </Button>
        <Button
          size="sm"
          onClick={() => setAdding(true)}
          className="h-7 gap-1.5 text-xs"
          title="Provision a new MCP server (server + executor kind + system bundle + lister tool, atomically)"
        >
          <Plus className="h-3.5 w-3.5" />
          Add server
        </Button>
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[360px_1fr] min-h-0">
        <aside className="border-r border-border bg-card flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search servers…"
                className="pl-7 h-8 text-xs"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>
          {error && (
            <div className="m-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
          <div className="flex-1 overflow-auto">
            {filtered.length === 0 && !loading && (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                No servers match.
              </div>
            )}
            <ul>
              {filtered.map((s) => {
                const fresh = computeFreshness(s);
                const isSel = s.slug === selectedSlug;
                return (
                  <li key={s.slug}>
                    <button
                      onClick={() => setSelectedSlug(s.slug)}
                      className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-muted/40 transition-colors ${isSel ? "bg-muted" : ""}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs truncate flex-1">{s.slug}</span>
                        <FreshnessBadge fresh={fresh} compact />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="truncate">{s.name}</span>
                        <Badge variant="outline" className="text-[10px] flex-shrink-0">
                          {s.status}
                        </Badge>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
        <div className="overflow-auto">
          {selected ? (
            <ServerDetail key={selected.slug} server={selected} onRefreshed={() => void load()} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground p-12">
              Pick a server to view configs, connected users, and tools.
            </div>
          )}
        </div>
      </div>
      {adding && (
        <AddMcpServerDialog
          existingSlugs={new Set(servers.map((s) => s.slug))}
          onClose={() => setAdding(false)}
          onCreated={(slug) => {
            setAdding(false);
            void load().then(() => setSelectedSlug(slug));
          }}
        />
      )}
    </div>
  );
}

function FreshnessBadge({ fresh, compact }: { fresh: SyncFreshness; compact?: boolean }) {
  const map = {
    fresh: { Icon: CheckCircle2, label: "fresh", className: "bg-success/10 text-success border-success/30" },
    stale: { Icon: Clock, label: "stale", className: "bg-warning/10 text-warning border-warning/30" },
    errored: { Icon: XCircle, label: "error", className: "bg-destructive/10 text-destructive border-destructive/30" },
    never: { Icon: Clock, label: "never", className: "bg-muted text-muted-foreground border-border" },
  } as const;
  const { Icon, label, className } = map[fresh.state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${className}`}
      title={
        fresh.state === "errored"
          ? `Last error: ${fresh.lastError ?? "unknown"}`
          : fresh.ageSec !== null
            ? `Last synced ${formatRelativeAge(fresh.ageSec)} (TTL ${fresh.ttlSec}s)`
            : "Never synced"
      }
    >
      <Icon className="h-3 w-3" />
      {!compact && label}
    </span>
  );
}

function ServerDetail({
  server,
  onRefreshed,
}: {
  server: McpServerRow;
  onRefreshed: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [latestTest, setLatestTest] = useState<McpTestResult | null>(null);
  const fresh = computeFreshness(server);
  const testFresh = computeTestFreshness(server);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshServer(server.id);
      toast.success(`${server.slug} refreshed`);
      onRefreshed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setLatestTest(null);
    try {
      const result = await testMcpServer(server.id);
      setLatestTest(result);
      if (result.ok) {
        toast.success(`${server.slug} reachable (${result.statusCode}, ${result.latencyMs}ms)`);
      } else {
        toast.error(`${server.slug} unhealthy: ${result.error ?? result.message}`);
      }
      // Refresh the list so the persisted test result chip updates everywhere
      onRefreshed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-mono text-base font-semibold">{server.slug}</h2>
              <Badge variant="outline" className="text-[10px]">{server.status}</Badge>
              <Badge variant="secondary" className="text-[10px]">{server.transport}</Badge>
              {server.is_official && (
                <Badge className="text-[10px]">official</Badge>
              )}
              <FreshnessBadge fresh={fresh} />
              <TestFreshnessBadge testFresh={testFresh} />
            </div>
            <p className="text-sm mt-1">{server.name} <span className="text-muted-foreground">· {server.vendor}</span></p>
            {server.description && (
              <p className="text-xs text-muted-foreground mt-1 max-w-prose">{server.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {server.docs_url && (
              <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                <a href={server.docs_url} target="_blank" rel="noopener noreferrer">
                  Docs
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onTest()}
              disabled={testing}
              className="h-8 gap-1.5 text-xs"
              title="Probe the endpoint URL — does the server respond?"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
              Test connection
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onRefresh()}
              disabled={refreshing}
              className="h-8 gap-1.5 text-xs"
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh sync
            </Button>
          </div>
        </div>
        {fresh.state === "errored" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <strong>Sync error:</strong> {fresh.lastError}
          </div>
        )}
        {latestTest && <TestResultPanel result={latestTest} />}
      </header>

      <Tabs defaultValue="tools" className="flex flex-col">
        <TabsList className="h-9 self-start">
          <TabsTrigger value="tools" className="text-xs">Tools</TabsTrigger>
          <TabsTrigger value="configs" className="text-xs">Configs</TabsTrigger>
          <TabsTrigger value="connections" className="text-xs">Connected users</TabsTrigger>
          <TabsTrigger value="meta" className="text-xs">Metadata</TabsTrigger>
        </TabsList>
        <TabsContent value="tools" className="m-0 mt-3">
          <ToolsTab slug={server.slug} />
        </TabsContent>
        <TabsContent value="configs" className="m-0 mt-3">
          <ConfigsTab serverId={server.id} />
        </TabsContent>
        <TabsContent value="connections" className="m-0 mt-3">
          <ConnectionsTab serverId={server.id} />
        </TabsContent>
        <TabsContent value="meta" className="m-0 mt-3">
          <MetaTab server={server} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToolsTab({ slug }: { slug: string }) {
  const [tools, setTools] = useState<{ id: string; name: string; description: string; is_active: boolean | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void listServerTools(slug)
      .then(setTools)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tools"))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <InlineLoading />;
  if (error) return <ErrorBox msg={error} />;
  if (tools.length === 0) {
    return <EmptyHint>No tools registered for this server (yet — try Refresh sync).</EmptyHint>;
  }

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Canonical name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[80px]">Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tools.map((t) => (
            <TableRow key={t.id} className={t.is_active === false ? "opacity-60" : ""}>
              <TableCell className="font-mono text-xs">
                <a
                  href={`/administration/mcp-tools/${t.id}`}
                  className="text-foreground hover:text-primary hover:underline"
                >
                  {t.name}
                </a>
              </TableCell>
              <TableCell className="text-xs">{t.description}</TableCell>
              <TableCell>
                <Badge variant={t.is_active ? "default" : "secondary"} className="text-[10px]">
                  {t.is_active ? "active" : "inactive"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConfigsTab({ serverId }: { serverId: string }) {
  const [configs, setConfigs] = useState<McpConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<McpConfigRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setConfigs(await listServerConfigs(serverId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load configs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [serverId]);

  const onSetDefault = async (config: McpConfigRow) => {
    try {
      await updateServerConfig(config.id, { is_default: true });
      await load();
      toast.success(`${config.label} set as default`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const onDelete = async (config: McpConfigRow) => {
    const refCount = await countConfigUserConnections(config.id).catch(() => 0);
    const ok = await confirm({
      title: `Delete config "${config.label}"?`,
      description:
        refCount > 0
          ? `${refCount} user connection${refCount === 1 ? "" : "s"} reference this config. They'll be set to NULL config_id (still valid via the server's default config).`
          : "No user connections reference this config. Safe to delete.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteServerConfig(config.id);
      await load();
      toast.success(`Config ${config.label} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Transport variants for this server. The default config is used when a user connects without specifying one. stdio configs need a command + args; HTTP/SSE configs typically just store the endpoint via the server row.
        </p>
        <Button size="sm" onClick={() => setCreating(true)} className="h-7 gap-1.5 text-xs flex-shrink-0">
          <Plus className="h-3.5 w-3.5" />
          Add config
        </Button>
      </div>
      {loading && <InlineLoading />}
      {error && <ErrorBox msg={error} />}
      {!loading && configs.length === 0 && (
        <EmptyHint>No connection configs defined yet — click "Add config" to create one.</EmptyHint>
      )}
      <div className="space-y-2">
        {configs.map((c) => (
          <div key={c.id} className="rounded-md border border-border bg-card p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="font-mono text-xs">{c.label}</code>
                  <Badge variant="outline" className="text-[10px]">{c.config_type}</Badge>
                  {c.is_default && <Badge className="text-[10px]">default</Badge>}
                  {c.requires_docker && <Badge variant="secondary" className="text-[10px]">Docker</Badge>}
                </div>
                {c.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{c.notes}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!c.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void onSetDefault(c)}
                    className="h-7 text-xs px-2"
                    title="Make this the default config for new user connections"
                  >
                    Set default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(c)}
                  className="h-7 text-xs px-2"
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void onDelete(c)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  aria-label="Delete config"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="text-[11px] font-mono text-muted-foreground space-y-0.5">
              <div>command: <code className="bg-muted px-1 rounded">{c.command || <em>—</em>}</code></div>
              {c.args.length > 0 && (
                <div>args: <code className="bg-muted px-1 rounded">{c.args.join(" ")}</code></div>
              )}
              {c.npm_package && <div>npm: <code className="bg-muted px-1 rounded">{c.npm_package}</code></div>}
              {c.pip_package && <div>pip: <code className="bg-muted px-1 rounded">{c.pip_package}</code></div>}
              {c.min_node_version && <div>min Node: {c.min_node_version}</div>}
            </div>
          </div>
        ))}
      </div>
      {(editing || creating) && (
        <ConfigDialog
          serverId={serverId}
          config={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ConfigDialog({
  serverId,
  config,
  onClose,
  onSaved,
}: {
  serverId: string;
  config: McpConfigRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!config;
  const [label, setLabel] = useState(config?.label ?? "");
  const [configType, setConfigType] = useState(config?.config_type ?? "stdio");
  const [command, setCommand] = useState(config?.command ?? "");
  const [argsText, setArgsText] = useState((config?.args ?? []).join(" "));
  const [envSchemaJson, setEnvSchemaJson] = useState(
    JSON.stringify(config?.env_schema ?? [], null, 2),
  );
  const [isDefault, setIsDefault] = useState(config?.is_default ?? false);
  const [npmPackage, setNpmPackage] = useState(config?.npm_package ?? "");
  const [pipPackage, setPipPackage] = useState(config?.pip_package ?? "");
  const [minNode, setMinNode] = useState(config?.min_node_version ?? "");
  const [requiresDocker, setRequiresDocker] = useState(config?.requires_docker ?? false);
  const [notes, setNotes] = useState(config?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    let envSchema: unknown;
    try {
      envSchema = JSON.parse(envSchemaJson || "[]");
    } catch (e) {
      toast.error(e instanceof Error ? `Invalid env_schema JSON: ${e.message}` : "Invalid JSON");
      return;
    }
    const argsArr = argsText
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setBusy(true);
    try {
      if (isEdit && config) {
        await updateServerConfig(config.id, {
          label: label.trim(),
          config_type: configType,
          command: command.trim(),
          args: argsArr,
          env_schema: envSchema as never,
          is_default: isDefault,
          npm_package: npmPackage.trim() || null,
          pip_package: pipPackage.trim() || null,
          min_node_version: minNode.trim() || null,
          requires_docker: requiresDocker,
          notes: notes.trim() || null,
        });
      } else {
        await createServerConfig({
          serverId,
          label: label.trim(),
          configType,
          command: command.trim(),
          argsArr,
          envSchema: envSchema as never,
          isDefault,
          npmPackage: npmPackage.trim() || null,
          pipPackage: pipPackage.trim() || null,
          minNodeVersion: minNode.trim() || null,
          requiresDocker,
          notes: notes.trim() || null,
        });
      }
      toast.success(`Config "${label}" ${isEdit ? "saved" : "created"}`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit config "${config.label}"` : "New config"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Label (unique within server)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. stdio-default, http-prod"
                className="font-mono text-sm h-9"
                style={{ fontSize: "16px" }}
                disabled={busy}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Config type</Label>
              <Select value={configType} onValueChange={setConfigType} disabled={busy}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="sse">sse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Command</Label>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. npx"
                className="font-mono text-sm h-9"
                style={{ fontSize: "16px" }}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Args (whitespace-separated)</Label>
              <Input
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder="e.g. -y @scope/mcp-server"
                className="font-mono text-sm h-9"
                style={{ fontSize: "16px" }}
                disabled={busy}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">npm package</Label>
              <Input
                value={npmPackage}
                onChange={(e) => setNpmPackage(e.target.value)}
                placeholder="@vendor/mcp-server"
                className="font-mono text-sm h-9"
                style={{ fontSize: "16px" }}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">pip package</Label>
              <Input
                value={pipPackage}
                onChange={(e) => setPipPackage(e.target.value)}
                placeholder="vendor-mcp-server"
                className="font-mono text-sm h-9"
                style={{ fontSize: "16px" }}
                disabled={busy}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Minimum Node version</Label>
              <Input
                value={minNode}
                onChange={(e) => setMinNode(e.target.value)}
                placeholder="e.g. 20"
                className="text-sm h-9"
                style={{ fontSize: "16px" }}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Flags</Label>
              <div className="flex items-center gap-3 h-9">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="accent-primary"
                    disabled={busy}
                  />
                  Default
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresDocker}
                    onChange={(e) => setRequiresDocker(e.target.checked)}
                    className="accent-primary"
                    disabled={busy}
                  />
                  Requires Docker
                </label>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Env schema (JSON array of {`{ key, label, required, secret }`})</Label>
            <Textarea
              value={envSchemaJson}
              onChange={(e) => setEnvSchemaJson(e.target.value)}
              rows={5}
              className="font-mono text-xs"
              style={{ fontSize: "13px" }}
              disabled={busy}
            />
            <p className="text-[11px] text-muted-foreground">
              Drives the per-user setup form when a user connects with this config. Leave as <code>[]</code> if no env vars needed.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (admin-only)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything future-you should know about this config"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !label.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionsTab({ serverId }: { serverId: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void countConnectedUsers(serverId)
      .then(setCount)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load count"))
      .finally(() => setLoading(false));
  }, [serverId]);

  if (loading) return <InlineLoading />;
  if (error) return <ErrorBox msg={error} />;

  return (
    <div className="rounded-md border border-border bg-card p-4 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{count ?? 0}</span>
        <span className="text-xs text-muted-foreground">user{count === 1 ? "" : "s"} connected</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Per-user connection details (auth status, last used, error count) live in the per-user
        Connections page (Phase 6 — coming next).
      </p>
    </div>
  );
}

function MetaTab({ server }: { server: McpServerRow }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <pre className="font-mono text-[11px] overflow-auto whitespace-pre-wrap leading-relaxed">
        {JSON.stringify(
          {
            id: server.id,
            slug: server.slug,
            name: server.name,
            vendor: server.vendor,
            category: server.category,
            transport: server.transport,
            auth_strategy: server.auth_strategy,
            status: server.status,
            has_local: server.has_local,
            has_remote: server.has_remote,
            supports_mcp_apps: server.supports_mcp_apps,
            is_official: server.is_official,
            is_featured: server.is_featured,
            discovery_ttl_seconds: server.discovery_ttl_seconds,
            last_synced_at: server.last_synced_at,
            last_sync_error: server.last_sync_error,
            metadata: server.metadata,
            created_at: server.created_at,
            updated_at: server.updated_at,
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
}

function InlineLoading() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
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

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function TestFreshnessBadge({ testFresh }: { testFresh: TestFreshness }) {
  if (testFresh.state === "untested") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        title="No connection test on record. Click 'Test connection' to probe the endpoint."
      >
        <Plug className="h-3 w-3" />
        untested
      </span>
    );
  }
  if (testFresh.state === "ok") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success`}
        title={`Endpoint reachable as of ${formatRelativeAge(testFresh.ageSec)} — HTTP ${testFresh.statusCode}, ${testFresh.latencyMs}ms`}
      >
        <PlugZap className="h-3 w-3" />
        reachable {testFresh.latencyMs !== null ? `${testFresh.latencyMs}ms` : ""}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
      title={
        testFresh.error
          ? `${formatRelativeAge(testFresh.ageSec)}: ${testFresh.error}`
          : `Last test failed (${formatRelativeAge(testFresh.ageSec)})`
      }
    >
      <XCircle className="h-3 w-3" />
      unreachable
    </span>
  );
}

function TestResultPanel({ result }: { result: McpTestResult }) {
  const tone = result.ok
    ? "border-success/30 bg-success/5 text-success"
    : "border-destructive/40 bg-destructive/5 text-destructive";
  const Icon = result.ok ? CheckCircle2 : XCircle;
  return (
    <div className={`rounded-md border ${tone} px-3 py-2 space-y-1`}>
      <div className="flex items-center gap-2 text-xs font-medium">
        <Icon className="h-3.5 w-3.5" />
        {result.ok ? "Reachable" : "Unhealthy"}
        {result.statusCode !== null && (
          <Badge variant="outline" className="text-[10px] font-mono">
            HTTP {result.statusCode}
          </Badge>
        )}
        {result.latencyMs !== null && (
          <Badge variant="outline" className="text-[10px] font-mono">
            {result.latencyMs}ms
          </Badge>
        )}
        {result.endpointTested && (
          <code className="ml-auto text-[10px] text-muted-foreground truncate max-w-[280px]">
            {result.endpointTested}
          </code>
        )}
      </div>
      <p className="text-[11px] leading-relaxed">{result.message}</p>
      {result.error && (
        <p className="text-[11px] font-mono">
          <strong>error:</strong> {result.error}
        </p>
      )}
    </div>
  );
}
