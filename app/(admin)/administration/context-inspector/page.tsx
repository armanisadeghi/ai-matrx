"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Braces, Check, ChevronsUpDown, Copy, Loader2, Play, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ScopeSystemTier = "overview" | "scope" | "scope_type" | "context_item";
type ScopeSystemVariation = "a1" | "a2" | "fk_a" | "fk_b" | "d_elements" | "d_attributes";

interface RenderResponse {
  raw: string;
  byteLength: number;
  status: number;
  contentType: string | null;
  metadata: Record<string, unknown> | null;
}

interface OrganizationOption {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
}

const TIER_OPTIONS: Array<{ value: ScopeSystemTier; label: string; help: string }> = [
  { value: "overview", label: "Tier A — overview", help: "Organization-wide always-on context." },
  { value: "scope", label: "Tier B — scope", help: "One scope's current values." },
  { value: "scope_type", label: "Tier C — scope type", help: "Type definition, items, and scope roster." },
  { value: "context_item", label: "Tier D — context item", help: "One context-item definition." },
];

const VARIATION_OPTIONS: Array<{ value: ScopeSystemVariation; label: string; tiers: ScopeSystemTier[] }> = [
  { value: "a1", label: "A-1 compact identifiers", tiers: ["overview"] },
  { value: "a2", label: "A-2 labels and names", tiers: ["overview"] },
  { value: "fk_a", label: "FK-A write-tool parameter names", tiers: ["scope", "scope_type", "context_item"] },
  { value: "fk_b", label: "FK-B database column names", tiers: ["scope", "scope_type", "context_item"] },
  { value: "d_elements", label: "D child elements", tiers: ["context_item"] },
  { value: "d_attributes", label: "D flat attributes", tiers: ["context_item"] },
];

function defaultVariation(tier: ScopeSystemTier): ScopeSystemVariation {
  return tier === "overview" ? "a1" : tier === "context_item" ? "d_elements" : "fk_a";
}

function parseMetadata(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractRendered(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const rendered = (parsed as Record<string, unknown>).rendered;
    return typeof rendered === "string" ? rendered : null;
  } catch {
    return null;
  }
}

function metadataValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  return "object";
}

