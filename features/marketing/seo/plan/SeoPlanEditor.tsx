"use client";

/**
 * SeoPlanEditor — THE canonical, directly-editable SEO plan for one page.
 *
 * ONE SEO PLAN PER PAGE, AND IT LIVES ON `web.page` (content-planning system of
 * record, invariant 9; Arman, 2026-08-16). This component is the only editor of
 * that plan, and it is mounted — never mirrored, never summarized read-only —
 * in every home where a human works on a page:
 *
 *   1. the marketing page workspace (`PageWorkspace`, the Plan lane),
 *   2. the content-plan NodePanel (a node whose page is real),
 *   3. the CMS page editor's SEO tab (above the served meta fields).
 *
 * It writes to exactly two places, both canonical:
 *   - `web.page.meta_title_desired` / `meta_description_desired` — through
 *     `updatePageIntent` (optimistic concurrency on `version`);
 *   - `web.page.desired_values.keyword_plan` — through the single
 *     read-merge-write `updatePageDesiredValues`, so a sibling card's slice is
 *     never clobbered.
 * The legacy `web.page.target_keyword` TEXT column is read-only during the
 * migration: the plan's keywords are `seo.keyword` library ids (via
 * `ensureKeywordId`, inside `KeywordPicker`), never raw phrases.
 *
 * Draft state is composed here rather than through `useDesiredValueSlice`
 * because this editor spans BOTH a jsonb slice and two columns and commits them
 * under one button — but it follows the same contract that hook documents:
 * reseed from the server only while the draft is clean, so another card's save
 * (which refetches the whole page row) can never wipe an in-progress edit.
 */

