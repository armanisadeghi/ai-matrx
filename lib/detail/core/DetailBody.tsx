// lib/detail/core/DetailBody.tsx
//
// The fixed sections, in the order every record shows them:
//   source health strip (synced records only) · about · fields · associations
//   · history · a registration's extra sections
// A section that does not apply is ABSENT — never an empty box, never a
// disabled-looking control. Every load state says what happened.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ExternalLink,
  History,
  Link2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn, Skeleton } from "@ai-matrx/design-system";
import {
  ASSOCIATION_TARGET_TYPES,
  isEntityTypeToken,
  type AssociationTargetType,
} from "@ai-matrx/associations";
import { AssociationCardGrid, PrimaryEntityProvider } from "@ai-matrx/associations/react";

import { useDetailHost } from "../host";
import { formatWhen } from "../format";
import type { DetailHistoryEntry, DetailSection, DetailSourceHealth } from "../types";
import type { DetailCore } from "./useDetailCore";

function SectionHeading({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
    </h3>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "muted" | "warn" | "error";
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <AlertCircle
        className={cn(
          "h-6 w-6",
          tone === "error" && "text-destructive",
          tone === "warn" && "text-primary",
          tone === "muted" && "text-muted-foreground/60",
        )}
      />
      <p className="max-w-prose text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

// ─── Source health strip ────────────────────────────────────────────────────

function HealthStrip({ health }: { health: DetailSourceHealth }) {
  const ok = health.grant === "ok";
  const [refreshing, setRefreshing] = useState(false);
  const host = useDetailHost();
  const refresh = async () => {
    if (!health.onRefresh) return;
    setRefreshing(true);
    try {
      await health.onRefresh();
    } catch (error: unknown) {
      host.notify.error(
        `Refresh from ${health.source} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-4 py-2 text-xs",
        ok ? "bg-muted/40 text-muted-foreground" : "bg-destructive/5 text-foreground",
      )}
      data-detail-health
    >
      {ok ? (
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
      ) : (
        <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
      )}
      <span className="font-medium">{health.source}</span>
      {health.lastRefreshedAt ? (
        <span>Refreshed {formatWhen(health.lastRefreshedAt)}</span>
      ) : (
        <span>Never refreshed</span>
      )}
      {health.grantDetail ? <span>{health.grantDetail}</span> : null}
      <span className="ml-auto flex items-center gap-1">
        {health.onRefresh ? (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 hover:bg-accent hover:text-foreground disabled:opacity-50 pointer-coarse:h-10"
          >
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            Refresh
          </button>
        ) : null}
        {!ok && health.onReconnect ? (
          <button
            type="button"
            onClick={health.onReconnect}
            className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-primary-foreground hover:bg-primary/90 pointer-coarse:h-10"
          >
            Reconnect
          </button>
        ) : null}
        {health.openAtSourceHref ? (
          <a
            href={health.openAtSourceHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 hover:bg-accent hover:text-foreground pointer-coarse:h-10"
          >
            <ExternalLink className="h-3 w-3" />
            Open at source
          </a>
        ) : null}
      </span>
    </div>
  );
}

// ─── Fields ─────────────────────────────────────────────────────────────────

function FieldsSection({ core }: { core: DetailCore }) {
  const host = useDetailHost();
  const RefCell = host.doors.RefCell;
  const label = core.recordType?.label.toLowerCase() ?? "record";

  if (!core.recordType) {
    return (
      <Notice tone="warn">
        {`Nothing is registered to show a "${core.ref.type}" record yet. Register the type in the item registry (features/item-presentation/registry.tsx) and this detail fills itself in.`}
      </Notice>
    );
  }
  if (core.status === "loading") {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={`Loading ${label} details`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className={cn("h-4", i % 2 ? "w-3/4" : "w-1/2")} />
          </div>
        ))}
      </div>
    );
  }
  if (core.status === "not-found") {
    return (
      <Notice tone="warn">
        {`This ${label} couldn't be found — it may have been moved, deleted, or isn't shared with you.`}
      </Notice>
    );
  }
  if (core.status === "error") {
    return (
      <Notice tone="error">
        {`Couldn't load the details for this ${label}. ${core.errorMessage ?? ""}`.trim()}
      </Notice>
    );
  }
  if (core.status === "none") {
    return (
      <Notice tone="muted">
        {core.about
          ? "No additional details are available for this item yet."
          : `A ${label} reference. No additional details are available yet.`}
      </Notice>
    );
  }
  if (core.fields.length === 0) {
    return <p className="text-sm text-muted-foreground">No additional fields to show.</p>;
  }
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5">
      {core.fields.map((field) => (
        <div
          key={field.key}
          className="flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-b-0"
        >
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {field.label}
          </dt>
          <dd
            className={cn(
              "break-words text-sm text-foreground",
              !field.ref &&
                field.mono &&
                "whitespace-pre-wrap rounded-md bg-muted px-2 py-1 font-mono text-xs",
            )}
          >
            {field.ref ? (
              <RefCell value={field.ref.id} label={field.label} token={field.ref.token} />
            ) : (
              field.text
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Associations ───────────────────────────────────────────────────────────

function isAssociationTarget(token: string): token is AssociationTargetType {
  return (ASSOCIATION_TARGET_TYPES as readonly string[]).includes(token);
}

function AssociationsSection({ core }: { core: DetailCore }) {
  const host = useDetailHost();
  const token = core.entityToken;
  if (!token || !isAssociationTarget(token) || !host.associations.canAnchor(token)) return null;
  if (core.recordType?.associationTokens === null) return null;
  const wanted = core.recordType?.associationTokens ?? host.associations.defaultTokens;
  const tokens = wanted.filter((t) => t !== token).filter(isEntityTypeToken);
  if (tokens.length === 0) return null;
  return (
    <section className="space-y-2" data-detail-section="associations">
      <SectionHeading icon={<Link2 className="h-3 w-3" />}>Linked</SectionHeading>
      <PrimaryEntityProvider value={{ type: token, id: core.ref.id, label: core.title }}>
        <AssociationCardGrid tokens={tokens} />
      </PrimaryEntityProvider>
    </section>
  );
}

// ─── History ────────────────────────────────────────────────────────────────

type HistoryState =
  | { status: "loading" }
  | { status: "ready"; entries: DetailHistoryEntry[] }
  | { status: "error"; message: string };

function HistorySection({ core }: { core: DetailCore }) {
  const host = useDetailHost();
  const token = core.entityToken;
  const wanted = core.recordType?.history ?? Boolean(token);
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted || !token) return undefined;
    const key = `${token}:${core.ref.id}`;
    if (lastKey.current !== key) {
      lastKey.current = key;
      setState({ status: "loading" });
    }
    const controller = new AbortController();
    void host.history
      .list(token, core.ref.id, controller.signal)
      .then((entries) => {
        if (!controller.signal.aborted) setState({ status: "ready", entries });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => controller.abort();
  }, [host, wanted, token, core.ref.id]);

  if (!wanted || !token) return null;
  const ActorCell = host.doors.RefCell;
  const actorToken = host.doors.tokenFromColumnName("actor_id");

  return (
    <section className="space-y-2" data-detail-section="history">
      <SectionHeading icon={<History className="h-3 w-3" />}>History</SectionHeading>
      {state.status === "loading" ? (
        <div className="space-y-1.5" aria-busy="true" aria-label="Loading history">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ) : state.status === "error" ? (
        <p className="text-xs text-muted-foreground">
          {state.message.toLowerCase().includes("access denied")
            ? "History is only shown to people who can view this record."
            : `History could not be read: ${state.message}`}
        </p>
      ) : state.entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recorded changes yet.</p>
      ) : (
        <ol className="space-y-1">
          {state.entries.map((entry) => (
            <li
              key={`${entry.version}-${entry.occurredAt}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
            >
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                v{entry.version}
              </span>
              <span className="capitalize text-foreground">{entry.operation.toLowerCase()}</span>
              <span className="text-muted-foreground">{formatWhen(entry.occurredAt)}</span>
              {entry.isCurrent ? (
                <span className="text-[10px] uppercase tracking-wide text-primary">current</span>
              ) : null}
              {entry.actorId && actorToken ? (
                <ActorCell value={entry.actorId} label="Changed by" token={actorToken} />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ─── Body ───────────────────────────────────────────────────────────────────

export function DetailBody({ core }: { core: DetailCore }) {
  const extra: DetailSection[] =
    core.recordType?.extraSections && core.frameCtx
      ? core.recordType.extraSections(core.row, core.frameCtx)
      : [];
  const Frame = core.recordType?.Frame ?? null;

  const body = (
    // `min-h-full` so a Frame's right-click menu answers anywhere in the body,
    // not only on the rows — a short dossier otherwise leaves a dead band.
    <div className="flex min-h-full flex-col">
      {core.health ? <HealthStrip health={core.health} /> : null}
      {core.about ? (
        <p className="line-clamp-3 border-b border-border/60 p-4 text-xs leading-snug text-muted-foreground">
          {core.about}
        </p>
      ) : null}
      <div className="space-y-6 p-4">
        <FieldsSection core={core} />
        {core.status === "ready" || core.status === "none" ? (
          <>
            <AssociationsSection core={core} />
            <HistorySection core={core} />
            {extra.map((section) => (
              <section key={section.id} className="space-y-2" data-detail-section={section.id}>
                <SectionHeading>{section.label}</SectionHeading>
                {section.content}
              </section>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );

  if (Frame && core.frameCtx) return <Frame ctx={core.frameCtx}>{body}</Frame>;
  return body;
}
