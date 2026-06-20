"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { updateTopic } from "../../service";
import type { TopicQuotaFields } from "../../types";
import { QuotaSettingsSection } from "../overview/QuotaSettingsSection";

interface AiReviewQuotaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  quotas: TopicQuotaFields;
  keywordCount: number;
  onSaved: (quotas: TopicQuotaFields) => void;
}

export function AiReviewQuotaDialog({
  open,
  onOpenChange,
  topicId,
  quotas,
  keywordCount,
  onSaved,
}: AiReviewQuotaDialogProps) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<TopicQuotaFields>(quotas);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(quotas);
      setError(null);
    }
  }, [open, quotas]);

  const overKeywordLimit = keywordCount > draft.max_keywords;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateTopic(topicId, {
        max_keywords: draft.max_keywords,
        scrapes_per_keyword: draft.scrapes_per_keyword,
        analyses_per_keyword: draft.analyses_per_keyword,
        max_keyword_syntheses: draft.max_keyword_syntheses,
        max_project_syntheses: draft.max_project_syntheses,
        max_documents: draft.max_documents,
        max_tag_consolidations: draft.max_tag_consolidations,
        max_auto_tag_calls: draft.max_auto_tag_calls,
      });
      onSaved(draft);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message ?? "Failed to save pipeline settings.");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <div className="space-y-4 p-4 sm:p-0 sm:pt-2">
      {overKeywordLimit && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          You have {keywordCount} keywords but the limit is {draft.max_keywords}
          . Raise the keyword cap or remove extras before starting research.
        </div>
      )}
      <QuotaSettingsSection
        values={draft}
        onChange={(partial) => setDraft((q) => ({ ...q, ...partial }))}
        disabled={saving}
      />
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saving}
          className="min-h-[44px]"
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerTitle className="px-4 pt-4 text-base font-semibold">
            Pipeline settings
          </DrawerTitle>
          <div className="overflow-y-auto pb-safe">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pipeline settings</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
