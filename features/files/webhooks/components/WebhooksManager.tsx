"use client";

// Webhooks management surface. Register an HTTPS endpoint, choose which events
// to receive, see delivery health. CRUD is direct against the files schema
// (owner RLS); delivery runs DB-side (files.webhook_* pipeline).

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { presentOrganizationRefusal } from "@ai-matrx/chat/host/org";
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  RotateCw,
  Send,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Building2,
  RefreshCw,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
} from "@/lib/redux/slices/appContextSlice";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityScopeTabs, scopeKindLabel } from "@/lib/entity-list/components/EntityScopeTabs";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { useLaneParam } from "@/lib/entity-list/useLaneParam";
import { laneCounts, laneIds, type LaneRow } from "@/lib/entity-list/laneRows";
import { makeScope, withStandardLanes, type LaneSupport, type ListScopeKind } from "@/lib/list-scope/types";
import { listTablesEverywhere, type UserTableListItem } from "@/features/data-tables/service";
import {
  createWebhook,
  declareTableWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhookLanes,
  listWebhooks,
  redeliverWebhookDelivery,
  rotateWebhookSecret,
  sendTestWebhook,
  updateWebhook,
} from "../service";
import {
  TABLE_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_CATALOGUE,
  type Webhook,
  type WebhookDelivery,
} from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

