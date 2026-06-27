"use client";

// Webhooks management surface. Register an HTTPS endpoint, choose which events
// to receive, see delivery health. CRUD is direct against the files schema
// (owner RLS); delivery runs DB-side (files.webhook_* pipeline).

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  RotateCw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  rotateWebhookSecret,
  updateWebhook,
} from "../service";
import { WEBHOOK_EVENT_CATALOGUE, type Webhook, type WebhookDelivery } from "../types";

function SecretReveal({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">Signing secret — copy it now, it won't be shown again</p>
        <code className="block truncate text-xs text-muted-foreground">{secret}</code>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(secret);
          setCopied(true);
          toast.success("Secret copied");
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

function DeliveryRow({ d }: { d: WebhookDelivery }) {
  const icon =
    d.status === "delivered" ? (
      <CircleCheck className="size-3.5 text-emerald-500" />
    ) : d.status === "pending" ? (
      <Clock className="size-3.5 text-muted-foreground" />
    ) : (
      <CircleAlert className="size-3.5 text-red-500" />
    );
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      {icon}
      <span className="w-16 capitalize text-foreground">{d.status}</span>
      <span className="w-14 text-muted-foreground">{d.http_status ?? "—"}</span>
      <span className="flex-1 truncate text-muted-foreground">
        {d.error_message ?? `attempt ${d.attempt}`}
      </span>
      <span className="text-muted-foreground">
        {new Date(d.created_at).toLocaleString()}
      </span>
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

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this webhook?",
      description: webhook.target_url,
      confirmText: "Delete",
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

  const disabled = webhook.consecutive_failures >= webhook.max_consecutive_failures;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="truncate text-sm font-medium text-foreground">{webhook.target_url}</code>
            {disabled && <Badge variant="destructive">auto-disabled</Badge>}
          </div>
          {webhook.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{webhook.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
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
              <span className="text-red-500">{webhook.consecutive_failures} consecutive failures</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={webhook.is_active} onCheckedChange={toggleActive} aria-label="Active" />
          <Button size="icon" variant="ghost" onClick={handleRotate} title="Rotate signing secret">
            <RotateCw className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleDelete} title="Delete webhook">
            <Trash2 className="size-4 text-red-500" />
          </Button>
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
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        Recent deliveries
      </button>
      {expanded && (
        <div className="mt-2 border-t border-border pt-2">
          {deliveries === null ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : deliveries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No deliveries yet.</p>
          ) : (
            deliveries.map((d) => <DeliveryRow key={d.id} d={d} />)
          )}
        </div>
      )}
    </div>
  );
}

export function WebhooksManager() {
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [allEvents, setAllEvents] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [justCreatedSecret, setJustCreatedSecret] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setWebhooks(await listWebhooks());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load webhooks");
      setWebhooks([]);
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
      const created = await createWebhook({
        target_url: url.trim(),
        description: description.trim() || null,
        event_types: allEvents ? null : Array.from(selected),
      });
      setJustCreatedSecret(created.secret);
      setUrl("");
      setDescription("");
      setSelected(new Set());
      setAllEvents(true);
      setCreating(false);
      toast.success("Webhook created");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WebhookIcon className="size-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Webhooks</h1>
        </div>
        <Button size="sm" onClick={() => setCreating((c) => !c)}>
          <Plus className="size-4" /> New webhook
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Get a signed HTTPS callback when your events fire — a file is shared, a
        long-running job finishes, and more. Each delivery is signed with{" "}
        <code className="text-xs">X-Matrx-Signature: sha256=…</code> (HMAC of the
        body using your secret).
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
                {WEBHOOK_EVENT_CATALOGUE.map((ev) => (
                  <label key={ev.value} className="flex items-center gap-2 text-sm">
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
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={submitting || (!allEvents && selected.size === 0)}
            >
              Create webhook
            </Button>
          </div>
        </div>
      )}

      {webhooks === null ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <WebhookIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No webhooks yet</p>
          <p className="text-sm text-muted-foreground">
            Create one to start receiving event callbacks.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w) => (
            <WebhookCard
              key={w.id}
              webhook={w}
              onChange={(updated) =>
                setWebhooks((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))
              }
              onDelete={(id) => setWebhooks((prev) => (prev ?? []).filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
