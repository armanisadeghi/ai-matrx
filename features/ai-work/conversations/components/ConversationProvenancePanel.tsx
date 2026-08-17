"use client";

// features/ai-work/conversations/components/ConversationProvenancePanel.tsx
//
// WHERE EVERY FIELD CAME FROM — the thing this view was missing.
//
// A gap analysis is impossible while a title AI Matrx derived from the first
// prompt is rendered identically to the label Claude Code shows in its own
// sidebar, and while "no git branch" is indistinguishable from "we never asked
// for one". So every displayed field is grouped under the system that PRODUCED
// it, and a field that system did not report says so in words:
//
//   From Claude Code     — provider session id, workspace, git branch, and the
//                          provider's own title WHEN it supplied one.
//   From AI Matrx        — our derived title, favorite, type, origin, org,
//                          associations. Things we decided.
//   From the sync layer  — binding status, fidelity, origin, last delivery.
//                          How the row got here, not what it says.
//
// Nothing here infers. `title_source` is the only thing that separates our
// title from the provider's, so it is stated beside the title every time — and
// its DEFAULT reading is "ours", because an unstamped row was derived the same
// way as a stamped one.

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Loader2,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { formatText } from "@/utils/text/text-case-converter";
import {
  fetchCodingSessionBindings,
  type CodingSessionBinding,
} from "@/features/agent-connections/coding-sessions/service";
import {
  fidelityVerdict,
  formatSessionTimestamp,
} from "@/features/agent-connections/coding-sessions/verdict";
import {
  providerAccountIdentity,
  recordedCapabilityLabels,
  workspaceName,
} from "@/features/ai-work/lib/codingSessionPresentation";
import { appLabel } from "@/features/agents/redux/conversation-history/source-registry";
import type { ProviderConversation } from "@/features/ai-work/service/providerConversation";
import { ContinueOnMyMacPanel } from "./ContinueOnMyMacPanel";
import {
  conversationTypeLabel,
  originClassLabel,
  providerLabel,
  titleProvenance,
} from "../presentation";

/** A field the source did not report. Never rendered as an empty cell. */
const NOT_REPORTED = "Not reported";

type Source = "provider" | "matrx" | "sync";

const SOURCE_META: Record<
  Source,
  { title: string; blurb: string; accent: string }
> = {
  provider: {
    title: "From the coding provider",
    blurb:
      "Facts the provider itself reported through the plugin. If it is absent here, the provider never sent it — AI Matrx does not invent these.",
    accent: "border-l-sky-500/60",
  },
  matrx: {
    title: "From AI Matrx",
    blurb:
      "What this platform decided, derived, or stored about the conversation. None of this comes from the provider.",
    accent: "border-l-primary/60",
  },
  sync: {
    title: "From the sync layer",
    blurb:
      "How this record arrived and how faithful the copy is. This describes the delivery, never the content.",
    accent: "border-l-amber-500/60",
  },
};