import { useState } from "react";
import { Download, Loader2, Save, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import {
  useUpdatePageDesiredValues,
  useUpdatePageIntent,
} from "@/features/marketing/data/hooks";
import { useKeywordLabels } from "@/features/marketing/content-plan/data/hooks";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { KeywordUsageChips } from "@/features/marketing/seo/keyword/KeywordUsageChips";
import type { MarketingPage } from "@/features/marketing/types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";

import {
  readPlannedOutboundLinks,
  readSeoPlan,
  seoPlanToSlice,
  type SeoPlanDraft,
} from "./plan-model";
import {
  SeoPlanInternalLinksField,
  SeoPlanMetaFields,
  SeoPlanPrimaryKeywordField,
  SeoPlanRoleFields,
  SeoPlanSecondaryKeywordsField,
} from "./SeoPlanFields";

export interface SeoPlanEditorProps {
  page: MarketingPage;
  /** Host context for Keyword Intelligence doors. */
  brandId?: string | null;
  /**
   * `card` draws its own SectionCard chrome (the marketing workspace).
   * `bare` renders the fields only — for hosts that already draw a frame
   * (the CMS SEO tab, the plan NodePanel section). Never wrap `card` again.
   */
  variant?: "card" | "bare";
  /** Latest captured metadata — enables "use what the page serves today". */
  observedTitle?: string | null;
  observedDescription?: string | null;
  observedH1?: string | null;
  /**
   * Where the Link plan card lives. Defaults to this page's workspace anchor;
   * pass `null` to hide the door on a surface that cannot reach it.
   */
  linkPlanHref?: string | null;
  className?: string;
}

function stable(draft: SeoPlanDraft, title: string, description: string) {
  return JSON.stringify([seoPlanToSlice(draft) ?? null, title, description]);
}

export function SeoPlanEditor({
  page,
  brandId = null,
  variant = "card",
  observedTitle = null,
  observedDescription = null,
  observedH1 = null,
  linkPlanHref,
  className,
}: SeoPlanEditorProps) {
  const serverPlan = readSeoPlan(page);
  const serverTitle = page.meta_title_desired ?? "";
  const serverDescription = page.meta_description_desired ?? "";
  const serverJson = stable(serverPlan, serverTitle, serverDescription);

  const [draft, setDraft] = useState<SeoPlanDraft>(serverPlan);
  const [title, setTitle] = useState(serverTitle);
  const [description, setDescription] = useState(serverDescription);
  const [seededFrom, setSeededFrom] = useState(serverJson);

  const dirty = stable(draft, title, description) !== seededFrom;

  // Reseed while clean — adjusted during render (React's documented
  // "derive state from props" pattern), never via an effect.
  if (serverJson !== seededFrom && !dirty) {
    setSeededFrom(serverJson);
    setDraft(serverPlan);
    setTitle(serverTitle);
    setDescription(serverDescription);
  }

  const intentMutation = useUpdatePageIntent();
  const desiredMutation = useUpdatePageDesiredValues();
  const saving = intentMutation.isPending || desiredMutation.isPending;

  // The target keyword's phrase — the plan stores an id, and the usage chips
  // (and the copy payload) speak human.
  const primaryLabel = useKeywordLabels(
    draft.primaryKeywordId ? [draft.primaryKeywordId] : [],
  );
  const primaryPhrase = draft.primaryKeywordId
    ? (primaryLabel.data?.find((row) => row.id === draft.primaryKeywordId)
        ?.phrase ?? null)
    : null;

  const metaDirty = title !== serverTitle || description !== serverDescription;
  const planDirty =
    JSON.stringify(seoPlanToSlice(draft) ?? null) !==
    JSON.stringify(seoPlanToSlice(serverPlan) ?? null);

  const save = async () => {
    try {
      if (metaDirty) {
        await intentMutation.mutateAsync({
          siteId: page.site_id,
          pageId: page.id,
          expectedVersion: page.version,
          // READ-ONLY during the migration — pass the stored value straight
          // back so this write can never author the legacy text column.
          targetKeyword: page.target_keyword,
          desiredMetaTitle: title.trim() || null,
          desiredMetaDescription: description.trim() || null,
        });
      }
      if (planDirty) {
        await desiredMutation.mutateAsync({
          siteId: page.site_id,
          pageId: page.id,
          patch: { keyword_plan: seoPlanToSlice(draft) },
        });
      }
      setSeededFrom(stable(draft, title, description));
      toast.success("SEO plan saved");
    } catch (error) {
      toast.error("Could not save the SEO plan", {
        description: extractErrorMessage(error),
      });
    }
  };

  const reset = () => {
    setSeededFrom(serverJson);
    setDraft(serverPlan);
    setTitle(serverTitle);
    setDescription(serverDescription);
  };

  const useObservedMetadata = () => {
    setTitle(observedTitle ?? "");
    setDescription(observedDescription ?? "");
    toast.success("Current metadata copied into the plan");
  };

  const scope = {
    siteId: page.site_id,
    organizationId: page.organization_id,
    pageId: page.id,
    brandId,
  };

  // THE DOOR LAW: the Link plan card owns `outbound_links`; the plan states
  // them and reaches it. Same-page hash on the workspace, a real navigation
  // anywhere else — SectionCard carries `id={anchor}` for both.
  const resolvedLinkPlanHref =
    linkPlanHref === undefined
      ? `${marketingRoutes.sitePage(brandId, page.site_id, page.id)}#link_plan`
      : linkPlanHref;

  const copy = webCopy({
    kind: "web-page-seo-plan",
    label: "SEO plan",
    description:
      "THE one SEO plan for this page — target and supporting keywords, its role in the site plan, and the search appearance it should have.",
    surface: `SEO plan — ${page.url}`,
    data: {
      url: page.url,
      keyword_plan: seoPlanToSlice(serverPlan) ?? null,
      target_keyword_phrase: primaryPhrase,
      meta_title_desired: page.meta_title_desired,
      meta_description_desired: page.meta_description_desired,
      planned_outbound_links: readPlannedOutboundLinks(page),
    },
    lines: [
      ["URL", page.url],
      ["Target keyword", primaryPhrase ?? "not set"],
      ["Supporting keywords", String(serverPlan.secondaryKeywordIds.length)],
      ["Role", serverPlan.pageRole || "not set"],
      ["Feeds authority to", serverPlan.supportsRoutes.join(", ") || "nothing"],
      ["Desired title", page.meta_title_desired ?? "not set"],
      ["Desired description", page.meta_description_desired ?? "not set"],
    ],
    attributes: { page_id: page.id },
  });

  const body = (
    <div className={cn("grid gap-3", variant === "card" && "p-3")}>
      <SeoPlanPrimaryKeywordField
        scope={scope}
        value={draft.primaryKeywordId}
        onChange={(primaryKeywordId) =>
          setDraft((current) => ({ ...current, primaryKeywordId }))
        }
      />
      {primaryPhrase && (observedTitle || observedDescription || observedH1) ? (
        <KeywordUsageChips
          phrase={primaryPhrase}
          fields={[
            { label: "Title", text: observedTitle },
            { label: "Description", text: observedDescription },
            { label: "H1", text: observedH1 },
            { label: "URL", text: page.path },
          ]}
        />
      ) : null}

      <SeoPlanSecondaryKeywordsField
        scope={scope}
        value={draft.secondaryKeywordIds}
        onChange={(secondaryKeywordIds) =>
          setDraft((current) => ({ ...current, secondaryKeywordIds }))
        }
      />

      <SeoPlanRoleFields
        pageRole={draft.pageRole}
        supportsRoutes={draft.supportsRoutes}
        reason={draft.reason}
        onPageRoleChange={(pageRole) =>
          setDraft((current) => ({ ...current, pageRole }))
        }
        onSupportsRoutesChange={(supportsRoutes) =>
          setDraft((current) => ({ ...current, supportsRoutes }))
        }
        onReasonChange={(reason) =>
          setDraft((current) => ({ ...current, reason }))
        }
      />

      {variant === "bare" && (observedTitle || observedDescription) ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={useObservedMetadata}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Use current metadata
          </Button>
        </div>
      ) : null}

      <SeoPlanMetaFields
        title={title}
        description={description}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        idPrefix={`seo-plan-${page.id}`}
      />

      <SeoPlanInternalLinksField
        links={readPlannedOutboundLinks(page)}
        linkPlanHref={resolvedLinkPlanHref}
      />

      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={!dirty || saving}
          onClick={reset}
        >
          <Undo2 className="mr-1.5 h-3.5 w-3.5" />
          Reset
        </Button>
        <Button
          size="sm"
          className="h-8"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          Save SEO plan
        </Button>
      </div>
    </div>
  );

  if (variant === "bare") {
    return <div className={className}>{body}</div>;
  }

  return (
    <SectionCard
      title="SEO plan"
      copy={copy}
      collapsible
      anchor="seo_plan"
      className={className}
      headerExtra={
        <button
          type="button"
          onClick={useObservedMetadata}
          disabled={!observedTitle && !observedDescription}
          aria-label="Fill the plan from current page metadata"
          title="Fill desired title and description from the latest captured page"
          className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      }
    >
      {body}
    </SectionCard>
  );
}
