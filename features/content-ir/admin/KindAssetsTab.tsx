"use client";

/**
 * Assets tab — the kind's control center. The shape-doctor row (all 7 asset
 * cells) sits on top; below it every leg is ACTIONABLE, not just a report:
 * present parts link straight to their editor, and missing parts get a direct
 * way to create them — the deterministic content-block generator (no LLM) for
 * the content_block leg, and a seeded kind-creator agent handoff for the rest.
 *
 * Live lists (skills, content blocks, components, surfaces) come from the
 * privilege-complete server gather (detail.*), so an admin sees platform assets
 * they could never read through RLS directly.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  Minus,
  Pencil,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  ASSET_COLUMNS,
  type AssetColumn,
  type AssetStatus,
} from "@/features/content-ir/registry/shape-doctor";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { KindDetailData } from "@/features/content-ir/admin/kind-detail-types";
import { adminUpsertKindContentBlock } from "@/features/content-ir/studio/kind-content-block-service";
import KindContentBlockGenerator from "@/features/content-ir/studio/components/KindContentBlockGenerator";
import KindAgentButton from "@/features/content-ir/studio/components/KindAgentButton";
import type { GeneratedContentBlock } from "@/features/content-ir/registry/kind-content-block-generator";

// Where each part type is edited today. Content blocks and skills have real
// admin surfaces; components/surfaces are authored by the agent (DB rows) and
// have no dedicated editor yet, so those link to the agent path only.
const CONTENT_BLOCKS_ADMIN = "/administration/agents/system-agents/content-blocks";
const SKILLS_ADMIN = "/administration/agents/skills";

const COLUMN_HEADING: Record<AssetColumn, string> = {
  definition: "Definition",
  example: "Example",
  gate_structural: "Structural gate",
  component: "Component",
  skill: "Skill",
  content_block: "Content block",
  surface: "Surface",
};

function StatusBadge({ status }: { status: AssetStatus }) {
  switch (status) {
    case "ok":
      return (
        <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="h-3 w-3" /> ok
        </span>
      );
    case "warn":
      return (
        <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          <TriangleAlert className="h-3 w-3" /> warn
        </span>
      );
    case "missing":
      return (
        <span className="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">
          <X className="h-3 w-3" /> missing
        </span>
      );
    case "n/a":
      return (
        <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          <Minus className="h-3 w-3" /> n/a
        </span>
      );
  }
}

function ListSection({
  title,
  count,
  children,
  actions,
}: {
  title: string;
  count: number;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-foreground">
          {title}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({count})
          </span>
        </span>
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

interface KindAssetsTabProps {
  detail: KindDetailData;
  /** Canonical (or newest) example data, for the content-block generator. */
  canonicalExampleData?: Json;
  /** Jump to the Examples edit tab. */
  onOpenExamples: () => void;
}

