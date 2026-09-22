// lib/detail/core/DetailBody.tsx
//
// The fixed sections, in the order every record shows them:
//   source health strip (synced records only) · about · fields · associations
//   · history · a registration's extra sections
// A section that does not apply is ABSENT — never an empty box, never a
// disabled-looking control. Every load state says what happened.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn, Skeleton } from "@ai-matrx/design-system";
import {
  ASSOCIATION_TARGET_TYPES,
  isEntityTypeToken,
  type AssociationTargetType,
} from "@ai-matrx/associations";
import { AssociationCardGrid, PrimaryEntityProvider } from "@ai-matrx/associations/react";
import { formatDurationMs } from "@ai-matrx/kit/format";

import { formatWhen } from "../format";
import type { DetailHistoryEntry, DetailSection, DetailSourceHealth } from "../types";
import { DetailRecordMeta } from "./DetailHeader";
import { DetailPresentationPane } from "./DetailPresentationPane";
import { useDetailHost } from "../host";
import {
  AlertCircleIcon,
  ExternalLinkIcon,
  HistoryIcon,
  Link2Icon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "./icons";
import type { DetailCore } from "./useDetailCore";

/**
 * 🚨 D5 — THE SKELETON HAS A BOUNDED WAIT. A load that never answers used to
 * shimmer for ~20 seconds and then drop an error, with nothing in between
 * saying anything was wrong. After this many milliseconds the skeleton says,
 * in plain words, that it is still waiting — the stand-in announcing itself
 * (law 4) rather than pretending progress. A patience threshold, not a ceiling
 * or a quota: it buys nothing and spends nothing, so it is a constant here and
 * not a knob.
 */
const SLOW_LOAD_NOTICE_MS = 6000;

/** True once a load has been running longer than a person expects to wait. */
function useSlowLoadNotice(active: boolean, key: string): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return undefined;
    }
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [active, key]);
  return slow;
}

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
      <AlertCircleIcon
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

/**
 * The state in one word, for every grant but `ok`. `blocked` is the word for
 * "the source refuses and nothing you can click repairs it" (chair, 2026-09-18):
 * the strip says it, states the reason, and shows no Reconnect.
 */
const GRANT_WORD: Record<DetailSourceHealth["grant"], string> = {
  ok: "OK",
  expired: "Expired",
  revoked: "Revoked",
  missing: "Missing",
  unknown: "Unknown",
  blocked: "Blocked",
};

/**
 * 🚨 N14 (VERIFY-U-W1-U-W2) — THE CONTROL THAT LEAVES FOR THE SOURCE NAMES IT.
 * The strip already prints `health.source` beside it, so "Open at source" threw
 * away the only word the person recognises. One producer often answers for a
 * whole FAMILY, though ("Google Docs, Sheets & Drive files" covers Docs, Sheets
 * and Slides), and "Open in Google Docs" on a spreadsheet would be a lie — so a
 * source that lists several things is cut back to the provider word, a short
 * source is used whole, and no source at all keeps the generic phrase rather than
 * letting the screen guess.
 *
 * A registration that knows the row's exact kind sets `health.openAtSourceLabel`
 * instead (a Doc vs. a Sheet vs. a plain Drive file; "Open in Google Calendar"
 * for an event) — that field wins over this derivation below, in `HealthStrip`.
 */
function deriveOpenAtSourceLabel(source: string): string {
  const named = source.trim().replace(/\s+/g, " ");
  if (!named) return "Open at source";
  const listsSeveral = /[,&]/.test(named) || named.split(" ").length > 3;
  const [firstWord = ""] = named.split(" ");
  const place = listsSeveral ? firstWord.replace(/[,&]+$/, "") : named;
  return place ? `Open in ${place}` : "Open at source";
}

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
        <ShieldCheckIcon className="h-3.5 w-3.5 text-primary" />
      ) : (
        <ShieldAlertIcon className="h-3.5 w-3.5 text-destructive" />
      )}
      <span className="font-medium">{health.source}</span>
      {ok ? null : (
        <span
          className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive"
          data-detail-health-state={health.grant}
        >
          {GRANT_WORD[health.grant]}
        </span>
      )}
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
            <RefreshCwIcon className={cn("h-3 w-3", refreshing && "animate-spin")} />
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
            <ExternalLinkIcon className="h-3 w-3" />
            {health.openAtSourceLabel ?? deriveOpenAtSourceLabel(health.source)}
          </a>
        ) : null}
      </span>
    </div>
  );
}

