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
//
// EVERY BINDING IS NAMED (lane XT-05, plan-attack F7). A conversation can now
// carry more than one provider binding, because `handoff` mints a second
// `chat.coding_session` row so work can move from one coding tool to another.
// This panel used to read `bindings[0]` and describe it as "the" provider, then
// dismiss the rest as "earlier deliveries of the same session" — a sentence that
// is FALSE the moment the second row is a different tool. So the tools are
// listed first, each with its provider, its own session id, the provider account
// that produced it, its fidelity verdict (seeded handoff included), and which
// one delivered most recently. The grouped fields below still describe ONE
// binding, and which one is stated in the heading rather than implied.

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  BrainCircuit,
  Loader2,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { formatText } from "@ai-matrx/kit/text-case";
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
import {
  bindingFidelityVerdict,
  handoffRecord,
  isUnclaimedOffer,
  type HandoffRecord,
} from "../handoffBinding";
import {
  lastDeliveryLabel,
  mostRecentlyDelivered,
  NO_DELIVERY_FROM_ANY_TOOL,
} from "../bindingPlurality";

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
    accent: "border-l-current/60",
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
  note,
}: {
  source: Source;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  /** WHICH binding these fields describe, when more than one exists. A group
   *  of per-binding facts with no binding named is the single-binding
   *  assumption wearing a heading. */
  note?: React.ReactNode;
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
          {note ? (
            <p className="mt-1 text-xs font-medium text-foreground">{note}</p>
          ) : null}
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

/**
 * One binding's "last delivery", honestly. A row that has delivered nothing —
 * an unclaimed handoff offer, or a binding with no recorded delivery — gets an
 * explicit sentence, never a blank cell and never a creation stamp presented as
 * a delivery.
 */
function DeliveryValue({ binding }: { binding: CodingSessionBinding }) {
  const delivery = lastDeliveryLabel(binding);
  return delivery.delivered ? (
    <>{delivery.text}</>
  ) : (
    <Absent>{delivery.text}</Absent>
  );
}

const FIDELITY_TONE: Record<string, string> = {
  native: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  mirror: "bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  seeded: "bg-violet-500/10 text-violet-700 ring-violet-500/30 dark:text-violet-300",
  unknown: "bg-muted text-muted-foreground ring-border",
};

/**
 * ONE tool on this conversation, named in full.
 *
 * Every fact here is per-binding, because with two bindings a single-binding
 * summary is not a simplification — it is wrong about one of them. `isCurrent`
 * is stated as "delivered most recently", never as "live": this panel reads
 * stored rows, and the live indicator is the transcript's job.
 */
function BindingCard({
  binding,
  isCurrent,
  index,
  total,
}: {
  binding: CodingSessionBinding;
  isCurrent: boolean;
  index: number;
  total: number;
}) {
  const handoff = handoffRecord(binding.metadata);
  const verdict = bindingFidelityVerdict(
    fidelityVerdict(binding.fidelity),
    handoff,
    binding.provider_session_id,
  );
  const account = providerAccountIdentity(binding.metadata);
  const unclaimed = isUnclaimedOffer(binding.provider_session_id);
  const workspace = workspaceName(binding.metadata);
  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
        <span className="text-sm font-semibold text-foreground">
          {providerLabel(binding.provider)}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
            FIDELITY_TONE[verdict.tone] ?? FIDELITY_TONE.unknown,
          )}
        >
          {verdict.label}
        </span>
        {isCurrent ? (
          <span className="rounded-full bg-current/10 px-2 py-0.5 text-[11px] font-medium text-current ring-1 ring-current/30">
            Delivered most recently
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          Tool {index + 1} of {total}
        </span>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {verdict.detail}
      </p>

      {handoff ? (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-violet-500/5 px-2.5 py-2 text-xs ring-1 ring-violet-500/20">
          <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="min-w-0 text-foreground">
            {handoff.fromProvider ? (
              <>
                Handed over from{" "}
                <span className="font-medium">
                  {providerLabel(handoff.fromProvider)}
                </span>
                {handoff.fromProviderSessionId ? (
                  <>
                    {" "}
                    session{" "}
                    <span className="font-mono text-[11px]">
                      {handoff.fromProviderSessionId}
                    </span>
                  </>
                ) : null}
                .
              </>
            ) : (
              <>Created by a seeded handoff.</>
            )}
            {handoff.claimedAt ? (
              <> Claimed {formatSessionTimestamp(handoff.claimedAt)}.</>
            ) : (
              <> Not yet claimed by a session of this tool.</>
            )}
            {handoff.reboundFromConversationId ? (
              <>
                {" "}
                This tool&apos;s session was already bound elsewhere, so that
                binding was moved here rather than duplicated — its turns before
                the move stayed on conversation{" "}
                <span className="font-mono text-[11px]">
                  {handoff.reboundFromConversationId}
                </span>
                .
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        <Fact label="Provider session id">
          {unclaimed ? (
            <Absent>
              No provider session yet — the handoff is waiting to be claimed
            </Absent>
          ) : (
            <span className="font-mono text-[11px]">
              {binding.provider_session_id}
            </span>
          )}
        </Fact>
        <Fact label="Provider account">
          {account.reported ? (
            account.display
          ) : (
            <Absent>{account.display}</Absent>
          )}
        </Fact>
        <Fact label="Workspace">{workspace ?? <Absent />}</Fact>
        <Fact label="Arrived by">{formatText(binding.origin)}</Fact>
        <Fact label="Binding state">{formatText(binding.status)}</Fact>
        <Fact label="Last delivery">
          <DeliveryValue binding={binding} />
        </Fact>
      </dl>
    </li>
  );
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

  // The binding that DELIVERED most recently — considering only bindings that
  // have delivered at all. An unclaimed handoff offer has delivered nothing,
  // ever, so it can never win this, however new its row is: the bridge used to
  // stamp an offer with `last_seen_at = created_at`, and a plain max over every
  // row therefore badged the one row that had never delivered anything
  // (verifier V-XT-5 § A5). `null` here is a real answer — every binding may be
  // an unclaimed offer — and the sections below say so rather than picking one.
  const current = mostRecentlyDelivered(bindings);
  /** Bindings exist, but not one of them has ever delivered. */
  const awaitingFirstDelivery = current === null && bindings.length > 0;
  const claudeBinding =
    bindings.find(
      (binding) =>
        binding.provider === "claude_code" &&
        !isUnclaimedOffer(binding.provider_session_id),
    ) ?? null;
  const provenance = titleProvenance(
    current ? readTitleSource(current) : null,
    current?.provider ?? null,
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
            <BrainCircuit className="h-3.5 w-3.5 text-muted-foreground" />
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

      {/* ── Every tool on this conversation ─────────────────────────────── */}
      {bindings.length > 0 ? (
        <section className="rounded-lg border border-border bg-muted/20 p-3">
          <h3 className="text-sm font-semibold text-foreground">
            {bindings.length === 1
              ? "The coding tool on this conversation"
              : `The ${bindings.length} coding tools on this conversation`}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {bindings.length === 1
              ? "One provider session is bound to this conversation. A handoff would add a second, and both would be named here."
              : "This conversation moved between tools. Each binding below is a different provider session with its own history, account and fidelity — none of them is a copy of another."}
          </p>
          <ul className="mt-2.5 space-y-2">
            {bindings.map((binding, index) => (
              <BindingCard
                key={binding.id}
                binding={binding}
                isCurrent={binding === current}
                index={index}
                total={bindings.length}
              />
            ))}
          </ul>
        </section>
      ) : null}

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

      {/* ── From the coding provider ───────────────────────────────────────
           Provider, session id, workspace and account are stated per binding in
           the tools list above, so they are not repeated here: what is left is
           what only the most recent delivery can answer. */}
      <Group
        source="provider"
        note={
          current && bindings.length > 1
            ? `These are the ${providerLabel(current.provider)} binding's fields — the one that delivered most recently.`
            : awaitingFirstDelivery
              ? NO_DELIVERY_FROM_ANY_TOOL
              : undefined
        }
      >
        <Fact label="Provider">
          {current ? (
            providerLabel(current.provider)
          ) : awaitingFirstDelivery ? (
            <Absent>
              No tool has delivered yet — the offered tools are named above
            </Absent>
          ) : (
            <Absent>No provider — this is an AI Matrx conversation</Absent>
          )}
        </Fact>
        <Fact
          label="Git branch"
          hint="Reported by the provider when the session was on a branch."
        >
          {current ? (
            (readMetaString(current, "git_branch") ?? (
              <Absent>Not reported by this provider version</Absent>
            ))
          ) : (
            <Absent>—</Absent>
          )}
        </Fact>
        <Fact label="Workspace identity">
          {current?.workspace_fingerprint ??
            current?.provider_project_key ?? <Absent />}
        </Fact>
      </Group>

      {/* ── Native continuation, capability-gated by the user's own Mac ────
           Found by PROVIDER, not by position: after a handoff to another tool
           the Claude binding is no longer the newest row, and gating on
           `bindings[0]` silently removed the one native continuation the
           platform has. An unclaimed handoff offer is never offered for native
           continuation — it has no provider session to resume. */}
      {claudeBinding?.provider_session_id && (
        <ContinueOnMyMacPanel
          providerSessionId={claudeBinding.provider_session_id}
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
      {current ? (
        <>
          <Group
            source="sync"
            headerRight={
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                {fidelityVerdict(current.fidelity).label}
              </span>
            }
          >
            <Fact
              label="Fidelity"
              hint={fidelityVerdict(current.fidelity).detail}
            >
              {fidelityVerdict(current.fidelity).detail}
            </Fact>
            <Fact label="Binding state">{formatText(current.status)}</Fact>
            <Fact label="Arrived by">{formatText(current.origin)}</Fact>
            <Fact label="Last delivery">
              <DeliveryValue binding={current} />
            </Fact>
            <Fact label="Session ended">
              {current.ended_at ? (
                formatSessionTimestamp(current.ended_at)
              ) : (
                <Absent>Not ended</Absent>
              )}
            </Fact>
            <Fact label="Managed runtime">
              {current.runtime_kind ? (
                formatText(current.runtime_kind)
              ) : (
                <Absent>None recorded</Absent>
              )}
            </Fact>
            <Fact label="Recorded capabilities">
              {recordedCapabilityLabels(current.capabilities).join(", ") || (
                <Absent>None recorded</Absent>
              )}
            </Fact>
            <Fact label="Writer lease">
              {current.writer_lease_expires_at ? (
                `Expires ${formatSessionTimestamp(current.writer_lease_expires_at)}`
              ) : (
                <Absent>No active lease</Absent>
              )}
            </Fact>
          </Group>
          {bindings.length > 1 && (
            <p className="text-xs text-muted-foreground">
              The delivery facts above are for the{" "}
              {providerLabel(current.provider)} binding that delivered most
              recently. The other {bindings.length - 1} binding
              {bindings.length === 2 ? "" : "s"} on this conversation{" "}
              {bindings.length === 2 ? "is" : "are"} named in full at the top of
              this panel — each is either another tool&apos;s own provider
              session with its own history, or a handoff offer that has
              delivered nothing yet.
            </p>
          )}
        </>
      ) : state === "ready" ? (
        <Group source="sync">
          <Fact label="Delivery">
            <Absent>
              {awaitingFirstDelivery
                ? NO_DELIVERY_FROM_ANY_TOOL
                : "No coding-session binding is attached. Nothing was synced from a provider — this conversation was created inside AI Matrx."}
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