export default function KindAssetsTab({
  detail,
  canonicalExampleData,
  onOpenExamples,
}: KindAssetsTabProps) {
  const router = useRouter();

  const storeContentBlock = async (
    block: GeneratedContentBlock,
  ): Promise<void> => {
    await adminUpsertKindContentBlock(supabase, {
      kindDefinitionId: detail.id,
      block,
    });
    // Re-run the server gather so the new block appears in the list + doctor row.
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {/* Doctor row cells */}
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
          Shape-doctor row (live, recomputed — stored validation_status is never
          trusted)
        </div>
        <div className="divide-y divide-border/60">
          {ASSET_COLUMNS.map((col) => {
            const cell = detail.doctorRow.assets[col];
            return (
              <div key={col} className="flex items-start gap-3 px-3 py-1.5">
                <span className="w-32 shrink-0 text-xs font-medium text-foreground">
                  {COLUMN_HEADING[col]}
                </span>
                <StatusBadge status={cell.status} />
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {cell.detail ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Examples — edit lives on its own tab; this is the quick jump. */}
      <ListSection
        title="Examples"
        count={detail.doctorRow.assets.example.status === "ok" ? 1 : 0}
        actions={
          <button
            type="button"
            onClick={onOpenExamples}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" /> Manage examples
          </button>
        }
      >
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          {detail.doctorRow.assets.example.detail ??
            "Add, edit, promote, or delete examples on the Examples tab."}
        </p>
      </ListSection>

      {/* Skills */}
      <ListSection
        title="Render-block skills teaching this kind"
        count={detail.skills.length}
        actions={
          <>
            <Link
              href={SKILLS_ADMIN}
              target="_blank"
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Skills admin
            </Link>
            <KindAgentButton
              kind={detail.kind}
              label={detail.label}
              part="skill"
              emittedJsonSchema={detail.emittedJsonSchema}
            >
              Create with agent
            </KindAgentButton>
          </>
        }
      >
        {detail.skills.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-muted-foreground">
            No render_block skill teaches this kind (R9: one per kind per syntax).
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {detail.skills.map((s) => (
              <li
                key={`${s.skillId}-${s.syntax}`}
                className="flex items-center gap-2"
              >
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {s.skillId}
                </code>
                <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                  {s.syntax}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ListSection>

      {/* Content blocks — present ones link out; generate/create below. */}
      <ListSection
        title="Content blocks demonstrating this kind"
        count={detail.contentBlocks.length}
        actions={
          <KindAgentButton
            kind={detail.kind}
            label={detail.label}
            part="content_block"
            emittedJsonSchema={detail.emittedJsonSchema}
          >
            Create with agent
          </KindAgentButton>
        }
      >
        <div className="space-y-2 p-2">
          {detail.contentBlocks.length === 0 ? (
            <p className="px-1 py-1 text-xs text-muted-foreground">
              No content block references{" "}
              <code className="font-mono">&quot;__kind&quot;: &quot;{detail.kind}&quot;</code>
              . Generate one below.
            </p>
          ) : (
            <ul className="space-y-1">
              {detail.contentBlocks.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-xs">
                  <span className="text-foreground">{b.label}</span>
                  <code className="font-mono text-[11px] text-muted-foreground">
                    {b.id}
                  </code>
                  <Link
                    href={CONTENT_BLOCKS_ADMIN}
                    target="_blank"
                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Edit
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <KindContentBlockGenerator
            kind={detail.kind}
            label={detail.label}
            emittedJsonSchema={detail.emittedJsonSchema}
            canonicalExample={canonicalExampleData}
            store={storeContentBlock}
          />
        </div>
      </ListSection>

      {/* Components */}
      <ListSection
        title="kind_component rows"
        count={detail.components.length}
        actions={
          <KindAgentButton
            kind={detail.kind}
            label={detail.label}
            part="component"
            emittedJsonSchema={detail.emittedJsonSchema}
          >
            Create with agent
          </KindAgentButton>
        }
      >
        {detail.components.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-muted-foreground">
            No kind_component rows — compiled/legacy render paths (if any) are
            noted in the doctor cell above.
          </p>
        ) : (
          <table className="w-full p-2 text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1 font-medium">Platform</th>
                <th className="px-2 py-1 font-medium">Role</th>
                <th className="px-2 py-1 font-medium">Component key</th>
                <th className="px-2 py-1 font-medium">Source</th>
                <th className="px-2 py-1 font-medium">Active</th>
                <th className="px-2 py-1 font-medium">Default</th>
              </tr>
            </thead>
            <tbody>
              {detail.components.map((c) => (
                <tr key={c.id} className="border-t border-border/60">
                  <td className="px-2 py-1 text-foreground">{c.platform}</td>
                  <td className="px-2 py-1 text-foreground">{c.role}</td>
                  <td className="px-2 py-1 font-mono text-foreground">
                    {c.componentKey}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{c.source}</td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {c.isActive ? "yes" : "no"}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {c.isDefault ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListSection>

      {/* Surfaces */}
      <ListSection
        title="kind_surface rows (detection)"
        count={detail.surfaces.length}
        actions={
          <KindAgentButton
            kind={detail.kind}
            label={detail.label}
            part="surface"
            emittedJsonSchema={detail.emittedJsonSchema}
          >
            Create with agent
          </KindAgentButton>
        }
      >
        {detail.surfaces.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-muted-foreground">
            No detection surface registered (legitimate until Stage 5 — a{" "}
            <code className="font-mono">__kind</code> JSON payload needs none).
          </p>
        ) : (
          <table className="w-full p-2 text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1 font-medium">Surface type</th>
                <th className="px-2 py-1 font-medium">Token</th>
                <th className="px-2 py-1 font-medium">Parser strategy</th>
                <th className="px-2 py-1 font-medium">Streaming</th>
                <th className="px-2 py-1 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {detail.surfaces.map((s) => (
                <tr key={s.id} className="border-t border-border/60">
                  <td className="px-2 py-1 text-foreground">{s.surfaceType}</td>
                  <td className="px-2 py-1 font-mono text-foreground">{s.token}</td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {s.parserStrategy}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {s.streaming ? "yes" : "no"}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {s.isActive ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListSection>
    </div>
  );
}
