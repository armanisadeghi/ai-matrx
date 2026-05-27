"use client";

import { useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, AlertCircle, Check } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  provisionMcpServer,
  refreshServer,
  type ProvisionMcpServerInput,
  type ProvisionMcpServerResult,
} from "@/features/tool-registry/mcp-admin/services/mcpAdmin.service";

interface Props {
  existingSlugs: Set<string>;
  onClose: () => void;
  onCreated: (slug: string) => void;
}

const CATEGORY_OPTIONS: { value: ProvisionMcpServerInput["category"]; label: string }[] = [
  { value: "productivity", label: "Productivity" },
  { value: "communication", label: "Communication" },
  { value: "design", label: "Design & Content" },
  { value: "developer", label: "Developer & Cloud" },
  { value: "database", label: "Database" },
  { value: "payments", label: "Payments & Commerce" },
  { value: "analytics", label: "Analytics & Data" },
  { value: "crm", label: "CRM & Sales" },
  { value: "storage", label: "File Storage" },
  { value: "ai", label: "AI" },
  { value: "search", label: "Search" },
  { value: "automation", label: "Automation" },
  { value: "other", label: "Other" },
];

const TRANSPORT_OPTIONS: {
  value: ProvisionMcpServerInput["transport"];
  label: string;
  hint: string;
}[] = [
  { value: "http", label: "HTTP", hint: "Streamable HTTP (most common)" },
  { value: "sse", label: "SSE", hint: "Server-Sent Events long-poll" },
  { value: "stdio", label: "stdio", hint: "Local subprocess via npm/pip command" },
];

const AUTH_OPTIONS: {
  value: ProvisionMcpServerInput["authStrategy"];
  label: string;
  hint: string;
}[] = [
  { value: "oauth_discovery", label: "OAuth (RFC 8414 discovery)", hint: "Standard OAuth 2.0 with auto-discovered endpoints" },
  { value: "bearer", label: "Bearer token", hint: "Static bearer token, user-provided" },
  { value: "api_key", label: "API key", hint: "User-provided API key in headers" },
  { value: "env", label: "Environment variables", hint: "Credentials configured server-side" },
  { value: "none", label: "None", hint: "Public / unauthenticated server" },
];

type Step = "identity" | "transport" | "review";

