"use client";

/**
 * Per-kind admin shell — /administration/utilities/kind-registry/[kind].
 *
 * Server payload (KindDetailData) carries the shape-doctor row + schema +
 * asset lists; this shell fetches the kind's `content_ir.kind_example` rows
 * once in the browser (canonical first) and shares them with the Preview and
 * Gate tabs.
 *
 * Code-splitting: the Gate tab (ajv + dual gate), the Inputs tab (ajv, plus
 * the whole production agent-input stack via VariableInputComponent →
 * ProTextarea), and the Try-input tab (KindInputForm — same heavy stack) are
 * each `next/dynamic({ ssr: false })` behind their tab condition. The Preview tab is a light shell whose heavy renderer is ALREADY
 * split behind SafeBlockRenderer's own `ssr:false` boundary — adding a second
 * boundary here would stack waterfalls (code-splitting skill rule 2), so it is
 * imported statically and simply not rendered until its tab is active.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronRight, Loader2 } from "lucide-react";
import type { KindDetailData } from "@/features/content-ir/admin/kind-detail-types";
import { useKindExamples } from "@/features/content-ir/studio/kind-examples";
import KindPreviewTab from "@/features/content-ir/admin/KindPreviewTab";
import KindSchemaTab from "@/features/content-ir/admin/KindSchemaTab";
import KindAssetsTab from "@/features/content-ir/admin/KindAssetsTab";
import KindExampleManager from "@/features/content-ir/studio/components/KindExampleManager";
import KindAgentButton from "@/features/content-ir/studio/components/KindAgentButton";

const KindGateTab = dynamic(
  () => import("@/features/content-ir/admin/KindGateTab"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading gate runner</span>
      </div>
    ),
  },
);

const KindTryInputTab = dynamic(
  () => import("@/features/content-ir/admin/KindTryInputTab"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading input form</span>
      </div>
    ),
  },
);

const KindInputsTab = dynamic(
  () => import("@/features/content-ir/admin/KindInputsTab"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading input bridge</span>
      </div>
    ),
  },
);

const TABS = [
  "preview",
  "examples",
  "assets",
  "try-input",
  "gate",
  "schema",
  "inputs",
] as const;
type TabId = (typeof TABS)[number];
const TAB_LABELS: Record<TabId, string> = {
  preview: "Preview",
  examples: "Examples",
  assets: "Assets",
  "try-input": "Try input",
  gate: "Gate",
  schema: "Schema",
  inputs: "Inputs",
};

function isTabId(value: string | undefined): value is TabId {
  return TABS.includes(value as TabId);
}

interface KindDetailClientProps {
  detail: KindDetailData;
  initialTab?: string;
}

export default function KindDetailClient({
  detail,
  initialTab,
}: KindDetailClientProps) {
  const [tab, setTab] = useState<TabId>(
    isTabId(initialTab) ? initialTab : "preview",
  );
  // Bumped after any example write so the shared fetch re-runs (admin edits
  // examples in place on the Examples tab).
  const [refreshKey, setRefreshKey] = useState(0);
  // Shared example fetch — extracted to the studio module (one engine, no fork).
  const examples = useKindExamples(detail.id, refreshKey);
  const refreshExamples = () => setRefreshKey((k) => k + 1);

  // The concrete sample the content-block generator teaches from — canonical
  // first, else the newest, else nothing (schema-synthesized downstream).
  const canonicalExampleData = useMemo(() => {
    if (examples.status !== "ready" || examples.rows.length === 0)
      return undefined;
    const canonical = examples.rows.find((row) => row.isCanonical);
    return (canonical ?? examples.rows[0]).data;
  }, [examples]);

  function selectTab(next: TabId) {
    setTab(next);
    // Keep the page deep-linkable without a navigation.
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden bg-textured">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 pr-14">
        <nav
          aria-label="Breadcrumb"
          className="flex w-full min-w-0 flex-wrap items-center gap-1 text-sm sm:w-auto"
        >
          <Link
            href="/administration/utilities/kind-registry"
            className="inline-flex min-h-10 items-center text-muted-foreground underline-offset-2 hover:text-foreground hover:underline sm:min-h-0"
          >
            Kind Registry
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <h1 className="min-w-0 break-words font-semibold text-foreground">
            {detail.label}
          </h1>
        </nav>
        <code className="max-w-full break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          {detail.kind}
        </code>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            detail.isActive
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {detail.isActive ? "active" : "inactive"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          v{detail.version} · {detail.visibility} · updated{" "}
          {detail.updatedAt.slice(0, 19).replace("T", " ")}
        </span>
        <div className="ml-auto">
          <KindAgentButton
            kind={detail.kind}
            label={detail.label}
            part="edit"
            emittedJsonSchema={detail.emittedJsonSchema}
            className="min-h-10"
          >
            Edit with agent
          </KindAgentButton>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-card px-3 py-2 sm:hidden">
        <label
          htmlFor="kind-detail-section"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Kind detail section
        </label>
        <select
          id="kind-detail-section"
          value={tab}
          onChange={(event) => selectTab(event.target.value as TabId)}
          className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {TABS.map((id) => (
            <option key={id} value={id}>
              {TAB_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      <nav
        aria-label="Kind detail sections"
        className="hidden items-center gap-1 overflow-x-auto border-b border-border bg-card px-4 sm:flex"
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`min-h-10 shrink-0 border-b-2 px-3 py-1.5 text-sm transition-colors ${
              tab === id
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {tab === "preview" && (
          <KindPreviewTab kind={detail.kind} examples={examples} />
        )}
        {tab === "examples" && (
          <div className="mx-auto max-w-4xl">
            <KindExampleManager
              kindDefinitionId={detail.id}
              emittedJsonSchema={detail.emittedJsonSchema}
              examples={examples}
              onExamplesChanged={refreshExamples}
              authMode="admin"
            />
          </div>
        )}
        {tab === "try-input" && <KindTryInputTab kind={detail.kind} />}
        {tab === "gate" && (
          <KindGateTab
            kind={detail.kind}
            emittedJsonSchema={detail.emittedJsonSchema}
            examples={examples}
            family={detail.doctorRow.family}
          />
        )}
        {tab === "schema" && (
          <KindSchemaTab
            kind={detail.kind}
            fieldData={detail.fieldData}
            emittedJsonSchema={detail.emittedJsonSchema}
          />
        )}
        {tab === "inputs" && (
          <KindInputsTab
            kind={detail.kind}
            emittedJsonSchema={detail.emittedJsonSchema}
          />
        )}
        {tab === "assets" && (
          <KindAssetsTab
            detail={detail}
            canonicalExampleData={canonicalExampleData}
            onOpenExamples={() => selectTab("examples")}
          />
        )}
      </main>
    </div>
  );
}
