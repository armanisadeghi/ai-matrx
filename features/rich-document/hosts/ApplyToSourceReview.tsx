"use client";

// features/rich-document/hosts/ApplyToSourceReview.tsx
//
// "Apply to source" from an agent window: the one review (DocumentAgentReview)
// opened straight on the answer, against the text the window was launched
// from (review/applyTargets). Opened only through the `applyToSourceReview`
// overlay.

import * as React from "react";
import { toast } from "@/lib/toast";
import { DocumentAgentReview } from "./DocumentAgentReview";
import { getApplyTarget } from "../review/applyTargets";

export interface ApplyToSourceReviewProps {
  isOpen: boolean;
  onClose: () => void;
  applyTargetId: string | null;
  proposal: string | null;
}

export default function ApplyToSourceReview({
  isOpen,
  onClose,
  applyTargetId,
  proposal,
}: ApplyToSourceReviewProps): React.ReactElement | null {
  const target = getApplyTarget(applyTargetId);
  const missing = isOpen && (!target || proposal === null);

  React.useEffect(() => {
    if (!missing) return;
    toast.error("The source text is no longer available to apply to.");
    onClose();
  }, [missing, onClose]);

  if (!isOpen || !target || proposal === null) return null;
  return (
    <DocumentAgentReview
      actionId="customAgent"
      ctx={target.ctx}
      initialProposal={proposal}
      onClose={onClose}
    />
  );
}
