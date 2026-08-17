"use client";

/**
 * The per-field children of THE canonical SEO plan editor (`SeoPlanEditor`).
 *
 * THE CANONICAL COMPONENT LAW: one component renders the shape. A surface that
 * needs only PART of the SEO plan composes these children — it never
 * hand-writes a second renderer for a field. Every child is CONTROLLED and
 * persistence-free: `SeoPlanEditor` owns the draft and the one save path.
 */

import Link from "next/link";
import { BrainCircuit, Link2, X } from "lucide-react";

import TextArrayInput from "@/components/official/TextArrayInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { KeywordPicker } from "@/features/marketing/content-plan/components/KeywordPicker";
import { useKeywordLabels } from "@/features/marketing/content-plan/data/hooks";
import { MetaRecommendations } from "@/features/marketing/seo/serp/MetaRecommendations";
import { SerpFieldChips } from "@/features/marketing/seo/serp/SerpValidation";
import {
  evaluateMetaDescription,
  evaluateMetaTitle,
} from "@/features/marketing/seo/serp/metrics";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import type { PlannedLinkEntry } from "@/features/marketing/types";

import { PAGE_ROLES, PAGE_ROLE_LABELS, type PageRole } from "./plan-model";

// THE NAMING LAW: the desired-metadata fields render the declared labels of
// the `web.page` surface byte-identically, in every host.
const L = surfaceValueLabels(marketingPageManifest);

export interface SeoPlanKeywordScope {
  siteId: string;
  organizationId: string;
  /** The measured page — carried so Keyword Intelligence opens in context. */
  pageId?: string;
  brandId?: string | null;
}

/** THE target keyword — a `seo.keyword` library id, never a raw phrase. */
export function SeoPlanPrimaryKeywordField({
  scope,
  value,
  onChange,
}: {
  scope: SeoPlanKeywordScope;
  value: string | null;
  onChange: (keywordId: string | null) => void;
}) {
  return (
    <div className="space-y-1.5" data-surface-value="seo_plan_primary_keyword">
      <Label className="text-xs">Target keyword</Label>
      <KeywordPicker
        siteId={scope.siteId}
        organizationId={scope.organizationId}
        value={value}
        onChange={onChange}
        placeholder="The one search term this page should win"
      />
    </div>
  );
}

