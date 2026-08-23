"use client";

// features/admin/shared-knowledge/packs/PackGuidelinesSection.tsx
//
// The guidelines SKELETON — plain prose a non-technical owner reads and edits;
// seeded onto a site as its kw_guidelines when it has none (then the site owns
// it). Saved through seo.starter_pack_save.

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { savePack, type AdminPackDetail } from "./data";

export function PackGuidelinesSection({ detail, onChanged }: { detail: AdminPackDetail; onChanged: () => Promise<void> }) {
  const canAuthor = detail.pack.can_author;
  const [text, setText] = useState(detail.pack.guidelines ?? "");
  useEffect(() => setText(detail.pack.guidelines ?? ""), [detail.pack.guidelines]);
  const dirty = text !== (detail.pack.guidelines ?? "");
  const save = useMutation({
    mutationFn: () => savePack({ id: detail.pack.id, guidelines: text.trim() || null }),
    onSuccess: async () => {
      toast.success("Guidelines saved");
      await onChanged();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Who the real buyer is, which signals mean consumer vs enterprise, what looks valuable but is not, what is always high value — with clearly marked blanks for what only the business can answer. Every classifier and valuation agent is handed this text for a site in the industry.
      </p>
      <Textarea
        value={text}
        disabled={!canAuthor}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[28rem] font-mono text-xs leading-relaxed"
        placeholder="Who buys. What a consumer query looks like. What an enterprise query looks like. [BLANK: the business's service area]. …"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] tabular-nums text-muted-foreground">{words} words</span>
        {canAuthor ? (
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
            Save guidelines
          </Button>
        ) : null}
      </div>
    </div>
  );
}
