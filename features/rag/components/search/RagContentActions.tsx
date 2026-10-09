"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { Button } from "@ai-matrx/design-system";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { useOpenRagAiCopyWindow } from "@/features/overlays/openers/ragAiCopyWindow";
import type {
  RagAiCopyBundle,
  RagAiSectionKey,
} from "@/features/rag/components/search/ragAiCopy";
import { cn } from "@/lib/utils";

export function RagContentActions({
  humanText,
  label,
  bundle,
  initialSections,
  className,
  stopPropagation = true,
}: {
  humanText: string;
  label: string;
  bundle: RagAiCopyBundle;
  initialSections?: RagAiSectionKey[];
  className?: string;
  stopPropagation?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const openAiCopy = useOpenRagAiCopyWindow();

  const stop = (event: React.MouseEvent) => {
    if (stopPropagation) event.stopPropagation();
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-0.5", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label={`Copy ${label}`}
        title={`Copy ${label} to clipboard`}
        onClick={async (event) => {
          stop(event);
          if (!(await copyText(humanText, `${label} copied to clipboard`))) return;
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_500);
        }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label={`Choose what to copy from ${label} for AI`}
        title={`Copy ${label} for AI — choose what to include`}
        onClick={(event) => {
          stop(event);
          openAiCopy({ bundle, initialSections });
        }}
      >
        <CopyForAiIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function RagAiCopyButton({
  label,
  bundle,
  initialSections,
  className,
}: {
  label: string;
  bundle: RagAiCopyBundle;
  initialSections?: RagAiSectionKey[];
  className?: string;
}) {
  const openAiCopy = useOpenRagAiCopyWindow();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-6 w-6", className)}
      aria-label={`Choose what to copy from ${label} for AI`}
      title={`Copy ${label} for AI — choose what to include`}
      onClick={(event) => {
        event.stopPropagation();
        openAiCopy({ bundle, initialSections });
      }}
    >
      <CopyForAiIcon className="h-3.5 w-3.5" />
    </Button>
  );
}