export function AddMcpServerDialog({ existingSlugs, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("identity");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ProvisionMcpServerInput["category"]>("productivity");
  const [transport, setTransport] = useState<ProvisionMcpServerInput["transport"]>("http");
  const [authStrategy, setAuthStrategy] = useState<ProvisionMcpServerInput["authStrategy"]>("oauth_discovery");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isOfficial, setIsOfficial] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<ProvisionMcpServerResult | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
  const slugValid = SLUG_RE.test(slug);
  const slugClash = existingSlugs.has(slug);

  const identityValid = slugValid && !slugClash && name.trim() !== "" && vendor.trim() !== "";
  const transportValid =
    (transport === "stdio" || endpointUrl.trim() !== "") && authStrategy !== undefined;

  const onProvision = async () => {
    setBusy(true);
    try {
      const r = await provisionMcpServer({
        slug,
        name,
        vendor,
        description: description || undefined,
        category,
        transport,
        authStrategy,
        endpointUrl: endpointUrl || undefined,
        docsUrl: docsUrl || undefined,
        websiteUrl: websiteUrl || undefined,
        isOfficial,
      });
      setResult(r);
      toast.success(`Server "${r.server_slug}" provisioned`);

      if (autoRefresh) {
        setRefreshing(true);
        try {
          await refreshServer(r.server_id);
          toast.success("Catalog refresh started");
        } catch (e) {
          // Don't fail the wizard — admin can refresh manually
          setRefreshError(e instanceof Error ? e.message : "Refresh failed");
        } finally {
          setRefreshing(false);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provisioning failed");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy || refreshing) return;
    if (result) onCreated(result.server_slug);
    else onClose();
  };

  // ── Result screen ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-success" />
              Server provisioned
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Four rows were inserted in one transaction. The catalog{" "}
              {refreshing ? "is being fetched now" : autoRefresh ? "fetch was attempted" : "has not been fetched yet"}
              {refreshError && (
                <>
                  {" "}— but the refresh hit an error:{" "}
                  <code className="bg-destructive/10 text-destructive px-1 rounded">
                    {refreshError}
                  </code>
                </>
              )}
              .
            </p>
            <div className="rounded-md border border-border bg-card divide-y divide-border text-xs">
              <ResultRow label="MCP server" value={result.server_slug} subtle={result.server_id} href={`/administration/mcp-servers#${result.server_slug}`} />
              <ResultRow label="Executor" value={result.executor} />
              <ResultRow label="System bundle" value={result.bundle_name} subtle={result.bundle_id} href={`/administration/bundles`} />
              <ResultRow label="Lister tool" value={result.lister_name} subtle={result.lister_tool_id} href={`/administration/mcp-tools/${result.lister_tool_id}`} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {result.next_step}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={close} disabled={busy || refreshing}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add MCP server</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 -mt-1 mb-1">
          {(["identity", "transport", "review"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors ${
                step === s
                  ? "bg-primary"
                  : i <
                      (["identity", "transport", "review"] as Step[]).indexOf(step)
                    ? "bg-primary/60"
                    : "bg-border"
              }`}
            />
          ))}
        </div>

        {step === "identity" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Step 1 of 3 — identity. The slug becomes the server's primary key
              and is also used as the executor kind name (<code className="bg-muted px-1 rounded">mcp.&lt;slug&gt;</code>) and
              auto-bundle name.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Slug (URL-safe ID)</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="e.g. notion, linear, custom-search"
                  className="font-mono text-sm h-9"
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                  autoFocus
                />
                {slug && !slugValid && (
                  <p className="text-[11px] text-destructive">
                    Lowercase letters, digits, hyphens. Start with a letter/digit.
                  </p>
                )}
                {slugClash && (
                  <p className="text-[11px] text-destructive">
                    <code className="font-mono">{slug}</code> already exists.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Display name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Notion, Linear, Custom Search"
                  className="text-sm h-9"
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Vendor</Label>
                <Input
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Notion Labs, Inc."
                  className="text-sm h-9"
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as ProvisionMcpServerInput["category"])}
                  disabled={busy}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short, agent-facing summary of what this server provides"
                rows={2}
                style={{ fontSize: "16px" }}
                disabled={busy}
              />
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Switch checked={isOfficial} onCheckedChange={setIsOfficial} disabled={busy} />
              <div>
                <Label className="text-xs">Official server</Label>
                <p className="text-[11px] text-muted-foreground">
                  Mark as vendor-blessed. Surfaces a badge in the user-facing catalog.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === "transport" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Step 2 of 3 — transport &amp; auth. These determine how matrx-ai
              connects to the server and how user credentials flow.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Transport</Label>
              <Select value={transport} onValueChange={(v) => setTransport(v as ProvisionMcpServerInput["transport"])} disabled={busy}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSPORT_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex flex-col items-start">
                        <span>{t.label}</span>
                        <span className="text-[10px] text-muted-foreground">{t.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(transport === "http" || transport === "sse") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Endpoint URL</Label>
                <Input
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://mcp.example.com/v1"
                  className="font-mono text-sm h-9"
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                />
                <p className="text-[11px] text-muted-foreground">
                  For OAuth-discovery servers, leave blank if the URL comes from
                  the OAuth metadata document.
                </p>
              </div>
            )}
            {transport === "stdio" && (
              <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-warning flex-shrink-0" />
                <div>
                  stdio servers are configured per-variant in <code>tool_mcp_config</code>{" "}
                  (command, args, npm/pip package). Add at least one config row
                  after creation for the server to be usable.
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Auth strategy</Label>
              <Select value={authStrategy} onValueChange={(v) => setAuthStrategy(v as ProvisionMcpServerInput["authStrategy"])} disabled={busy}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTH_OPTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      <div className="flex flex-col items-start">
                        <span>{a.label}</span>
                        <span className="text-[10px] text-muted-foreground">{a.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Docs URL (optional)</Label>
                <Input
                  value={docsUrl}
                  onChange={(e) => setDocsUrl(e.target.value)}
                  className="text-sm h-9"
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Website URL (optional)</Label>
                <Input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="text-sm h-9"
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                />
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Step 3 of 3 — review &amp; provision. Five rows will be inserted in
              one transaction.
            </p>
            <div className="rounded-md border border-border bg-card divide-y divide-border text-xs">
              <ReviewRow label="Server" value={`${name} (${slug})`} />
              <ReviewRow label="Vendor" value={vendor} />
              <ReviewRow label="Category" value={category} />
              <ReviewRow label="Transport" value={transport} />
              <ReviewRow label="Auth" value={authStrategy} />
              {endpointUrl && <ReviewRow label="Endpoint" value={endpointUrl} mono />}
              <ReviewRow label="Will create" value={`mcp.${slug} executor kind, ${slug} system bundle, bundle:list_${slug} lister tool`} />
            </div>
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} disabled={busy} />
              <div>
                <Label className="text-xs">Auto-fetch catalog after provision</Label>
                <p className="text-[11px] text-muted-foreground">
                  Calls <code className="bg-background px-1 rounded">/api/mcp/servers/&lt;id&gt;/refresh</code>{" "}
                  immediately after the rows are inserted. Disable if the server
                  isn't reachable yet.
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {step !== "identity" && (
              <Button
                variant="outline"
                onClick={() =>
                  setStep(step === "transport" ? "identity" : "transport")
                }
                disabled={busy}
                className="gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
            )}
            {step === "identity" && (
              <Button
                onClick={() => setStep("transport")}
                disabled={busy || !identityValid}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {step === "transport" && (
              <Button
                onClick={() => setStep("review")}
                disabled={busy || !transportValid}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {step === "review" && (
              <Button onClick={() => void onProvision()} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Provision server"
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="px-3 py-2 grid grid-cols-[140px_1fr] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}

function ResultRow({
  label,
  value,
  subtle,
  href,
}: {
  label: string;
  value: string;
  subtle?: string;
  href?: string;
}) {
  return (
    <div className="px-3 py-2 grid grid-cols-[140px_1fr] gap-3 items-start">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">
        {href ? (
          <a href={href} className="font-mono text-foreground hover:text-primary hover:underline">
            {value}
          </a>
        ) : (
          <code className="font-mono text-foreground">{value}</code>
        )}
        {subtle && (
          <Badge variant="outline" className="ml-1.5 text-[10px] font-mono">
            {subtle.slice(0, 8)}…
          </Badge>
        )}
      </div>
    </div>
  );
}
