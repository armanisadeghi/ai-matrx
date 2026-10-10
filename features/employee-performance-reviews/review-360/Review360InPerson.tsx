"use client";

// The 360 review meeting held in person: the Meet panel's side-by-side, full page, one screen.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@ai-matrx/design-system/controls";

import { useHrContext } from "@/features/hr/shared/useHrContext";

import { Review360Host } from "./Review360Host";
import { Review360SideBySide, type Review360Section } from "./Review360SideBySide";

export function Review360InPersonPage({ reviewId }: { reviewId: string }) {
  const params = useSearchParams();
  const hr = useHrContext();
  const org = params?.get("org") || hr.active?.organization_id || null;
  const [section, setSection] = useState<Review360Section>("accomplishments");
  return (
    <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
      {!org ? (
        <EmptyState icon={<ClipboardCheck />} title="Pick an employer first" />
      ) : (
        <Review360Host organizationId={org}>
          <div className="mx-auto max-w-5xl px-3 pt-3">
            <Review360SideBySide reviewId={reviewId} organizationId={org} section={section} onSection={setSection} />
          </div>
        </Review360Host>
      )}
    </div>
  );
}