function SecretReveal({ secret }: { secret: string }) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          Signing secret — copy it now, it won't be shown again
        </p>
        <code className="block truncate text-xs text-muted-foreground">
          {secret}
        </code>
      </div>
      <Button
        variant="outline"
        onClick={async () => {
          if (!(await copyText(secret, "Secret copied"))) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

function DeliveryRow({
  d,
  onRefresh,
}: {
  d: WebhookDelivery;
  onRefresh: () => void;
}) {
  const [redelivering, setRedelivering] = useState(false);
  const icon =
    d.status === "delivered" ? (
      <CircleCheck className="size-3.5 text-emerald-500" />
    ) : d.status === "pending" ? (
      <Clock className="size-3.5 text-muted-foreground" />
    ) : (
      <CircleAlert className="size-3.5 text-red-500" />
    );

  const handleRedeliver = async () => {
    setRedelivering(true);
    try {
      await redeliverWebhookDelivery(d.id);
      toast.success("Redelivery sent — it will settle within ~30s");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Redeliver failed");
    } finally {
      setRedelivering(false);
    }
  };

  // Manual redeliver applies to SETTLED real-event deliveries. Test pings
  // (no activity_log_id) are re-sent via the webhook's Send test button.
  const canRedeliver = d.status !== "pending" && d.activity_log_id !== null;

  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      {icon}
      <span className="w-16 capitalize text-foreground">{d.status}</span>
      <span className="w-14 text-muted-foreground">{d.http_status ?? "—"}</span>
      <span
        className="w-16 text-muted-foreground"
        title="Request → response latency"
      >
        {d.latency_ms !== null ? `${d.latency_ms} ms` : "—"}
      </span>
      <span className="flex-1 truncate text-muted-foreground">
        {d.error_message ?? `attempt ${d.attempt}`}
      </span>
      <span className="text-muted-foreground">
        {new Date(d.created_at).toLocaleString()}
      </span>
      {canRedeliver && (
        <Button
          icon={<RefreshCw
            className={`size-3.5 ${redelivering ? "animate-spin" : ""}`}
          />} aria-label="Redeliver this event now"
          variant="quiet"
          disabled={redelivering}
          onClick={handleRedeliver}
          title="Redeliver this event now"
        />
      )}
    </div>
  );
}

function WebhookCard({
  webhook,
  onChange,
  onDelete,
}: {
  webhook: Webhook;
  onChange: (w: Webhook) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);
  const [rotated, setRotated] = useState<string | null>(null);

  const loadDeliveries = useCallback(async () => {
    try {
      setDeliveries(await listDeliveries(webhook.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load deliveries");
    }
  }, [webhook.id]);

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && deliveries === null) void loadDeliveries();
  };

  const toggleActive = async (is_active: boolean) => {
    try {
      onChange(await updateWebhook(webhook.id, { is_active }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const handleRotate = async () => {
    try {
      setRotated(await rotateWebhookSecret(webhook.id));
      toast.success("Secret rotated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rotate failed");
    }
  };

  const handleTest = async () => {
    try {
      await sendTestWebhook(webhook.id);
      toast.success("Test event sent — watch Recent deliveries");
      setExpanded(true);
      // Give the delivery a moment to be recorded, then refresh the list.
      setTimeout(() => void loadDeliveries(), 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this webhook?",
      description: webhook.target_url,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteWebhook(webhook.id);
      onDelete(webhook.id);
      toast.success("Webhook deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const disabled =
    webhook.consecutive_failures >= webhook.max_consecutive_failures;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="truncate text-sm font-medium text-foreground">
              {webhook.target_url}
            </code>
            {disabled && <Badge variant="destructive">auto-disabled</Badge>}
          </div>
          {webhook.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {webhook.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {webhook.organization_id !== null && (
              <Badge variant="secondary" className="gap-1">
                <Building2 className="size-3" /> Org-wide
              </Badge>
            )}
            {webhook.event_types === null ? (
              <Badge variant="secondary">All events</Badge>
            ) : (
              webhook.event_types.map((t) => (
                <Badge key={t} variant="outline" className="text-xs">
                  {t}
                </Badge>
              ))
            )}
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              {webhook.last_success_at
                ? `Last delivered ${new Date(webhook.last_success_at).toLocaleString()}`
                : "No successful delivery yet"}
            </span>
            {webhook.consecutive_failures > 0 && (
              <span className="text-red-500">
                {webhook.consecutive_failures} consecutive failures
                <ErrorAlchemyMenu error={webhook.consecutive_failures} />
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={webhook.is_active}
            onCheckedChange={toggleActive}
            aria-label="Active"
          />
          <Button
            icon={<Send />} aria-label="Send a test event to this endpoint"
            variant="quiet"
            onClick={handleTest}
            title="Send a test event to this endpoint"
          />
          <Button
            icon={<RotateCw />} aria-label="Rotate signing secret"
            variant="quiet"
            onClick={handleRotate}
            title="Rotate signing secret"
          />
          <Button
            icon={<Trash2 className="text-red-500" />} aria-label="Delete webhook"
            variant="quiet"
            onClick={handleDelete}
            title="Delete webhook"
          />
        </div>
      </div>

      {rotated && (
        <div className="mt-3">
          <SecretReveal secret={rotated} />
        </div>
      )}

      <button
        onClick={toggleExpand}
        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        Recent deliveries
      </button>
      {expanded && (
        <div className="mt-2 border-t border-border pt-2">
          {deliveries === null ? (
            <p className="text-xs text-muted-foreground">
              <SuspenseLoader
                centered={false}
                size="xs"
                message="Loading webhook deliveries…"
              />
            </p>
          ) : deliveries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No deliveries yet.</p>
          ) : (
            deliveries.map((d) => (
              <DeliveryRow
                key={d.id}
                d={d}
                onRefresh={() => {
                  // Give the reconcile tick a moment, then refresh.
                  setTimeout(() => void loadDeliveries(), 600);
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** The lanes a webhook can sit in: no share path and no publish path, so no Shared or Public. */
const WEBHOOK_SCOPES: ListScopeKind[] = ["mine", "orgs"];
const WEBHOOK_LANE_SUPPORT: LaneSupport = { shared: false, public: false };
const WEBHOOK_LANES = withStandardLanes(WEBHOOK_SCOPES, { lanes: WEBHOOK_LANE_SUPPORT });

export function WebhooksManager() {
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null);
  // The list header: lane (`?scope=`, opens on All via `lists.landing_tab/webhooks`) and the
  // organization filter (`?org_filter=`). Never the active organization.
  const [lane, setLane] = useLaneParam("webhooks", WEBHOOK_LANES);
  const [orgFilter, setOrgFilter] = useOrgFilterParam([]);
  const [laneRows, setLaneRows] = useState<LaneRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [allEvents, setAllEvents] = useState(true);
  const [orgWide, setOrgWide] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  // org-filter: write-target only the Org-wide checkbox files a new webhook in the working organization; the table list reads every organization
  const organizationId = useAppSelector(selectOrganizationId);
  const organizationName = useAppSelector(selectOrganizationName);
  const [justCreatedSecret, setJustCreatedSecret] = useState<string | null>(
    null,
  );
  // ONE CUSTOM TABLE (lane INTEG-CLIENTS, F19): a custom table's changes reach a
  // webhook only when the webhook names that table, so "what to listen to" is either the
  // catalogue below or one table. The list holds every custom table the person can open, in ANY of
  // their organizations (never narrowed by the active one); the webhook is filed in the chosen
  // table's OWN organization.
  const ALL_EVENTS_SCOPE = "__catalogue__";
  const [scope, setScope] = useState<string>(ALL_EVENTS_SCOPE);
  const [customTables, setCustomTables] = useState<UserTableListItem[] | null>(null);
  useEffect(() => {
    if (!creating || customTables !== null) return;
    void listTablesEverywhere().then((listed) =>
      setCustomTables(listed.success ? listed.data.filter((t) => t.store === "records") : []),
    );
  }, [creating, customTables]);
  const tableScoped = scope !== ALL_EVENTS_SCOPE;

  const reload = useCallback(async () => {
    try {
      const [rows, lanes] = await Promise.all([listWebhooks(), listWebhookLanes()]);
      setWebhooks(rows);
      setLaneRows(lanes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load webhooks");
      setWebhooks([]);
      setLaneRows(null);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    if (!/^https:\/\//i.test(url.trim())) {
      toast.error("Endpoint URL must start with https://");
      return;
    }
    setSubmitting(true);
    try {
      const scopedTable = tableScoped ? customTables?.find((t) => t.id === scope) : undefined;
      const tableOrganizationId = scopedTable?.organization_id ?? null;
      if (tableScoped && tableOrganizationId) {
        const made = await declareTableWebhook({
          organizationId: tableOrganizationId,
          tableId: scope,
          targetUrl: url.trim(),
          events: allEvents ? null : Array.from(selected),
          description: description.trim() || null,
        });
        setJustCreatedSecret(made.secret);
        setUrl("");
        setDescription("");
        setSelected(new Set());
        setAllEvents(true);
        setScope(ALL_EVENTS_SCOPE);
        setCreating(false);
        toast.success("Webhook created for the table");
        await reload();
        return;
      }
      const created = await createWebhook({
        target_url: url.trim(),
        description: description.trim() || null,
        organization_id: orgWide && organizationId ? organizationId : null,
        event_types: allEvents ? null : Array.from(selected),
      });
      setJustCreatedSecret(created.secret ?? null);
      setUrl("");
      setDescription("");
      setSelected(new Set());
      setAllEvents(true);
      setOrgWide(false);
      setCreating(false);
      toast.success("Webhook created");
      await reload();
    } catch (e) {
      // A webhook is filed in an organization; with none selected the create
      // asked (or could not ask) — say so with the remedy, never the kernel's sentence.
      if (presentOrganizationRefusal(e, { subject: "The webhook", act: "created" })) return;
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const counts = laneCounts(laneRows ?? [], WEBHOOK_LANES, orgFilter);
  const inLane = laneRows ? laneIds(laneRows, lane, orgFilter) : null;
  const shown = webhooks && inLane ? webhooks.filter((w) => inLane.has(w.id)) : webhooks;

  return (
    <div className="mx-auto max-w-3xl p-4 pt-[calc(var(--shell-header-h)+1rem)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <EntityScopeTabs
          scope={makeScope(lane)}
          scopes={WEBHOOK_SCOPES}
          lanes={WEBHOOK_LANE_SUPPORT}
          counts={counts}
          countsLoading={laneRows === null}
          onChange={(next) => setLane(next.kind)}
        />
        <div className="flex items-center gap-2">
          <EntityOrgFilter orgId={orgFilter} onChange={setOrgFilter} counts={counts} countsLoading={laneRows === null} />
          <Button icon={<Plus />} variant="primary" onClick={() => setCreating((c) => !c)}> New webhook
          </Button>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Get a signed HTTPS callback when your events fire — a file is shared, a
        long-running job finishes, and more. Each delivery is signed with{" "}
        <code className="text-xs">X-Matrx-Signature: sha256=…</code> (HMAC of
        the body using your secret).
      </p>

      {justCreatedSecret && (
        <div className="mb-4">
          <SecretReveal secret={justCreatedSecret} />
        </div>
      )}

      {creating && (
        <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
          <div>
            <Label htmlFor="wh-url">Endpoint URL</Label>
            <Input
              id="wh-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/matrx"
            />
          </div>
          <div>
            <Label htmlFor="wh-desc">Description (optional)</Label>
            <Input
              id="wh-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this endpoint for?"
            />
          </div>
          {organizationId && !tableScoped && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="wh-org"
                checked={orgWide}
                onCheckedChange={(v) => setOrgWide(Boolean(v))}
              />
              <Label htmlFor="wh-org" className="font-normal">
                Org-wide — also fire for events from anyone in{" "}
                <span className="font-medium">
                  {organizationName ?? "your organization"}
                </span>
              </Label>
            </div>
          )}
          {customTables && customTables.length > 0 && (
            <div>
              <Label htmlFor="wh-scope">Listen to</Label>
              <Select
                value={scope}
                onValueChange={(v) => {
                  setScope(v);
                  setSelected(new Set());
                }}
              >
                <SelectTrigger id="wh-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_EVENTS_SCOPE}>Your events (files, sharing, jobs, older tables)</SelectItem>
                  {customTables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      Every change to the table “{t.table_name}”
                      {t.organization_name ? ` (${t.organization_name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Checkbox
                id="wh-all"
                checked={allEvents}
                onCheckedChange={(v) => setAllEvents(Boolean(v))}
              />
              <Label htmlFor="wh-all">All event types</Label>
            </div>
            {!allEvents && (
              <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border p-2">
                {(tableScoped ? TABLE_WEBHOOK_EVENTS : WEBHOOK_EVENT_CATALOGUE).map((ev) => (
                  <label
                    key={ev.value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selected.has(ev.value)}
                      onCheckedChange={(v) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(ev.value);
                          else next.delete(ev.value);
                          return next;
                        })
                      }
                    />
                    {ev.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="quiet"
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={submitting || (!allEvents && selected.size === 0)}
            >
              Create webhook
            </Button>
          </div>
        </div>
      )}

      {shown === null ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : shown.length === 0 && webhooks !== null && webhooks.length > 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No webhooks in {scopeKindLabel(lane)}
        </p>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <WebhookIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No webhooks yet</p>
          <p className="text-sm text-muted-foreground">
            Create one to start receiving event callbacks.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((w) => (
            <WebhookCard
              key={w.id}
              webhook={w}
              onChange={(updated) =>
                setWebhooks((prev) =>
                  (prev ?? []).map((x) => (x.id === updated.id ? updated : x)),
                )
              }
              onDelete={(id) => {
                setWebhooks((prev) => (prev ?? []).filter((x) => x.id !== id));
                // The one-time secret banner belongs to a webhook that may now
                // be gone — clear it so it can't linger past deletion.
                setJustCreatedSecret(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
