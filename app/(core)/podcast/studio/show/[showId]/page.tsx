import type { Metadata } from "next";
import { ShowManageClient } from "@/features/podcasts/studio/components/ShowManageClient";

export const metadata: Metadata = {
  title: "Manage podcast — Podcast Studio",
  description: "Manage your podcast's details, cover art, and RSS distribution.",
};

export default async function ManageShowPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <ShowManageClient showId={showId} />
    </div>
  );
}