/** Supporting terms this page should also rank for — library ids, as chips. */
export function SeoPlanSecondaryKeywordsField({
  scope,
  value,
  onChange,
}: {
  scope: SeoPlanKeywordScope;
  value: string[];
  onChange: (keywordIds: string[]) => void;
}) {
  const openKeywordWindow = useOpenKeywordWindow();
  const labels = useKeywordLabels(value);
  const phraseById = new Map(
    (labels.data ?? []).map((row) => [row.id, row.phrase]),
  );

  return (
    <div
      className="space-y-1.5"
      data-surface-value="seo_plan_secondary_keywords"
    >
      <Label className="text-xs">Supporting keywords</Label>
      <KeywordPicker
        siteId={scope.siteId}
        organizationId={scope.organizationId}
        value={null}
        clearable={false}
        showDetails={false}
        placeholder="Add a supporting keyword"
        onChange={(keywordId) => {
          if (!keywordId || value.includes(keywordId)) return;
          onChange([...value, keywordId]);
        }}
      />
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No supporting keywords planned yet.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {value.map((keywordId) => {
            const phrase = phraseById.get(keywordId);
            return (
              <span
                key={keywordId}
                className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border bg-muted pl-2 text-xs text-foreground"
              >
                {/* THE DOOR LAW: a keyword we can resolve is reachable. */}
                <button
                  type="button"
                  className="max-w-52 truncate py-1 text-left hover:text-primary"
                  title={
                    phrase
                      ? `Open Keyword Intelligence for ${phrase}`
                      : "Loading keyword…"
                  }
                  disabled={!phrase}
                  onClick={() =>
                    phrase &&
                    openKeywordWindow({
                      phrase,
                      organizationId: scope.organizationId,
                      siteId: scope.siteId,
                      pageId: scope.pageId,
                      brandId: scope.brandId ?? undefined,
                    })
                  }
                >
                  {phrase ?? "Loading keyword…"}
                </button>
                <button
                  type="button"
                  className="p-1 text-muted-foreground hover:text-primary"
                  aria-label={
                    phrase
                      ? `Open Keyword Intelligence for ${phrase}`
                      : "Loading keyword"
                  }
                  disabled={!phrase}
                  onClick={() =>
                    phrase &&
                    openKeywordWindow({
                      phrase,
                      organizationId: scope.organizationId,
                      siteId: scope.siteId,
                      pageId: scope.pageId,
                      brandId: scope.brandId ?? undefined,
                    })
                  }
                >
                  <BrainCircuit className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="p-1 pr-1.5 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${phrase ?? "keyword"} from the plan`}
                  onClick={() =>
                    onChange(value.filter((id) => id !== keywordId))
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The page's role in the site-wide strategy, what it feeds, and why. */
export function SeoPlanRoleFields({
  pageRole,
  supportsRoutes,
  reason,
  onPageRoleChange,
  onSupportsRoutesChange,
  onReasonChange,
}: {
  pageRole: string;
  supportsRoutes: string[];
  reason: string;
  onPageRoleChange: (value: string) => void;
  onSupportsRoutesChange: (value: string[]) => void;
  onReasonChange: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-1.5" data-surface-value="seo_plan_page_role">
        <Label className="text-xs">Role in the site plan</Label>
        <Select
          value={pageRole || undefined}
          onValueChange={(next) => onPageRoleChange(next)}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="What job does this page do?" />
          </SelectTrigger>
          <SelectContent>
            {PAGE_ROLES.map((role: PageRole) => (
              <SelectItem key={role} value={role}>
                {PAGE_ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5" data-surface-value="seo_plan_supports_routes">
        <Label className="text-xs">Feeds authority to</Label>
        <TextArrayInput
          value={supportsRoutes}
          onChange={onSupportsRoutesChange}
          placeholder="Add a money-page route, e.g. /services/root-canal (press Enter)"
          chipClassName="bg-muted text-foreground"
          showCopyIcon={false}
        />
      </div>

      <div className="space-y-1.5" data-surface-value="seo_plan_reason">
        <Label htmlFor="seo-plan-reason" className="text-xs">
          Why this assignment
        </Label>
        <Textarea
          id="seo-plan-reason"
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          minHeight={64}
          maxHeight={140}
          placeholder="The reasoning a human can audit later — why this keyword, this role, these targets."
        />
      </div>
    </>
  );
}

/** The desired search appearance — `web.page.meta_*_desired`. */
export function SeoPlanMetaFields({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  idPrefix = "seo-plan",
}: {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  idPrefix?: string;
}) {
  const titleEval = title.trim() ? evaluateMetaTitle(title) : null;
  const descriptionEval = description.trim()
    ? evaluateMetaDescription(description)
    : null;

  return (
    <>
      <div className="space-y-1.5" data-surface-value="desired_title">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-desired-title`} className="text-xs">
            {L.desired_title}
          </Label>
          {titleEval ? (
            <SerpFieldChips
              chars={titleEval.charCount}
              pixels={titleEval.pixelWidth}
              ok={titleEval.ok}
            />
          ) : (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              0 characters
            </span>
          )}
        </div>
        <Input
          id={`${idPrefix}-desired-title`}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Title you want searchers to see"
        />
      </div>

      <div
        className="space-y-1.5"
        data-surface-value="desired_description"
      >
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-desired-description`} className="text-xs">
            {L.desired_description}
          </Label>
          {descriptionEval ? (
            <SerpFieldChips
              chars={descriptionEval.charCount}
              pixels={descriptionEval.pixelWidth}
              ok={descriptionEval.ok}
            />
          ) : (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              0 characters
            </span>
          )}
        </div>
        <Textarea
          id={`${idPrefix}-desired-description`}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          minHeight={86}
          maxHeight={160}
          placeholder="Description you want searchers to see"
        />
      </div>

      {titleEval?.issues.length || descriptionEval?.issues.length ? (
        <MetaRecommendations
          titleEval={titleEval}
          descriptionEval={descriptionEval}
          compact
          issuesOnly
        />
      ) : null}
    </>
  );
}

/**
 * The planned internal links this page should carry. READ-ONLY here on
 * purpose: `outbound_links` is the existing link-plan store (one link-plan
 * system, scored by link compliance) and the Link plan card owns editing it —
 * so this field states the plan and hands over THE DOOR to that card.
 */
export function SeoPlanInternalLinksField({
  links,
  linkPlanHref,
}: {
  links: PlannedLinkEntry[];
  /** Where the Link plan card lives. Null when the page has no workspace yet. */
  linkPlanHref: string | null;
}) {
  return (
    <div className="space-y-1.5" data-surface-value="seo_plan_internal_links">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Planned internal links</Label>
        {linkPlanHref ? (
          <Link
            href={linkPlanHref}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <Link2 className="h-3 w-3" />
            Edit in the Link plan
          </Link>
        ) : null}
      </div>
      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No internal links planned for this page yet.
          {linkPlanHref ? " Plan them in the Link plan card." : ""}
        </p>
      ) : (
        <ul className="space-y-1 rounded-md border border-border bg-muted/20 p-2.5 text-xs">
          {links.map((link) => (
            <li
              key={link.id ?? link.url}
              className="flex flex-wrap items-baseline gap-1.5"
            >
              {link.anchor_text ? (
                <span className="text-foreground">
                  &ldquo;{link.anchor_text}&rdquo;
                </span>
              ) : (
                <span className="text-muted-foreground">any anchor</span>
              )}
              <span aria-hidden="true">&rarr;</span>
              <span className="truncate font-mono text-muted-foreground">
                {link.url}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
