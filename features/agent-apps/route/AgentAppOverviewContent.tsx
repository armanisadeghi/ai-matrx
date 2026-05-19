"use client";

/**
 * AgentAppOverviewContent — main /agent-apps/[id] page body.
 *
 * Reads from Redux (hydrated by AgentAppHydratorServer in the layout). Shows
 * the app at a glance and routes the user to the right sub-route for each
 * action: code editing, settings, version history, run.
 *
 * Layout intent:
 *   - One cohesive hero block at the top (icon + name + tagline + description
 *     + public URL). No duplicate identity strip below it.
 *   - A single labeled pills row right under the hero. Every pill says what
 *     it is — "Status: Published", "Agent: Tutor" — never bare values.
 *   - Stat strip with clear labels.
 *   - Cards below cover non-obvious things only (agent binding details, code
 *     summary). The hero already shows the obvious identity fields.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AppWindow,
  Archive,
  ArrowRight,
  Check,
  Code,
  Copy,
  ExternalLink,
  Eye,
  Folder,
  Globe,
  History,
  Layers,
  Lock,
  Settings as SettingsIcon,
  ShieldCheck,
  Zap,
  Tag,
  Variable,
  Webhook,
  type LucideIcon
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/lib/toast-service";
import { cn } from "@/lib/utils";
import { InlineMediaRef } from "@/features/files";
import { siteConfig } from "@/config/extras/site";
import { selectAppById } from "@/features/agents/redux/agent-apps/selectors";
import {
  selectAgentById,
  selectAgentContextSlots,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";

interface AgentAppOverviewContentProps {
  appId: string;
}

function StatChip({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent: string;
}) {
  const isZero =
    value === 0 || value === "0" || value === "—" || value === "0%";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs",
        isZero && "opacity-50",
      )}
    >
      <Icon className={cn("w-3.5 h-3.5", accent)} />
      <span className="tabular-nums font-medium">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function formatNumber(n: number | null | undefined): string {
  if (!n || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - +new Date(iso);
  if (Number.isNaN(ms)) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.round(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

interface LabeledPillProps {
  label: string;
  children: React.ReactNode;
  icon?: LucideIcon;
  accent?: string;
}

/**
 * Pill that always shows what it represents. "Status: Published", not just
 * a "Published" badge floating with no context.
 */
function LabeledPill({ label, children, icon: Icon, accent }: LabeledPillProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/60 text-xs">
      {Icon && (
        <Icon className={cn("w-3 h-3 shrink-0", accent ?? "text-muted-foreground")} />
      )}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{children}</span>
    </span>
  );
}