export default function ContextInspectorPage() {
  const [tier, setTier] = useState<ScopeSystemTier>("overview");
  const [variation, setVariation] = useState<ScopeSystemVariation>("a1");
  const [organizationId, setOrganizationId] = useState("");
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [organizationsError, setOrganizationsError] = useState<string | null>(null);
  const [organizationPickerOpen, setOrganizationPickerOpen] = useState(false);
  const [scopeTypeSlug, setScopeTypeSlug] = useState("");
  const [scopeSlug, setScopeSlug] = useState("");
  const [itemKey, setItemKey] = useState("");
  const [clearance, setClearance] = useState("internal");
  const [response, setResponse] = useState<RenderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const currentTier =
    TIER_OPTIONS.find((option) => option.value === tier) ?? TIER_OPTIONS[0];
  const variationOptions = useMemo(
    () => VARIATION_OPTIONS.filter((option) => option.tiers.includes(tier)),
    [tier],
  );
  const selectedOrganization = organizations.find((organization) => organization.id === organizationId);

  useEffect(() => {
    let cancelled = false;

    const loadOrganizations = async () => {
      try {
        const result = await fetch("/api/admin/agent-context/organizations", {
          cache: "no-store",
        });
        const payload = await result.json() as {
          organizations?: OrganizationOption[];
          error?: unknown;
          detail?: unknown;
        };
        if (!result.ok) {
          throw new Error(
            typeof payload.error === "string"
              ? payload.error
              : typeof payload.detail === "string"
                ? payload.detail
                : "Unable to load organizations.",
          );
        }
        if (!cancelled) setOrganizations(payload.organizations ?? []);
      } catch (caught) {
        if (!cancelled) {
          setOrganizationsError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) setOrganizationsLoading(false);
      }
    };

    void loadOrganizations();
    return () => { cancelled = true; };
  }, []);

  const runRender = useCallback(async () => {
    if (!organizationId.trim()) {
      setError("Select an organization before rendering context.");
      return;
    }
    if (tier === "scope" && (!scopeTypeSlug.trim() || !scopeSlug.trim())) {
      setError("Scope type slug and scope slug are required for Tier B.");
      return;
    }
    if (tier === "scope_type" && !scopeTypeSlug.trim()) {
      setError("Scope type slug is required for Tier C.");
      return;
    }
    if (tier === "context_item" && (!scopeTypeSlug.trim() || !itemKey.trim())) {
      setError("Scope type slug and context-item key are required for Tier D.");
      return;
    }

    setError(null);
    setResponse(null);
    setRunning(true);

    const body = {
      target: {
        kind: "scope_system",
        tier,
        variation,
        ...(scopeTypeSlug.trim() ? { scope_type_slug: scopeTypeSlug.trim() } : {}),
        ...(scopeSlug.trim() ? { scope_slug: scopeSlug.trim() } : {}),
        ...(itemKey.trim() ? { item_key: itemKey.trim() } : {}),
      },
      invocation: {
        organization_id: organizationId.trim(),
        clearance,
      },
    };

    try {
      const result = await fetch("/api/admin/agent-context/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const bytes = await result.arrayBuffer();
      const raw = new TextDecoder("utf-8").decode(bytes);
      const renderedResponse = {
        raw: result.ok ? (extractRendered(raw) ?? raw) : raw,
        byteLength: bytes.byteLength,
        status: result.status,
        contentType: result.headers.get("content-type"),
        metadata: parseMetadata(raw),
      };

      if (!result.ok) {
        let message = raw || result.statusText;
        try {
          const parsed = JSON.parse(raw) as { error?: unknown; detail?: unknown };
          if (typeof parsed.error === "string") message = parsed.error;
          else if (typeof parsed.detail === "string") message = parsed.detail;
        } catch {
          // Preserve a non-JSON upstream error exactly in the raw error panel.
        }
        setResponse(renderedResponse);
        setError(message);
        return;
      }

      setResponse(renderedResponse);
      toast.success("Context rendered from the live serializer.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [clearance, itemKey, organizationId, scopeSlug, scopeTypeSlug, tier, variation]);

  const copyRaw = useCallback(async () => {
    if (!response) return;
    await navigator.clipboard.writeText(response.raw);
    toast.success("Exact rendered response copied.");
  }, [response]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-3 p-3 sm:p-5">
      <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Braces className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Context Inspector</h1>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <ShieldCheck className="h-3 w-3" /> Super admin
            </Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Calls the live aidream renderer and displays its response without client-side JSON reserialization.
          </p>
        </div>
        <Button onClick={runRender} disabled={running} className="gap-2 sm:mt-0">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Render context
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Scope system target</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Organization</Label>
            <Popover open={organizationPickerOpen} onOpenChange={setOrganizationPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={organizationPickerOpen}
                  className="w-full justify-between font-normal"
                  disabled={organizationsLoading || Boolean(organizationsError)}
                >
                  {organizationsLoading ? (
                    <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading organizations…</span>
                  ) : selectedOrganization ? (
                    <span className="truncate">{selectedOrganization.name} <span className="text-muted-foreground">· {selectedOrganization.slug}</span></span>
                  ) : (
                    <span className="text-muted-foreground">Select an organization…</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search organizations…" />
                  <CommandList className="max-h-72">
                    <CommandEmpty>No accessible organizations found.</CommandEmpty>
                    <CommandGroup>
                      {organizations.map((organization) => (
                        <CommandItem
                          key={organization.id}
                          value={`${organization.name} ${organization.slug}`}
                          onSelect={() => {
                            setOrganizationId(organization.id);
                            setOrganizationPickerOpen(false);
                          }}
                        >
                          <Check className={cn("h-4 w-4", organization.id === organizationId ? "opacity-100" : "opacity-0")} />
                          <span className="min-w-0 truncate">{organization.name}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{organization.slug}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {organizationsError && <p className="text-xs text-destructive">{organizationsError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Tier</Label>
            <Select value={tier} onValueChange={(next: ScopeSystemTier) => {
              setTier(next);
              setVariation(defaultVariation(next));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIER_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{currentTier.help}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Serializer variation</Label>
            <Select value={variation} onValueChange={(next: ScopeSystemVariation) => setVariation(next)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{variationOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scope-type-slug">Scope type slug</Label>
            <Input id="scope-type-slug" value={scopeTypeSlug} onChange={(event) => setScopeTypeSlug(event.target.value)} placeholder="clients" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scope-slug">Scope slug</Label>
            <Input id="scope-slug" value={scopeSlug} onChange={(event) => setScopeSlug(event.target.value)} placeholder="ai-matrx" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-key">Context-item key</Label>
            <Input id="item-key" value={itemKey} onChange={(event) => setItemKey(event.target.value)} placeholder="brand_voice" />
          </div>
          <div className="space-y-1.5">
            <Label>Clearance</Label>
            <Select value={clearance} onValueChange={setClearance}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
                <SelectItem value="privileged">Privileged</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="whitespace-pre-wrap break-words font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {response && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-sm">Renderer response</CardTitle>
              <p className="mt-1 text-[11px] text-muted-foreground">
                HTTP {response.status} · {response.byteLength.toLocaleString()} transport bytes · {response.contentType ?? "unknown content type"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={copyRaw} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copy exact text
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {response.metadata && Object.keys(response.metadata).length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
                {Object.entries(response.metadata).map(([key, value]) => (
                  <div key={key} className="min-w-0"><span className="text-muted-foreground">{key}: </span><span className="font-mono break-words">{metadataValue(value)}</span></div>
                ))}
              </div>
            )}
            <Textarea
              aria-label="Raw renderer response"
              readOnly
              value={response.raw}
              className="min-h-[28rem] resize-y whitespace-pre-wrap break-words bg-background font-mono text-xs leading-5"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
