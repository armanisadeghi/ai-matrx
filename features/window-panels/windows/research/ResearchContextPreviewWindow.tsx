"use client";

/**
 * CONTEXT PREVIEW WINDOW — the full-size answer to "what will the agent
 * actually receive?"
 *
 * The viewing machinery (section rail, Everything view, Rendered/Raw/Split,
 * ContentActionBar) is the generic `TextSectionsWindow` primitive
 * (`features/window-panels/windows/text-sections/TextSectionsWindow.tsx`),
 * extracted from this window because "read labeled chunks of text properly"
 * is universal. What stays HERE is everything research-specific: resolving the
 * bundle, mapping variables to the picker's human labels, the truncation
 * footer, and the on-demand (lazy context) section.
 *
 * Only the bundle DESCRIPTOR crosses the overlay boundary (a few KB of
 * selectors). The window resolves it here — pushing a resolved 300k-character
 * payload through Redux would be the wrong trade.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TextSectionsWindow,
  type TextSection,
} from "@/features/window-panels/windows/text-sections/TextSectionsWindow";
import { formatChars, formatTokens } from "@/lib/tokens/estimate";
import { getResourceManifest } from "@/features/research/service/resources";
import { resolveBundle } from "@/features/research/resources/resolve";
import { kindDef } from "@/features/research/resources/catalog";
import type { AgentResourceReference } from "@/features/agents/agent-context/resource-reference";
import type {
  ContextBundle,
  ResolutionReport,
} from "@/features/research/resources/types";

interface ResearchContextPreviewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string | null;
  bundle: ContextBundle | null;
  title?: string;
}

export default function ResearchContextPreviewWindow({
  isOpen,
  onClose,
  topicId,
  bundle,
  title,
}: ResearchContextPreviewWindowProps) {
  if (!isOpen) return null;
  return (
    <ResearchContextPreviewWindowInner
      onClose={onClose}
      topicId={topicId}
      bundle={bundle}
      title={title}
    />
  );
}

function ResearchContextPreviewWindowInner({
  onClose,
  topicId,
  bundle,
  title,
}: Omit<ResearchContextPreviewWindowProps, "isOpen">) {
  /**
   * One result object, stamped with the request it answers.
   *
   * `loading` and "nothing was handed to me" are DERIVED from that stamp rather
   * than set in the effect body: a synchronous setState inside an effect is a
   * cascading render (react-hooks/set-state-in-effect). The effect only writes
   * state from its async callbacks, which is exactly what the rule allows.
   */
  interface Resolved {
    key: string;
    variables: Record<string, string>;
    contextRefs: Record<string, unknown>;
    report: ResolutionReport | null;
    error: string | null;
  }
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const hasInput = Boolean(topicId && bundle);
  const requestKey = `${topicId ?? ""}:${reloadKey}`;
  const loading = hasInput && resolved?.key !== requestKey;
  const variables = resolved?.key === requestKey ? resolved.variables : null;
  const contextRefs =
    resolved?.key === requestKey ? resolved.contextRefs : null;
  const report = resolved?.key === requestKey ? resolved.report : null;
  const error = resolved?.key === requestKey ? resolved.error : null;

  useEffect(() => {
    if (!topicId || !bundle) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getResourceManifest(topicId);
        const out = await resolveBundle(manifest, bundle);
        if (cancelled) return;
        setResolved({
          key: requestKey,
          variables: out.variables,
          contextRefs: out.contextRefs,
          report: out.report,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setResolved({
          key: requestKey,
          variables: {},
          contextRefs: {},
          report: null,
          error:
            e instanceof Error ? e.message : "Could not build the preview",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId, bundle, requestKey]);

  /**
   * Variable → the human labels the PICKER shows for the kinds feeding it.
   * The label leads; the wire name stays visible underneath because it is what
   * the agent actually receives.
   */
  const labelsByVariable = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of report?.perKind ?? []) {
      if (k.included <= 0 || k.delivery === "context") continue;
      const label = kindDef(k.kind)?.label ?? k.kind;
      const prev = map.get(k.variable);
      map.set(k.variable, prev ? `${prev}, ${label}` : label);
    }
    return map;
  }, [report]);

  const sections = useMemo<TextSection[]>(() => {
    const out: TextSection[] = Object.keys(variables ?? {}).map((n) => ({
      key: n,
      label: labelsByVariable.get(n) ?? n,
      sublabel: n,
      sublabelIsCode: true,
      text: variables?.[n] ?? "",
    }));

    // On-demand resources are part of "what the agent receives" too — as
    // references it can open, not injected text. The preview says so instead
    // of hiding the lazy half of the payload.
    const refEntries = Object.entries(contextRefs ?? {});
    if (refEntries.length > 0) {
      const lines = refEntries.map(([key, value]) => {
        const ref = value as AgentResourceReference;
        return `- \`${key}\` — ${ref.resource_type} \`${ref.resource_id}\``;
      });
      out.push({
        key: "__context_refs__",
        label: "Attached on demand",
        sublabel: "lazy context — read only if the agent chooses",
        badge: "on demand",
        text: [
          "These items are NOT injected into the prompt. Each travels as a reference in the request's context; the agent sees a short descriptor and opens the body through its context tool only if it decides to.",
          "",
          ...lines,
        ].join("\n"),
      });
    }
    return out;
  }, [variables, contextRefs, labelsByVariable]);

  const collectData = useCallback(
    (): Record<string, unknown> => ({ topicId, bundle, title }),
    [topicId, bundle, title],
  );

  const stats = report ? (
    <span className="text-[11px] text-muted-foreground">
      {Object.keys(variables ?? {}).length} variable
      {Object.keys(variables ?? {}).length === 1 ? "" : "s"} ·{" "}
      {formatChars(report.totalChars)} chars · ~
      {formatTokens(report.totalTokens)} tokens
      {Object.keys(contextRefs ?? {}).length > 0 &&
        ` · ${Object.keys(contextRefs ?? {}).length} on demand`}
    </span>
  ) : null;

  const truncationFooter =
    report && (report.truncated || report.exceedsBudget) ? (
      <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/[0.07] p-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <Scissors className="h-3.5 w-3.5" />
          Not everything got in
        </div>
        <ul className="mt-1 space-y-0.5 pl-4 text-[10px] text-amber-700/90 dark:text-amber-400/90">
          {report.notes.map((note, i) => (
            <li key={i} className="list-disc">
              {note}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <TextSectionsWindow
      onClose={onClose}
      windowTitle="Context Preview"
      contentTitle={title ?? "Research context"}
      sections={sections}
      railLabel="Variables"
      loading={loading}
      loadingLabel="Building the context…"
      error={error}
      emptyNotice={
        hasInput
          ? "This selection produced no content."
          : "No selection was handed to this preview."
      }
      toolbarExtras={
        <>
          {stats}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Rebuild
          </Button>
        </>
      }
      railFooter={truncationFooter}
      instanceKeyPrefix="research-context-preview"
      metadata={{
        topicId,
        bundle: bundle?.name ?? null,
      }}
      windowId="research-context-preview-window"
      overlayId="researchContextPreviewWindow"
      onCollectData={collectData}
    />
  );
}
