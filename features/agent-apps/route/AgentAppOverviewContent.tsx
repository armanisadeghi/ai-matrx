"use client";

/**
 * AgentAppOverviewContent — main /agent-apps/[id] page body.
 *
 * Reads from Redux (hydrated by AgentAppHydratorServer in the layout). Shows
 * the app at a glance and routes the user to the right sub-route for each
 * action: code editing, settings, version history, run.
 *
 * Mirrors features/agents/route/AgentViewContent.tsx in tone (hero + pills +
 * stat strip + sections), tailored to app fields.
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
  Folder,
  Globe,
  History,
  Layers,
  Lock,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Tag,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/lib/toast-service";
import { cn } from "@/lib/utils";
import { selectAppById } from "@/features/agents/redux/agent-apps/selectors";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";

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

export function AgentAppOverviewContent({ appId }: AgentAppOverviewContentProps) {
  const app = useAppSelector((state) => selectAppById(state, appId));
  const agent = useAppSelector((state) =>
    app?.agent_id ? selectAgentById(state, app.agent_id) : undefined,
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

  if (!app) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading app…
      </div>
    );
  }

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/p/${app.slug}`
      : `/p/${app.slug}`;

  const codeHref = `/agent-apps/${app.id}/code`;
  const settingsHref = `/agent-apps/${app.id}/settings`;
  const versionsHref = `/agent-apps/${app.id}/versions`;

  const variableCount = Array.isArray(app.variable_schema)
    ? (app.variable_schema as unknown[]).length
    : 0;
  const successPct =
    typeof app.success_rate === "number"
      ? `${Math.round(app.success_rate * 100)}%`
      : "—";

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="max-w-5xl mx-auto px-4 pb-6 space-y-5">
        {/* Hero */}
        <div className="space-y-2 pt-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
              <AppWindow className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight leading-tight">
                {app.name}
              </h1>
              <button
                type="button"
                onClick={() => handleCopy("slug", app.slug, "Slug copied")}
                className="group inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                title="Copy slug"
              >
                <span>/p/{app.slug}</span>
                {copied === "slug" ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                )}
              </button>
            </div>
          </div>

          {app.tagline && (
            <p className="text-sm text-foreground/90">{app.tagline}</p>
          )}
          {app.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {app.description}
            </p>
          )}

          {/* Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge variant="secondary" className="gap-1 capitalize">
              <Sparkles className="w-3 h-3" /> {app.status}
            </Badge>
            {app.is_public ? (
              <Badge
                variant="outline"
                className="gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
              >
                <Globe className="w-3 h-3" /> Public
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Lock className="w-3 h-3" /> Private
              </Badge>
            )}
            {app.is_featured && (
              <Badge
                variant="outline"
                className="gap-1 text-amber-600 dark:text-amber-400 border-amber-500/40"
              >
                Featured
              </Badge>
            )}
            {app.is_verified && (
              <Badge
                variant="outline"
                className="gap-1 text-blue-600 dark:text-blue-400 border-blue-500/40"
              >
                <ShieldCheck className="w-3 h-3" /> Verified
              </Badge>
            )}
            {app.status === "archived" && (
              <Badge
                variant="outline"
                className="gap-1 text-muted-foreground"
              >
                <Archive className="w-3 h-3" /> Archived
              </Badge>
            )}
            {app.category && (
              <Badge variant="outline" className="gap-1">
                <Folder className="w-3 h-3" /> {app.category}
              </Badge>
            )}
            {agent?.name && (
              <Link href={`/agents/${app.agent_id}`}>
                <Badge
                  variant="outline"
                  className="gap-1 hover:bg-muted transition-colors"
                  title="Open agent"
                >
                  <Webhook className="w-3 h-3" /> {agent.name}
                  {!app.use_latest && app.agent_version_id && (
                    <span className="opacity-70 text-[0.625rem]">
                      · pinned
                    </span>
                  )}
                </Badge>
              </Link>
            )}
          </div>

          {app.tags && app.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {app.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Action row: open public, edit code, etc. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link href={`/p/${app.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> Open public app
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
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => handleCopy("url", publicUrl, "Public URL copied")}
          >
            {copied === "url" ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            Copy URL
          </Button>
        </div>

        {/* Stat strip */}
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
              icon={Sparkles}
              label="cost"
              value={`$${app.total_cost.toFixed(2)}`}
              accent="text-amber-500"
            />
          )}
        </div>

        <Separator />

        {/* Identity card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Name" value={app.name} />
            <Field label="Slug" value={app.slug} mono />
            <Field
              label="Tagline"
              value={app.tagline || "—"}
              dim={!app.tagline}
            />
            <Field
              label="Description"
              value={app.description || "—"}
              dim={!app.description}
            />
            <Field
              label="Category"
              value={app.category || "—"}
              dim={!app.category}
            />
            <Field
              label="Created"
              value={formatRelative(app.created_at)}
              dim
            />
            <Field
              label="Updated"
              value={formatRelative(app.updated_at)}
              dim
            />
          </CardContent>
        </Card>

        {/* Agent binding card */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">Agent binding</CardTitle>
            <Link
              href={`/agents/${app.agent_id}`}
              className="text-xs text-primary hover:underline"
            >
              Open agent
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Agent" value={agent?.name ?? "—"} />
            <Field label="Agent ID" value={app.agent_id} mono />
            <Field
              label="Pinned version"
              value={
                app.use_latest
                  ? "Always use latest"
                  : (app.agent_version_id ?? "—")
              }
              mono={!app.use_latest}
              dim={app.use_latest}
            />
          </CardContent>
        </Card>

        {/* Code summary card with link to /code */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">Code</CardTitle>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={codeHref}>
                <Code className="w-3.5 h-3.5" /> Open editor
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Field label="Language" value={app.component_language} />
            <Field
              label="Lines"
              value={
                typeof app.component_code === "string"
                  ? String(app.component_code.split("\n").length)
                  : "—"
              }
              dim
            />
            <Field
              label="Allowed imports"
              value={
                Array.isArray(app.allowed_imports)
                  ? `${(app.allowed_imports as unknown[]).length} packages`
                  : "—"
              }
              dim
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
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
