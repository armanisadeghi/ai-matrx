"use client";

/**
 * StudyPackBlock — THE renderer for the `study_pack_set` kind. There is no
 * other.
 *
 * 🚨 **DELEGATE, NEVER REIMPLEMENT** (the runtime-wrapper law —
 * NodeOutcomeBlock's DelegatedOutput is the precedent). This component is a
 * TRANSPARENT ROUTER over the pack's members: it draws a compact pack header
 * and hands each member subtree straight back to the kind registry
 * (`KindInstanceRender`), so `study_notes`, `flashcard_set`, `quiz_set` and
 * `lesson_script_set` are drawn by their OWN canonical components — the same
 * pixels those kinds render everywhere else. The moment this file renders a
 * flashcard or a quiz question itself, the layer model is dead.
 *
 * Streaming-first: the bridge (features/content-ir/kinds/study-pack.ts) hands
 * over whichever members have arrived; the rest render their kind's loading
 * skeleton (the kind loading registry — never a bespoke spinner) until the
 * stream delivers them or the pack completes without them.
 */

import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  STUDY_PACK_CHILDREN,
  type StudyPackChild,
  type StudyPackData,
} from "@/features/content-ir/kinds/study-pack";
import { resolveKindLoadingComponent } from "@/features/content-ir/react/loading/kind-loading-registry";
import { resolveLoadingSlugForKind } from "@/features/content-ir/react/loading/resolve-loading-slug";
import { cn } from "@/lib/utils";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accepts either the streaming bridge output ({ children, isComplete }) or a
 * raw persisted pack value (wire spellings), because persisted surfaces hand
 * the block the stored document directly.
 */
export function readStudyPackData(serverData: unknown): StudyPackData {
  const record = isRecord(serverData) ? serverData : {};

  if (Array.isArray(record.children)) {
    return {
      title: typeof record.title === "string" ? record.title : "",
      topic: typeof record.topic === "string" ? record.topic : "",
      audience: typeof record.audience === "string" ? record.audience : "",
      children: record.children.filter(
        (child): child is StudyPackChild =>
          isRecord(child) && isRecord(child.value),
      ),
      sourcesSummary: isRecord(record.sourcesSummary)
        ? record.sourcesSummary
        : null,
      isComplete: record.isComplete !== false,
    };
  }

  // Raw persisted value — same coercion the bridge performs, complete.
  const children: StudyPackChild[] = [];
  for (const member of STUDY_PACK_CHILDREN) {
    const raw = record[member.key];
    if (!isRecord(raw)) continue;
    children.push({ ...member, value: raw, complete: true });
  }
  return {
    title: typeof record.title === "string" ? record.title : "",
    topic: typeof record.topic === "string" ? record.topic : "",
    audience: typeof record.audience === "string" ? record.audience : "",
    children,
    sourcesSummary: isRecord(record.sources_summary)
      ? record.sources_summary
      : null,
    isComplete: true,
  };
}

/** A member that hasn't arrived yet — its kind's own loading skeleton. */
function MemberSkeleton({ kind, label }: { kind: string; label: string }) {
  // THE ONE resolution (declared → derived → generic). Reading
  // `getDefinition().loadingComponent` skipped the side map a Python-owned
  // kind's declaration lives in, did no derivation at all, and passed an
  // invalid slug straight through to the generic skeleton — the exact trap
  // `resolve-loading-slug.ts` exists to close. It agreed only by luck: all
  // four current members carry a valid COMPILED slug.
  const Loading = resolveKindLoadingComponent(resolveLoadingSlugForKind(kind).slug);
  return <Loading kind={kind} title={label} phase="reserved" />;
}

export interface StudyPackBlockProps {
  serverData?: unknown;
  className?: string;
}

export default function StudyPackBlock({
  serverData,
  className,
}: StudyPackBlockProps) {
  const { title, topic, audience, children, isComplete } =
    readStudyPackData(serverData);

  const arrived = new Map(children.map((child) => [child.key, child]));
  const artifactCount = children.length;

  return (
    <article className={cn("space-y-3 text-foreground", className)}>
      {/* Compact pack header — the only pixels this block draws itself. */}
      <header className="rounded-lg border border-border bg-card px-3 py-2">
        <h2 className="text-base font-semibold leading-snug">
          {title || "Study pack"}
        </h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {topic ? <span>{topic}</span> : null}
          {topic && audience ? <span aria-hidden>·</span> : null}
          {audience ? <span>{audience}</span> : null}
          {(topic || audience) && <span aria-hidden>·</span>}
          <span className="tabular-nums">
            {artifactCount} of {STUDY_PACK_CHILDREN.length} artifacts
            {!isComplete ? " so far" : ""}
          </span>
        </p>
      </header>

      {STUDY_PACK_CHILDREN.map((member) => {
        const child = arrived.get(member.key);
        if (child) {
          // Transparent delegation — the child's own kind component draws it.
          return (
            <div
              key={member.key}
              className="rounded-lg border border-border bg-card p-3"
            >
              <KindInstanceRender
                kind={child.kind}
                value={child.value}
                showRoutingNote={false}
                variant="bare"
              />
            </div>
          );
        }
        // Not here yet: while the pack streams, that kind's own skeleton. A
        // COMPLETE pack that simply doesn't include this member shows nothing.
        if (isComplete) return null;
        return (
          <MemberSkeleton
            key={member.key}
            kind={member.kind}
            label={member.label}
          />
        );
      })}
    </article>
  );
}
