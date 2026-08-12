"use client";

/**
 * Content-plan adapter for THE canonical KeywordInput. `plan.node` and its
 * supporting-keyword edges store canonical keyword ids, while the product
 * primitive intentionally edits phrases. This thin boundary resolves the
 * saved id to a phrase and ensures any submitted phrase in the universal
 * keyword plane before returning its id. Arbitrary entry and library picks
 * therefore share exactly one path.
 */
import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KeywordInput } from "@/features/marketing/seo/keyword/KeywordInput";
import { ensureKeywordId } from "@/features/marketing/seo/keyword/data";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { useKeywordLabels, useSiteKeywordValues } from "../data/hooks";

export function KeywordPicker({
  siteId,
  organizationId,
  value,
  onChange,
  placeholder = "Enter a keyword",
  clearable = true,
  showDetails = true,
}: {
  siteId: string;
  organizationId: string;
  value: string | null;
  onChange: (keywordId: string | null) => void | Promise<void>;
  placeholder?: string;
  clearable?: boolean;
  showDetails?: boolean;
}) {
  const selected = useKeywordLabels(value ? [value] : []);
  const siteValues = useSiteKeywordValues(value ? siteId : null);
  const selectedPhrase = value
    ? (selected.data?.find((row) => row.id === value)?.phrase ?? "")
    : "";
  const siteValue = value
    ? (siteValues.data ?? []).find((row) => row.keyword_id === value)
    : undefined;
  // null means "follow the resolved saved phrase". A real string is an
  // in-progress edit; this avoids an effect whose only job would copy props
  // into state when the id-to-phrase query resolves.
  const [draftPhrase, setDraftPhrase] = useState<string | null>(null);
  const phrase = draftPhrase ?? selectedPhrase;
  const [committing, setCommitting] = useState(false);

  const commit = async (nextPhrase: string) => {
    const trimmed = nextPhrase.trim();
    if (!trimmed || committing) return;
    setCommitting(true);
    try {
      const keywordId = await ensureKeywordId(trimmed);
      await onChange(keywordId);
      // The non-clearable, null-valued picker is the repeated-entry form used
      // for supporting keywords; clear it after the association write succeeds.
      setDraftPhrase(clearable ? null : "");
    } catch (error) {
      toast.error("Could not use this keyword", {
        description: extractErrorMessage(error),
      });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1">
        <KeywordInput
          value={phrase}
          onChange={setDraftPhrase}
          onSubmit={(next) => void commit(next)}
          onSelect={(next) => void commit(next)}
          scope={{ organizationId, siteId }}
          placeholder={placeholder}
          disabled={committing}
          showDetails={showDetails}
          className="min-w-0 flex-1"
        />
        {clearable && value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0"
            aria-label="Clear keyword"
            onClick={() => {
              setDraftPhrase("");
              void onChange(null);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      {siteValue ? (
        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          {siteValue.workflow_status ? (
            <span className="rounded bg-muted px-1.5 py-0.5">
              {siteValue.workflow_status}
            </span>
          ) : null}
          {siteValue.content_role ? (
            <span className="rounded bg-muted px-1.5 py-0.5">
              {siteValue.content_role}
            </span>
          ) : null}
          {siteValue.priority_score != null ? (
            <span className="rounded bg-muted px-1.5 py-0.5">
              Priority {Number(siteValue.priority_score).toFixed(0)}
            </span>
          ) : null}
        </div>
      ) : null}
      {phrase.trim() && phrase.trim() !== selectedPhrase.trim() ? (
        <p className="text-[11px] text-muted-foreground">
          Press Enter to use this keyword.
        </p>
      ) : null}
    </div>
  );
}
