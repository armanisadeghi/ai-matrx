"use client";

// features/marketing/reports/saved/GenerateSeoReportButton.tsx — saves a report
// built from real data as a versioned SEO report, through `useToolAction`
// (`seo_report save`, the screen-run door).
//
// The button is never hidden. With nothing to save it is disabled and its
// tooltip says why; when the server refuses (today: `chat.artifact` row
// security refuses a save made outside a conversation) the short reason sits
// beside it and the server's own words sit in the tooltip.

import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { InfoHint } from "@/components/official/InfoHint";
import { useGenerateSeoReport } from "./hooks";
import type { SeoReportDraft } from "./types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export function GenerateSeoReportButton({
  draft,
  unavailableReason,
}: {
  draft: SeoReportDraft | null;
  /** Why there is nothing to save yet — one sentence, ≤140 characters. */
  unavailableReason: string;
}) {
  const { generate, state, running, approvalDialog } = useGenerateSeoReport();
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="generate-seo-report">
      <Button
        variant="primary"
        icon={<FilePlus2 />}
        disabled={!draft || running}
        title={draft ? undefined : unavailableReason}
        onClick={() => {
          if (draft) void generate(draft);
        }}
      >
        {running ? "Generating…" : "Generate report"}
      </Button>
      {!draft ? <InfoHint text={unavailableReason} label="Why it is off" /> : null}
      {state.kind === "refused" ? (
        <span className="flex min-w-0 items-center gap-1" role="status">
          <span className="truncate text-xs text-destructive">{state.short}<ErrorAlchemyMenu error={state.short} /></span>
          <InfoHint text={state.detail} label="Why it was refused" />
        </span>
      ) : null}
      {state.kind === "saved" ? (
        <span className="truncate text-xs text-muted-foreground" role="status">
          Saved as version {state.version} ·{" "}
          <Link href={state.link} className="text-primary underline-offset-2 hover:underline">
            Open
          </Link>
        </span>
      ) : null}
      {approvalDialog}
    </div>
  );
}
