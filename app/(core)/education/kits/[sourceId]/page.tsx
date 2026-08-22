// /education/kits/[sourceId] — ONE study kit: one piece of material and
// everything made from it. The kit's id IS its source material's id (the durable
// ingest anchor every artifact already links back to).
import type { Metadata } from "next";
import { KitHub } from "@/features/education/kits/components/KitHub";

export const metadata: Metadata = {
  title: "Study Kit",
  description: "Everything you made from this material, in one place.",
};

export default async function StudyKitPage({
  params,
  searchParams,
}: {
  params: Promise<{ sourceId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { sourceId } = await params;
  const { from } = await searchParams;
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <KitHub sourceId={sourceId} sourceType={from ?? "file"} />
    </div>
  );
}