function Group({
  source,
  children,
  headerRight,
}: {
  source: Source;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const meta = SOURCE_META[source];
  return (
    <section
      className={cn(
        "rounded-lg border border-l-4 border-border bg-background p-3",
        meta.accent,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {meta.title}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {meta.blurb}
          </p>
        </div>
        {headerRight}
      </div>
      <dl className="mt-2.5 grid gap-2 text-xs sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Fact({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/30 px-2.5 py-2" title={hint}>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{children}</dd>
    </div>
  );
}

function Absent({ children = NOT_REPORTED }: { children?: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function ConversationProvenancePanel({
  conversation,
}: {
  conversation: ProviderConversation;
}) {
  const [bindings, setBindings] = useState<CodingSessionBinding[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    void fetchCodingSessionBindings(conversation.id)
      .then((next) => {
        if (cancelled) return;
        setBindings(next);
        setState("ready");
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBindings([]);
        setError(err instanceof Error ? err.message : "Binding read failed");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.id, reloadToken]);

  // The newest binding describes the conversation NOW; older ones are history
  // and render below it rather than competing with it.
  const primary = bindings[0] ?? null;
  const provenance = titleProvenance(
    primary ? readTitleSource(primary) : null,
    primary?.provider ?? null,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Where this data comes from
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Every field below is grouped by the system that produced it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadToken((n) => n + 1)}
          aria-label="Re-read provider bindings"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Title provenance, stated first and unmissably ───────────────── */}
      <div
        className={cn(
          "rounded-lg border p-3",
          provenance.fromProvider
            ? "border-sky-500/40 bg-sky-500/5"
            : "border-border bg-muted/20",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {provenance.fromProvider ? (
            <TerminalSquare className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
          ) : (
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">
            {conversation.title?.trim() || "Untitled conversation"}
          </span>
          <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-border">
            {provenance.chip}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {provenance.detail}
        </p>
      </div>

      {state === "loading" ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reading provider bindings…
        </div>
      ) : state === "error" ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* ── From the coding provider ─────────────────────────────────────── */}
      <Group source="provider">
        <Fact label="Provider">
          {primary ? (
            providerLabel(primary.provider)
          ) : (
            <Absent>No provider — this is an AI Matrx conversation</Absent>
          )}
        </Fact>
        <Fact
          label="Provider session id"
          hint="The provider's own id for the session this conversation mirrors."
        >
          {primary?.provider_session_id ? (
            <span className="font-mono text-[11px]">
              {primary.provider_session_id}
            </span>
          ) : (
            <Absent />
          )}
        </Fact>
        <Fact label="Workspace" hint="The working directory the session ran in.">
          {primary ? (
            (workspaceName(primary.metadata) ?? <Absent />)
          ) : (
            <Absent>—</Absent>
          )}
        </Fact>
        <Fact
          label="Git branch"
          hint="Reported by the provider when the session was on a branch."
        >
          {primary ? (
            (readMetaString(primary, "git_branch") ?? (
              <Absent>Not reported by this provider version</Absent>
            ))
          ) : (
            <Absent>—</Absent>
          )}
        </Fact>
        <Fact label="Provider account">
          {primary ? (
            providerAccountIdentity(primary.metadata).display
          ) : (
            <Absent>—</Absent>
          )}
        </Fact>
        <Fact label="Workspace identity">
          {primary?.workspace_fingerprint ??
            primary?.provider_project_key ?? <Absent />}
        </Fact>
      </Group>

      {/* ── Native continuation, capability-gated by the user's own Mac ──── */}
      {primary?.provider === "claude_code" && primary.provider_session_id && (
        <ContinueOnMyMacPanel
          providerSessionId={primary.provider_session_id}
          conversationId={conversation.id}
        />
      )}

      {/* ── From AI Matrx ────────────────────────────────────────────────── */}
      <Group source="matrx">
        <Fact label="Title we derived" hint={provenance.detail}>
          {provenance.fromProvider ? (
            <Absent>The provider supplied the title — we did not derive it</Absent>
          ) : (
            (conversation.title?.trim() || <Absent>No title derived</Absent>)
          )}
        </Fact>
        <Fact label="Title source">{provenance.chip}</Fact>
        <Fact label="Conversation type">
          {conversationTypeLabel(conversation.conversation_type)}
        </Fact>
        <Fact label="Origin">{originClassLabel(conversation.origin_class)}</Fact>
        <Fact label="Recorded by">
          {conversation.source_app ? (
            `${appLabel(conversation.source_app)}${conversation.source_feature ? ` · ${conversation.source_feature}` : ""}`
          ) : (
            <Absent />
          )}
        </Fact>
        <Fact label="Favorite">
          {conversation.is_favorite ? "Yes" : "No"}
        </Fact>
        <Fact label="Visibility">{formatText(conversation.visibility)}</Fact>
        <Fact label="Messages stored">{conversation.message_count}</Fact>
        <Fact label="Knowledge graph">
          {conversation.exclude_from_kg
            ? "Excluded by you"
            : "Included"}
        </Fact>
        <Fact label="Task">
          {conversation.task_id ? (
            <EntityRef
              token="task"
              id={conversation.task_id}
              name="Linked task"
            />
          ) : (
            <Absent>Not attached to a task</Absent>
          )}
        </Fact>
        <Fact label="First recorded">
          {formatSessionTimestamp(conversation.created_at)}
        </Fact>
        <Fact label="Last updated">
          {formatSessionTimestamp(conversation.updated_at)}
        </Fact>
      </Group>

      {/* ── From the sync layer ──────────────────────────────────────────── */}
      {primary ? (
        <>
          <Group
            source="sync"
            headerRight={
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                {fidelityVerdict(primary.fidelity).label}
              </span>
            }
          >
            <Fact
              label="Fidelity"
              hint={fidelityVerdict(primary.fidelity).detail}
            >
              {fidelityVerdict(primary.fidelity).detail}
            </Fact>
            <Fact label="Binding state">{formatText(primary.status)}</Fact>
            <Fact label="Arrived by">{formatText(primary.origin)}</Fact>
            <Fact label="Last delivery">
              {formatSessionTimestamp(primary.last_seen_at)}
            </Fact>
            <Fact label="Session ended">
              {primary.ended_at ? (
                formatSessionTimestamp(primary.ended_at)
              ) : (
                <Absent>Not ended</Absent>
              )}
            </Fact>
            <Fact label="Managed runtime">
              {primary.runtime_kind ? (
                formatText(primary.runtime_kind)
              ) : (
                <Absent>None recorded</Absent>
              )}
            </Fact>
            <Fact label="Recorded capabilities">
              {recordedCapabilityLabels(primary.capabilities).join(", ") || (
                <Absent>None recorded</Absent>
              )}
            </Fact>
            <Fact label="Writer lease">
              {primary.writer_lease_expires_at ? (
                `Expires ${formatSessionTimestamp(primary.writer_lease_expires_at)}`
              ) : (
                <Absent>No active lease</Absent>
              )}
            </Fact>
          </Group>
          {bindings.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {bindings.length - 1} earlier binding
              {bindings.length === 2 ? "" : "s"} exist for this conversation.
              The newest is shown; the others are historical deliveries of the
              same session.
            </p>
          )}
        </>
      ) : state === "ready" ? (
        <Group source="sync">
          <Fact label="Delivery">
            <Absent>
              No coding-session binding is attached. Nothing was synced from a
              provider — this conversation was created inside AI Matrx.
            </Absent>
          </Fact>
        </Group>
      ) : null}
    </div>
  );
}

// ── Tolerant metadata readers ───────────────────────────────────────────────
// Deliberately narrow: only keys the bridge contract defines are read, and an
// absent key renders as an explicit absence rather than an empty cell.

function metaRecord(
  binding: CodingSessionBinding,
): Record<string, unknown> | null {
  const value = binding.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMetaString(
  binding: CodingSessionBinding,
  key: string,
): string | null {
  const value = metaRecord(binding)?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTitleSource(binding: CodingSessionBinding): string | null {
  return readMetaString(binding, "title_source");
}