export function AgentAppOverviewContent({ appId }: AgentAppOverviewContentProps) {
  const dispatch = useAppDispatch();
  const app = useAppSelector((state) => selectAppById(state, appId));
  const agent = useAppSelector((state) =>
    app?.agent_id ? selectAgentById(state, app.agent_id) : undefined,
  );
  const agentVariables = useAppSelector((state) =>
    app?.agent_id ? selectAgentVariableDefinitions(state, app.agent_id) : null,
  );
  const agentContextSlots = useAppSelector((state) =>
    app?.agent_id ? selectAgentContextSlots(state, app.agent_id) : null,
  );

  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  /**
   * Open the agent in a window panel — keeps the user on the app page
   * instead of route-navigating away to /agents/[id]. The advanced editor
   * window is the most complete agent surface today.
   */
  const handleOpenAgent = () => {
    if (!app?.agent_id) return;
    dispatch(
      openOverlay({
        overlayId: "agentAdvancedEditorWindow",
        data: {
          initialAgentId: app.agent_id,
          initialTab: "overview",
          tabs: null,
        },
      }),
    );
  };

  if (!app) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading app…
      </div>
    );
  }

  const publicUrl = `${siteConfig.url}/p/${app.slug}`;
  const codeHref = `/agent-apps/${app.id}/code`;
  const settingsHref = `/agent-apps/${app.id}/settings`;
  const versionsHref = `/agent-apps/${app.id}/versions`;
  const runHref = `/agent-apps/${app.id}/run`;

  const variableCount = agentVariables?.length ?? 0;
  const contextSlotCount = agentContextSlots?.length ?? 0;
  const successPct =
    typeof app.success_rate === "number"
      ? `${Math.round(app.success_rate * 100)}%`
      : "—";

  const codeLines =
    typeof app.component_code === "string"
      ? app.component_code.split("\n").length
      : 0;
  const allowedImportsCount = Array.isArray(app.allowed_imports)
    ? (app.allowed_imports as unknown[]).length
    : 0;

  const statusLabel =
    app.status.charAt(0).toUpperCase() + app.status.slice(1);
  const visibilityLabel = app.is_public ? "Public" : "Private";

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="max-w-4xl mx-auto px-6 pb-10 pt-6 space-y-6">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div className="flex items-start gap-5">
          <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-primary/10 text-primary inline-flex items-center justify-center">
            <InlineMediaRef
              ref={app.favicon_url ?? null}
              size={{ width: 48, height: 48 }}
              fit="cover"
              rounded="lg"
              fallbackIcon={<AppWindow className="w-7 h-7" />}
              alt=""
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="text-3xl font-bold tracking-tight leading-tight text-foreground">
              {app.name}
            </h1>
            {app.tagline && (
              <p className="text-base text-muted-foreground leading-snug">
                {app.tagline}
              </p>
            )}
          </div>
        </div>

        {app.description && (
          <p className="text-sm text-muted-foreground/90 leading-relaxed max-w-3xl">
            {app.description}
          </p>
        )}

        {/* Public URL — full, copyable, opens in new tab */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border/60 max-w-3xl">
          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Public URL:
          </span>
          <Link
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-mono text-foreground hover:text-primary transition-colors truncate flex-1"
            title={publicUrl}
          >
            {publicUrl}
          </Link>
          <button
            type="button"
            onClick={() => handleCopy("url", publicUrl, "Public URL copied")}
            className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Copy public URL"
            title="Copy"
          >
            {copied === "url" ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* ── Labeled pills — every value says what it is ─────────────── */}
        <div className="flex flex-wrap gap-2">
          <LabeledPill label="Status" icon={Zap} accent="text-amber-500">
            {statusLabel}
          </LabeledPill>
          <LabeledPill
            label="Visibility"
            icon={app.is_public ? Globe : Lock}
            accent={
              app.is_public
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            }
          >
            {visibilityLabel}
          </LabeledPill>
          {agent ? (
            <button
              type="button"
              onClick={handleOpenAgent}
              title="Open agent in a window panel (stay on this page)"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/60 text-xs hover:bg-muted hover:border-primary/40 transition-colors active:scale-95"
            >
              <Webhook className="w-3 h-3 shrink-0 text-blue-500" />
              <span className="text-muted-foreground">Agent:</span>
              <span className="font-medium text-foreground">{agent.name}</span>
              {!app.use_latest && app.agent_version_id && (
                <span className="text-muted-foreground/70 text-[10px] uppercase tracking-wide">
                  pinned
                </span>
              )}
              {app.use_latest && (
                <span className="text-amber-600 dark:text-amber-400 text-[10px] uppercase tracking-wide">
                  latest
                </span>
              )}
            </button>
          ) : (
            <LabeledPill label="Agent" icon={Webhook}>
              —
            </LabeledPill>
          )}
          {app.category && (
            <LabeledPill label="Category" icon={Folder}>
              {app.category}
            </LabeledPill>
          )}
          {app.is_featured && (
            <LabeledPill label="Featured" icon={Zap} accent="text-amber-500">
              Yes
            </LabeledPill>
          )}
          {app.is_verified && (
            <LabeledPill
              label="Verified"
              icon={ShieldCheck}
              accent="text-blue-500"
            >
              Yes
            </LabeledPill>
          )}
          {app.status === "archived" && (
            <LabeledPill label="Archived" icon={Archive}>
              Yes
            </LabeledPill>
          )}
        </div>

        {app.tags && app.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Tags:</span>
            {app.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* ── Action row — all secondary on the overview, since the user is
              already inside this app's surface. The tab strip in the header
              owns "selected sub-route" visual state. ─────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={runHref}>
              <Eye className="w-3.5 h-3.5" /> Run
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> Open public
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={codeHref}>
              <Code className="w-3.5 h-3.5" /> Edit code
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={settingsHref}>
              <SettingsIcon className="w-3.5 h-3.5" /> Settings
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={versionsHref}>
              <History className="w-3.5 h-3.5" /> Versions
            </Link>
          </Button>
        </div>

        <Separator />

        {/* ── Stat strip (with clear labels) ──────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 rounded-md bg-muted/30 border border-border/50">
          <StatChip
            icon={ArrowRight}
            label="runs"
            value={formatNumber(app.total_executions)}
            accent="text-primary"
          />
          <StatChip
            icon={ShieldCheck}
            label="success"
            value={successPct}
            accent="text-emerald-500"
          />
          <StatChip
            icon={Layers}
            label="variables"
            value={variableCount}
            accent="text-purple-500"
          />
          {app.unique_users_count != null && (
            <StatChip
              icon={Webhook}
              label="users"
              value={formatNumber(app.unique_users_count)}
              accent="text-cyan-500"
            />
          )}
          <StatChip
            icon={History}
            label="last run"
            value={formatRelative(app.last_execution_at)}
            accent="text-muted-foreground"
          />
          {typeof app.total_cost === "number" && app.total_cost > 0 && (
            <StatChip
              icon={Zap}
              label="cost"
              value={`$${app.total_cost.toFixed(2)}`}
              accent="text-amber-500"
            />
          )}
        </div>

        {/* ── Agent binding card (more detail than the pill) ──────────── */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">Agent binding</CardTitle>
            <button
              type="button"
              onClick={handleOpenAgent}
              className="text-xs text-primary hover:underline"
            >
              Open agent
            </button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV label="Agent" value={agent?.name ?? "—"} />
            <KV
              label="Version"
              value={
                app.use_latest
                  ? "Latest"
                  : app.agent_version_id
                    ? app.agent_version_id
                    : "—"
              }
              mono={!app.use_latest && !!app.agent_version_id}
            />
          </CardContent>
        </Card>

        {/* ── Variables (from the agent definition) ───────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Variable className="w-4 h-4 text-purple-500" />
              Variables
              <span className="text-xs font-normal text-muted-foreground">
                ({variableCount})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {variableCount === 0 ? (
              <div className="text-sm text-muted-foreground">—</div>
            ) : (
              <div className="grid gap-2">
                {agentVariables!.map((v) => {
                  const widget = v.customComponent;
                  const widgetLabel = widget?.type ?? null;
                  const options = widget?.options ?? null;
                  return (
                    <div
                      key={v.name}
                      className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/40"
                    >
                      <code className="text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                        {`{{${v.name}}}`}
                      </code>
                      <div className="flex-1 min-w-0 text-sm space-y-0.5">
                        {v.helpText && (
                          <div className="text-foreground/90 break-words">
                            {v.helpText}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {widgetLabel && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono"
                            >
                              {widgetLabel}
                            </Badge>
                          )}
                          {Array.isArray(options) && options.length > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                            >
                              {options.length} options
                            </Badge>
                          )}
                          {v.defaultValue !== undefined &&
                            v.defaultValue !== null &&
                            String(v.defaultValue) !== "" && (
                              <span className="font-mono text-foreground/70">
                                = {String(v.defaultValue)}
                              </span>
                            )}
                        </div>
                      </div>
                      {v.required && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          required
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Context slots (from the agent definition) ───────────────── */}
        {contextSlotCount > 0 && agentContextSlots && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-500" />
                Context slots
                <span className="text-xs font-normal text-muted-foreground">
                  ({contextSlotCount})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {agentContextSlots.map((slot, i) => (
                  <div
                    key={slot.key ?? i}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/40"
                  >
                    <code className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 shrink-0">
                      {slot.key}
                    </code>
                    <div className="flex-1 min-w-0 text-sm space-y-0.5">
                      {slot.label && (
                        <div className="text-foreground/90">{slot.label}</div>
                      )}
                      {slot.description && (
                        <div className="text-muted-foreground/80 text-xs break-words">
                          {slot.description}
                        </div>
                      )}
                    </div>
                    {slot.type && (
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                      >
                        {slot.type}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Code summary card with link to /code ────────────────────── */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">Code</CardTitle>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={codeHref}>
                <Code className="w-3.5 h-3.5" /> Open editor
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <KV label="Language" value={app.component_language} />
            <KV
              label="Lines"
              value={codeLines > 0 ? String(codeLines) : "—"}
              dim
            />
            <KV
              label="Allowed imports"
              value={
                allowedImportsCount > 0
                  ? `${allowedImportsCount} packages`
                  : "—"
              }
              dim
            />
          </CardContent>
        </Card>

        {/* Created/Updated timestamps as a quiet footer */}
        <p className="text-xs text-muted-foreground/70 pt-2">
          Created {formatRelative(app.created_at)} · Updated{" "}
          {formatRelative(app.updated_at)}
        </p>
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  mono,
  dim,
}: {
  label: string;
  value: string;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground/80 font-medium pt-0.5">
        {label}
      </div>
      <div
        className={cn(
          mono && "font-mono text-xs",
          dim && "text-muted-foreground",
          "break-words",
        )}
      >
        {value}
      </div>
    </div>
  );
}
