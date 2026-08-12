"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { toast } from "@/lib/toast";
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
import {
  MCP_SERVER_DEEP_LINK_PARAM,
  toolHref,
} from "@/features/tool-registry/doors";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import {
  csvExportItem,
  jsonExportItem,
} from "@/components/agent-copy/export";
import {
  configSummary,
  serverBrief,
  serverMeta,
  serverSummary,
  serverToolSummary,
  serversListSummary,
  type ServerToolRow,
} from "@/features/tool-registry/mcp-admin/format";

const PAGE_LOCATION =
  "AI Matrx Admin — Tool Registry · MCP Servers (/administration/agents/mcp-servers)";

export function McpServersAdminPage() {
  const [servers, setServers] = useState<McpServerRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // THE DOOR LAW: this console owns its selection in React state, so an MCP
  // server had no address at all — every surface that named one (the tool
  // registry's "MCP Server" column, a managed tool's overview) pointed at
  // `/administration/agents/mcp-servers/<id>`, a route leaf that does not
  // exist, and 404'd. `?server=` makes the server itself linkable; the param
  // accepts the id OR the slug because callers hold whichever they were given.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLink = searchParams.get(MCP_SERVER_DEEP_LINK_PARAM);

  const selectServer = (slug: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set(MCP_SERVER_DEEP_LINK_PARAM, slug);
    else params.delete(MCP_SERVER_DEEP_LINK_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

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

  // THE URL IS THE ONLY SELECTION. `selectServer` writes `?server=`, and this
  // reads it back — one source of truth, so a click and a link can never
  // disagree. A parallel `selectedSlug` state used to win over the param
  // forever once the user clicked anything, so navigating to a DIFFERENT
  // `?server=` (the tools console's MCP column, back/forward) kept the
  // previously-clicked server on screen while the address bar named another.
  // Matching id OR slug means a caller can link with whichever it holds.
  const selected =
    servers.find((s) => s.slug === deepLink || s.id === deepLink) ?? null;

  // A deep link the list cannot resolve is its own loud state — never the
  // neutral "pick a server" empty view, which would read as "nothing here".
  const deepLinkUnresolved = Boolean(deepLink) && !selected;

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 bg-background">
        <Server className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Tool Registry · MCP Servers</h1>
        <Badge variant="outline" className="text-[10px]">
          {servers.length}
        </Badge>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {servers.length > 0 && (
          <div className="ml-auto flex items-center">
            <CopyButtons
              size="icon"
              label="MCP servers"
              human={() => serversListSummary(servers)}
              json={() => servers.map(serverMeta)}
              agent={() => ({
                kind: "mcp-servers",
                location: PAGE_LOCATION,
                description:
                  "All registered MCP servers in the tool registry (sanitized — no endpoint URLs or OAuth ids).",
                data: servers.map(serverMeta),
                attributes: { count: servers.length },
                context: {
                  search: search.trim() || undefined,
                  visible: filtered.length,
                },
              })}
              aiVariants={[
                {
                  id: "summary",
                  label: "Summary",
                  hint: "Slug, vendor, status, transport, sync per server",
                  build: () => ({
                    kind: "mcp-servers",
                    location: PAGE_LOCATION,
                    description:
                      "Compact digest of all registered MCP servers.",
                    data: servers.map(serverBrief),
                    attributes: { count: servers.length },
                    summary: serversListSummary(servers),
                  }),
                },
              ]}
            />
            <ExportMenu
              label="mcp-servers"
              items={[
                jsonExportItem(() => servers.map(serverMeta)),
                csvExportItem(
                  () =>
                    servers.map(serverBrief) as unknown as Array<
                      Record<string, unknown>
                    >,
                  "CSV (server summary)",
                ),
              ]}
            />
          </div>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void load()}
          className={`h-7 gap-1.5 text-xs ${servers.length > 0 ? "" : "ml-auto"}`}
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
                const isSel = s.slug === selected?.slug;
                return (
                  <li key={s.slug} className="relative group/srv">
                    {/* Sibling overlay, not a child of the row button — nested
                        buttons are invalid HTML. */}
                    <CopyButtons
                      size="xs"
                      label={`Server ${s.slug}`}
                      className="absolute right-1.5 bottom-1 z-10 rounded border border-border bg-card opacity-0 group-hover/srv:opacity-100 focus-within:opacity-100"
                      human={() => serverSummary(s)}
                      json={() => serverMeta(s)}
                      agent={() => ({
                        kind: "mcp-server",
                        location: PAGE_LOCATION,
                        description:
                          "One registered MCP server (sanitized row).",
                        data: serverMeta(s),
                        summary: serverSummary(s),
                        attributes: { slug: s.slug, status: s.status },
                      })}
                    />
                    <button
                      onClick={() => selectServer(s.slug)}
                      className={`w-full text-left py-2 pl-3 pr-20 border-b border-border/50 hover:bg-muted/40 transition-colors ${isSel ? "bg-muted" : ""}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs truncate flex-1">
                          {s.slug}
                        </span>
                        <FreshnessBadge fresh={fresh} compact />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="truncate">{s.name}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] flex-shrink-0"
                        >
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
            <ServerDetail
              key={selected.slug}
              server={selected}
              onRefreshed={() => void load()}
            />
          ) : deepLinkUnresolved ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 p-12 text-center">
              <AlertCircle className="h-5 w-5 text-warning" />
              <p className="text-xs text-muted-foreground">
                No registered MCP server matches{" "}
                <code className="font-mono">{deepLink}</code>
                {loading ? " yet — still loading the list." : "."}
              </p>
            </div>
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
            void load().then(() => selectServer(slug));
          }}
        />
      )}
    </div>
  );
}

function FreshnessBadge({
  fresh,
  compact,
}: {
  fresh: SyncFreshness;
  compact?: boolean;
}) {
  const map = {
    fresh: {
      Icon: CheckCircle2,
      label: "fresh",
      className: "bg-success/10 text-success border-success/30",
    },
    stale: {
      Icon: Clock,
      label: "stale",
      className: "bg-warning/10 text-warning border-warning/30",
    },
    errored: {
      Icon: XCircle,
      label: "error",
      className: "bg-destructive/10 text-destructive border-destructive/30",
    },
    never: {
      Icon: Clock,
      label: "never",
      className: "bg-muted text-muted-foreground border-border",
    },
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
        toast.success(
          `${server.slug} reachable (${result.statusCode}, ${result.latencyMs}ms)`,
        );
      } else {
        toast.error(
          `${server.slug} unhealthy: ${result.error ?? result.message}`,
        );
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
              <h2 className="font-mono text-base font-semibold">
                {server.slug}
              </h2>
              <Badge variant="outline" className="text-[10px]">
                {server.status}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {server.transport}
              </Badge>
              {server.is_official && (
                <Badge className="text-[10px]">official</Badge>
              )}
              <FreshnessBadge fresh={fresh} />
              <TestFreshnessBadge testFresh={testFresh} />
            </div>
            <p className="text-sm mt-1">
              {server.name}{" "}
              <span className="text-muted-foreground">· {server.vendor}</span>
            </p>
            {server.description && (
              <p className="text-xs text-muted-foreground mt-1 max-w-prose">
                {server.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <CopyButtons
              size="icon"
              label={`Server ${server.slug}`}
              human={() => serverSummary(server)}
              json={() => serverMeta(server)}
              agent={() => ({
                kind: "mcp-server",
                location: PAGE_LOCATION,
                description:
                  "The MCP server record currently open in the admin detail pane (sanitized — no endpoint URLs or OAuth ids).",
                data: serverMeta(server),
                summary: serverSummary(server),
                attributes: { slug: server.slug, status: server.status },
              })}
            />
            {server.docs_url && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
              >
                <a
                  href={server.docs_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="h-3.5 w-3.5" />
              )}
              Test connection
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onRefresh()}
              disabled={refreshing}
              className="h-8 gap-1.5 text-xs"
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
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
          <TabsTrigger value="tools" className="text-xs">
            Tools
          </TabsTrigger>
          <TabsTrigger value="configs" className="text-xs">
            Configs
          </TabsTrigger>
          <TabsTrigger value="connections" className="text-xs">
            Connected users
          </TabsTrigger>
          <TabsTrigger value="meta" className="text-xs">
            Metadata
          </TabsTrigger>
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
  const [tools, setTools] = useState<ServerToolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void listServerTools(slug)
      .then(setTools)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load tools"),
      )
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <InlineLoading />;
  if (error) return <ErrorBox msg={error} />;
  if (tools.length === 0) {
    return (
      <EmptyHint>
        No tools registered for this server (yet — try Refresh sync).
      </EmptyHint>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        <CopyButtons
          size="icon"
          label={`Tools of ${slug}`}
          human={() => tools.map(serverToolSummary).join("\n")}
          json={() => tools}
          agent={() => ({
            kind: "mcp-server-tools",
            location: PAGE_LOCATION,
            description: `All tools registered under the MCP server "${slug}".`,
            data: tools,
            attributes: { server: slug, count: tools.length },
          })}
        />
        <ExportMenu
          label={`${slug}-tools`}
          items={[
            jsonExportItem(() => tools),
            csvExportItem(
              () => tools as unknown as Array<Record<string, unknown>>,
              "CSV",
            ),
          ]}
        />
      </div>
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canonical name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[80px]">Active</TableHead>
              <TableHead className="w-[56px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.map((t) => (
              <TableRow
                key={t.id}
                className={`group/tool ${t.is_active === false ? "opacity-60" : ""}`}
              >
                <TableCell className="font-mono text-xs">
                  {/* Was a raw <a> — a full page load, no new-tab control and
                      no preview. EntityRef adds both from the registries
                      (`tool` → tool.definition, title column `name`). */}
                  <EntityRef
                    token="tool"
                    id={t.id}
                    name={t.name}
                    href={toolHref(t.id)}
                    showIcon={false}
                    className="font-mono"
                  />
                </TableCell>
                <TableCell className="text-xs">{t.description}</TableCell>
                <TableCell>
                  <Badge
                    variant={t.is_active ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {t.is_active ? "active" : "inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <CopyButtons
                    size="xs"
                    label={`Tool ${t.name}`}
                    className="opacity-0 group-hover/tool:opacity-100 focus-within:opacity-100"
                    human={() => serverToolSummary(t)}
                    json={() => t}
                    agent={() => ({
                      kind: "mcp-server-tool",
                      location: PAGE_LOCATION,
                      description: `One tool registered under the MCP server "${slug}".`,
                      data: t,
                      summary: serverToolSummary(t),
                      attributes: { server: slug, name: t.name },
                    })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
          Transport variants for this server. The default config is used when a
          user connects without specifying one. stdio configs need a command +
          args; HTTP/SSE configs typically just store the endpoint via the
          server row.
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {configs.length > 0 && (
            <>
              <CopyButtons
                size="icon"
                label="Server configs"
                human={() => configs.map(configSummary).join("\n\n")}
                json={() => configs}
                agent={() => ({
                  kind: "mcp-server-configs",
                  location: PAGE_LOCATION,
                  description:
                    "All connection configs of the MCP server currently open in the admin detail pane.",
                  data: configs,
                  attributes: { count: configs.length },
                })}
              />
              <ExportMenu
                label="mcp-server-configs"
                items={[jsonExportItem(() => configs)]}
              />
            </>
          )}
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            className="h-7 gap-1.5 text-xs flex-shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Add config
          </Button>
        </div>
      </div>
      {loading && <InlineLoading />}
      {error && <ErrorBox msg={error} />}
      {!loading && configs.length === 0 && (
        <EmptyHint>
          No connection configs defined yet — click "Add config" to create one.
        </EmptyHint>
      )}
      <div className="space-y-2">
        {configs.map((c) => (
          <div
            key={c.id}
            className="rounded-md border border-border bg-card p-3 space-y-2"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="font-mono text-xs">{c.label}</code>
                  <Badge variant="outline" className="text-[10px]">
                    {c.config_type}
                  </Badge>
                  {c.is_default && (
                    <Badge className="text-[10px]">default</Badge>
                  )}
                  {c.requires_docker && (
                    <Badge variant="secondary" className="text-[10px]">
                      Docker
                    </Badge>
                  )}
                </div>
                {c.notes && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.notes}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <CopyButtons
                  size="xs"
                  label={`Config ${c.label}`}
                  human={() => configSummary(c)}
                  json={() => c}
                  agent={() => ({
                    kind: "mcp-server-config",
                    location: PAGE_LOCATION,
                    description:
                      "One connection config of the MCP server open in the admin detail pane.",
                    data: c,
                    summary: configSummary(c),
                    attributes: { label: c.label, type: c.config_type },
                  })}
                />
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
              <div>
                command:{" "}
                <code className="bg-muted px-1 rounded">
                  {c.command || <em>—</em>}
                </code>
              </div>
              {c.args.length > 0 && (
                <div>
                  args:{" "}
                  <code className="bg-muted px-1 rounded">
                    {c.args.join(" ")}
                  </code>
                </div>
              )}
              {c.npm_package && (
                <div>
                  npm:{" "}
                  <code className="bg-muted px-1 rounded">{c.npm_package}</code>
                </div>
              )}
              {c.pip_package && (
                <div>
                  pip:{" "}
                  <code className="bg-muted px-1 rounded">{c.pip_package}</code>
                </div>
              )}
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
  const [requiresDocker, setRequiresDocker] = useState(
    config?.requires_docker ?? false,
  );
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
      toast.error(
        e instanceof Error
          ? `Invalid env_schema JSON: ${e.message}`
          : "Invalid JSON",
      );
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
          <DialogTitle>
            {isEdit ? `Edit config "${config.label}"` : "New config"}
          </DialogTitle>
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
              <Select
                value={configType}
                onValueChange={setConfigType}
                disabled={busy}
              >
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
                  <Checkbox
                    checked={isDefault}
                    onCheckedChange={(v) => setIsDefault(v === true)}
                    disabled={busy}
                  />
                  Default
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={requiresDocker}
                    onCheckedChange={(v) => setRequiresDocker(v === true)}
                    disabled={busy}
                  />
                  Requires Docker
                </label>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Env schema (JSON array of {`{ key, label, required, secret }`})
            </Label>
            <Textarea
              value={envSchemaJson}
              onChange={(e) => setEnvSchemaJson(e.target.value)}
              rows={5}
              className="font-mono text-xs"
              style={{ fontSize: "13px" }}
              disabled={busy}
            />
            <p className="text-[11px] text-muted-foreground">
              Drives the per-user setup form when a user connects with this
              config. Leave as <code>[]</code> if no env vars needed.
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
          <Button
            onClick={() => void submit()}
            disabled={busy || !label.trim()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isEdit ? (
              "Save"
            ) : (
              "Create"
            )}
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
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load count"),
      )
      .finally(() => setLoading(false));
  }, [serverId]);

  if (loading) return <InlineLoading />;
  if (error) return <ErrorBox msg={error} />;

  return (
    <div className="rounded-md border border-border bg-card p-4 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">
          {count ?? 0}
        </span>
        <span className="text-xs text-muted-foreground">
          user{count === 1 ? "" : "s"} connected
        </span>
        <CopyButtons
          size="xs"
          label="Connected users count"
          className="ml-auto"
          human={() => `${count ?? 0} user${count === 1 ? "" : "s"} connected`}
          agent={() => ({
            kind: "mcp-server-connections",
            location: PAGE_LOCATION,
            description:
              "Count of users connected to the MCP server open in the admin detail pane.",
            data: { server_id: serverId, connected_users: count ?? 0 },
            attributes: { count: count ?? 0 },
          })}
        />
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Per-user connection details (auth status, last used, error count) live
        in the per-user Connections page (Phase 6 — coming next).
      </p>
    </div>
  );
}

function MetaTab({ server }: { server: McpServerRow }) {
  const meta = serverMeta(server);
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex justify-end">
        <CopyButtons
          size="xs"
          label={`Server ${server.slug} metadata`}
          human={() => serverSummary(server)}
          json={() => meta}
          agent={() => ({
            kind: "mcp-server",
            location: PAGE_LOCATION,
            description:
              "Sanitized metadata of the MCP server open in the admin detail pane.",
            data: meta,
            summary: serverSummary(server),
            attributes: { slug: server.slug, status: server.status },
          })}
        />
      </div>
      <pre className="font-mono text-[11px] overflow-auto whitespace-pre-wrap leading-relaxed">
        {JSON.stringify(meta, null, 2)}
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
        reachable{" "}
        {testFresh.latencyMs !== null ? `${testFresh.latencyMs}ms` : ""}
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
        <CopyButtons
          size="xs"
          label="Connection test result"
          className={result.endpointTested ? "" : "ml-auto"}
          human={() =>
            `${result.ok ? "Reachable" : "Unhealthy"}${result.statusCode !== null ? ` · HTTP ${result.statusCode}` : ""}${result.latencyMs !== null ? ` · ${result.latencyMs}ms` : ""}\n${result.message}${result.error ? `\nerror: ${result.error}` : ""}`
          }
          json={() => result}
          agent={() => ({
            kind: "mcp-server-test-result",
            location: PAGE_LOCATION,
            description:
              "Latest connection-test result for the MCP server open in the admin detail pane.",
            data: result,
            attributes: { ok: result.ok, transport: result.transport },
          })}
        />
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