// ─── Fields ─────────────────────────────────────────────────────────────────

/**
 * 🚨 NEW-17 (VERIFY-U-P1-R4) — THE SENTENCE IS DERIVED FROM THE CONTROLS THAT
 * RENDERED, NEVER A FIXED STRING. "The controls above still open it where it
 * lives, and copy its id" was printed for `session` — a registered type with no
 * `entityToken`, whose header therefore shows no door at all — and for every
 * unregistered type. The copy control is unconditional in `DetailActions`, so
 * that half is always true; the open half is claimed only when the record really
 * has a door (`core.canOpenElsewhere`).
 */
function whatTheControlsDo(core: DetailCore): string {
  return core.canOpenElsewhere
    ? "The controls above still open it where it lives, and copy its id."
    : "The controls above copy its id, so you can find it wherever it came from.";
}

function FieldsSection({ core }: { core: DetailCore }) {
  const host = useDetailHost();
  const RefCell = host.doors.RefCell;
  const label = core.recordType?.label.toLowerCase() ?? "record";

  if (!core.recordType) {
    // 🚨 NEW-9 — THE PERSON'S LANGUAGE, NEVER A REPO PATH. This sentence named a
    // source file and told a brilliant non-technical expert to edit a registry.
    // The remedy is a console warning from the core, where the developer is.
    return (
      <Notice tone="warn">
        {`This is a ${core.ref.type} record. Nothing more about it is stored here yet, so there is ` +
          `nothing else to show. ${whatTheControlsDo(core)}`}
      </Notice>
    );
  }
  if (core.status === "loading") {
    return <LoadingFields core={core} label={label} />;
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
    // 🚨 NEW-1 — THE ABSENT STATE NAMES THE TYPE AND THE REMEDY. This branch is
    // "nothing is registered to LOAD a record of this type", which is not the
    // same as "this record has no extra fields", and it used to read as the
    // latter under an invented title (VERIFY-U-P1-R2).
    return (
      <Notice tone="muted">
        {`Nothing more about this ${label} is stored here, so there is nothing else to show. ` +
          whatTheControlsDo(core)}
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
              // 🚨 THE DOOR SAYS WHAT IT OPENS (chair, 2026-09-18). This rendered
              // `field.ref.id` alone, so a field whose text was "Acme Robotics"
              // printed a truncated uuid. The ref's own `name` wins; otherwise the
              // field's text, unless that text IS the id and says nothing more.
              <RefCell
                value={field.ref.id}
                label={field.label}
                token={field.ref.token}
                name={field.ref.name ?? (field.text === field.ref.id ? null : field.text)}
              />
            ) : (
              field.text
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The skeleton, plus the honest line once the wait has gone long (D5). */
function LoadingFields({ core, label }: { core: DetailCore; label: string }) {
  const slow = useSlowLoadNotice(true, `${core.ref.type}:${core.ref.id}`);
  return (
    <div className="space-y-3" aria-busy="true" aria-label={`Loading ${label} details`}>
      {slow ? (
        <p className="text-xs text-muted-foreground" data-detail-slow-load>
          Still loading this {label} — the read has been running for more than{" "}
          {formatDurationMs(SLOW_LOAD_NOTICE_MS, { style: "long" })}. If nothing appears, the
          record may be unreachable from here; closing and reopening it starts a fresh read.
        </p>
      ) : null}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className={cn("h-4", i % 2 ? "w-3/4" : "w-1/2")} />
        </div>
      ))}
    </div>
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
      <SectionHeading icon={<Link2Icon className="h-3 w-3" />}>Linked</SectionHeading>
      <PrimaryEntityProvider value={{ type: token, id: core.ref.id, label: core.title }}>
        <AssociationCardGrid tokens={tokens} />
      </PrimaryEntityProvider>
    </section>
  );
}

