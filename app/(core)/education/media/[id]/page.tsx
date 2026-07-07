import type { Metadata } from "next";
import { MediaRouter } from "@/features/education/media/components/MediaRouter";

export const metadata: Metadata = {
  title: "Study Media",
  robots: { index: false, follow: false },
};

// The canonical shareable viewer for a study-media artifact — the URL every
// share link resolves to. Dispatches to the audio or mind-map surface by kind.
export default async function StudyMediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MediaRouter mediaId={id} />;
}
