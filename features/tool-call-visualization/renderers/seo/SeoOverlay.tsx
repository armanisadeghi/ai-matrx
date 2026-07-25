"use client";

/**
 * SeoOverlay — the full-size body for the `seo` tool's Results tab.
 *
 * Same shape resolver as the inline card, routed to the roomy variant of each
 * view: meta checks become a staged Google search-results page (search chrome
 * + full-size SerpResult + per-field pixel/character bars + every issue), and
 * keyword data becomes the full table with 12-month trends. Nothing that the
 * inline card truncated is missing here.
 *
 * The universal tool header supplies the title + stats, so this renders no
 * header of its own.
 */

import React from "react";

import type { ToolRendererProps } from "../../types";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { SerpToolOverlay } from "../seo-shared/SerpToolOverlay";
import { KeywordDataOverlayBody } from "./KeywordDataBody";
import { RankReceiptBody } from "./RankReceiptBody";
import { rankRunArgs } from "./SeoInline";
import { resolveSeoVariant } from "./resolve";

export const SeoOverlay: React.FC<ToolRendererProps> = (props) => {
  const { entry, onOpenOverlay, toolGroupId } = props;

  if (entry.status === "error") {
    return (
      <ToolErrorCard
        entry={entry}
        onOpenOverlay={onOpenOverlay}
        toolGroupId={toolGroupId}
      />
    );
  }

  const variant = resolveSeoVariant(entry);
  if (!variant) return <GenericRenderer {...props} />;

  if (variant.kind === "meta") {
    return (
      <SerpToolOverlay
        entries={variant.entries}
        noun={variant.noun}
        titlePlaceholder={variant.titlePlaceholder}
        descriptionPlaceholder={variant.descriptionPlaceholder}
      />
    );
  }

  if (variant.kind === "keywords") {
    return <KeywordDataOverlayBody data={variant.data} />;
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-muted/30 p-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <RankReceiptBody receipt={variant.receipt} args={rankRunArgs(props)} />
      </div>
    </div>
  );
};
