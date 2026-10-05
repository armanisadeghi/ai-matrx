"use client";

import React from "react";

interface SectionFooterProps {
  description: string;
  learnMoreLabel?: string;
  learnMoreHref?: string;
}

export function SectionFooter({
  description,
  learnMoreLabel,
  learnMoreHref,
}: SectionFooterProps) {
  return (
    <div className="border-t border-border/50 px-4 py-3 shrink-0">
      <p className="text-sm text-muted-foreground">{description}</p>
      {/* "#" is a placeholder, not a destination — never render a dead link. */}
      {learnMoreLabel && learnMoreHref && learnMoreHref !== "#" && (
        <a
          href={learnMoreHref}
          className="mt-1 inline-block text-sm text-sky-500 hover:text-sky-400 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {learnMoreLabel}
        </a>
      )}
    </div>
  );
}

export default SectionFooter;
