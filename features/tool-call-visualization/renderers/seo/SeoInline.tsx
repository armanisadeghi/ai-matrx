"use client";

/**
 * SeoInline — THE renderer for the unified `seo` tool (and the legacy
 * `seo_check_meta_tags_batch` / `seo_check_meta_titles` /
 * `seo_check_meta_descriptions` / `seo_get_keyword_data` names still present
 * in persisted history). One renderer, every SEO payload.
 *
 * Registered with `chrome: "card"`, so the shell renders THIS card directly —
 * no folded glyph line above it, no duplicate icon/label. Built on the
 * canonical `ToolResultCard`; the header carries the count + pass/fail summary
 * so no body repeats it.
 *
 * Every visual comes from core SEO components:
 *   • meta checks   -> `features/marketing/seo/serp` (SerpResult, SerpFieldChips) via SerpToolInline
 *   • keyword data  -> `features/marketing/seo/keyword-research` KeywordMetrics primitives
 *   • rank receipts -> `features/marketing/seo/rank` types
 * Nothing here is a private fork — hardening those cores hardens this view.
 */

import React from "react";
import { Gauge, TrendingUp, Trophy, type LucideIcon } from "lucide-react";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal } from "../_shared";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { ToolResultCard } from "../_shared-entity/ToolResultCard";
import { SerpToolInline } from "../seo-shared/SerpToolInline";
import { KeywordDataInlineBody } from "./KeywordDataBody";
import { RankReceiptBody, type RankRunArgs } from "./RankReceiptBody";
import {
  resolveSeoVariant,
  seoVariantSub,
  seoVariantTitle,
  type SeoVariant,
} from "./resolve";

const SEO_ICON_TINT = "text-emerald-600 dark:text-emerald-400";

function variantIcon(variant: SeoVariant): LucideIcon {
  switch (variant.kind) {
    case "meta":
      return Gauge;
    case "keywords":
      return TrendingUp;
    case "rank":
      return Trophy;
  }
}

/** The collect_rank call's own arguments — the receipt carries no identity. */
export function rankRunArgs(props: ToolRendererProps): RankRunArgs {
  const { entry } = props;
  return {
    keyword: getArg<string>(entry, "keyword"),
    provider: getArg<string>(entry, "provider"),
    targetDomain: getArg<string>(entry, "target_domain"),
    country: getArg<string>(entry, "country"),
    language: getArg<string>(entry, "language"),
    device: getArg<string>(entry, "device"),
    location: getArg<string>(entry, "location"),
  };
}

export const SeoInline: React.FC<ToolRendererProps> = (props) => {
  const {
    entry,
    onOpenOverlay,
    onOpenWindowPanel,
    toolGroupId,
    expanded,
    onToggleExpanded,
  } = props;

  if (entry.status === "error") {
    return (
      <ToolErrorCard
        entry={entry}
        onOpenOverlay={onOpenOverlay}
        toolGroupId={toolGroupId}
      />
    );
  }
  if (!isTerminal(entry)) return null;

  const variant = resolveSeoVariant(entry);
  if (!variant) return <GenericRenderer {...props} />;

  const openFullView = onOpenOverlay
    ? () => onOpenOverlay(`tool-group-${toolGroupId ?? "default"}`)
    : undefined;

  return (
    <ToolResultCard
      icon={variantIcon(variant)}
      iconClassName={SEO_ICON_TINT}
      title={seoVariantTitle(variant)}
      sub={seoVariantSub(variant)}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      onOpenWindowPanel={onOpenWindowPanel ? () => onOpenWindowPanel() : undefined}
      onOpenOverlay={onOpenOverlay ? () => onOpenOverlay() : undefined}
    >
      {variant.kind === "meta" && (
        <SerpToolInline
          entries={variant.entries}
          noun={variant.noun}
          titlePlaceholder={variant.titlePlaceholder}
          descriptionPlaceholder={variant.descriptionPlaceholder}
          onOpenFullView={openFullView}
        />
      )}
      {variant.kind === "keywords" && (
        <KeywordDataInlineBody data={variant.data} onOpenOverlay={openFullView} />
      )}
      {variant.kind === "rank" && (
        <RankReceiptBody receipt={variant.receipt} args={rankRunArgs(props)} />
      )}
    </ToolResultCard>
  );
};
