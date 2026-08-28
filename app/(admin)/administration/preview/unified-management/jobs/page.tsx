/**
 * /administration/preview/unified-management/jobs — THE JOB BOARD preview.
 *
 * Server Component shell; the board is the client island. Same full-height
 * frame the mandates console uses so the table owns its own scroll.
 */

import { JobBoardPreview } from "@/features/admin/unified-preview/jobs/JobBoardPreview";

export const metadata = {
  title: "The Job Board — preview",
  description:
    "One board, four altitudes: every job with its goal, its holder and its coverage.",
};

export default function JobBoardPreviewPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)]">
      <JobBoardPreview />
    </div>
  );
}