// ─── History ────────────────────────────────────────────────────────────────

/**
 * The columns a change's author is spelled as, in the order the map is asked.
 * `version_list` returns `actor_id`; the others are what sibling history shapes
 * on this platform carry.
 */
const ACTOR_COLUMNS = ["actor_id", "user_id", "person_id", "created_by_id"] as const;

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
  // The port function, not the host object: the effect must re-run for a new
  // record, never for a re-render.
  const listHistory = host.history.list;
  const recordId = core.ref.id;

  useEffect(() => {
    if (!wanted || !token) return undefined;
    const key = `${token}:${recordId}`;
    if (lastKey.current !== key) {
      lastKey.current = key;
      setState({ status: "loading" });
    }
    const controller = new AbortController();
    void listHistory(token, recordId, controller.signal)
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
  }, [listHistory, wanted, token, recordId]);

  if (!wanted || !token) return null;
  const ActorCell = host.doors.RefCell;
  // 🚨 NEW-23 (VERIFY-U-P1-R4) — WHO MADE THE CHANGE IS NEVER DROPPED. The row
  // was rendered only when `tokenFromColumnName("actor_id")` named a token, and
  // it names none (no `actor` or `user` token has a door in this platform's
  // registry today), so every history row silently threw away the id
  // `version_list` hands over. The map is asked for each column an actor is
  // spelled as — the first that has a door wins — and when none does the value is
  // shown as itself under an honest label, because an identity the data names is
  // never nothing (law 4 + the no-dead-ends class).
  const actorToken = ACTOR_COLUMNS.map((column) => host.doors.tokenFromColumnName(column)).find(
    (candidate): candidate is string => Boolean(candidate),
  );
  // 🚨 NEW-23 (VERIFY-U-P1-R5) — AND THE HONEST FALLBACK WAS STILL A BARE UUID
  // ON EVERY ROW. Nothing was silent, but no host registry gives `actor_id` a
  // door, so "Changed by 8f3c…-…" was what a brilliant non-technical expert read
  // on every change of every record. The host's ONE identity resolver answers
  // first now (`history.ActorName`); the door is next; the id itself is last and
  // says, in its title, that we could not find the person.
  const ActorName = host.history.ActorName ?? null;

  return (
    <section className="space-y-2" data-detail-section="history">
      <SectionHeading icon={<HistoryIcon className="h-3 w-3" />}>History</SectionHeading>
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
              {entry.actorId ? (
                ActorName ? (
                  <span className="text-muted-foreground" data-detail-history-actor-person>
                    Changed by <ActorName actorId={entry.actorId} row={core.row} />
                  </span>
                ) : actorToken ? (
                  <span className="inline-flex items-center" data-detail-history-actor>
                    <ActorCell value={entry.actorId} label="Changed by" token={actorToken} />
                  </span>
                ) : (
                  <span className="text-muted-foreground" data-detail-history-actor-raw>
                    Changed by{" "}
                    <span
                      className="font-mono text-[10px]"
                      title="We could not find the person behind this id — this host has bound no identity resolver."
                    >
                      {entry.actorId}
                    </span>
                  </span>
                )
              ) : (
                <span className="text-muted-foreground" data-detail-history-actor-absent>
                  No person recorded for this change
                </span>
              )}
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
      <DetailRecordMeta core={core} />
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
        {/* Last, quiet, and on every load state: how details open is a setting
            the person can change from right here (and the one caller of the
            keyboard model's `registerSave`). */}
        <DetailPresentationPane core={core} />
      </div>
    </div>
  );

  if (Frame && core.frameCtx) return <Frame ctx={core.frameCtx}>{body}</Frame>;
  return body;
}
