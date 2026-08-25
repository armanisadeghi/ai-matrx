// /education/kits/[sourceId] — ONE study kit: one piece of material and
// everything made from it. The kit's id IS its source material's id (the durable
// ingest anchor every artifact already links back to).
import type { Metadata } from "next";
import { KitHub } from "@/features/education/kits/components/KitHub";
import { ALL_TARGET_KINDS, type TargetKind } from "@/features/education/convert/types";

export const metadata: Metadata = {
  title: "Study Kit",
  description: "Everything you made from this material, in one place.",
};

export default async function StudyKitPage({
  params,
  searchParams,
}: {
  params: Promise<{ sourceId: string }>;
  searchParams: Promise<{ from?: string; add?: string }>;
}) {
  const { sourceId } = await params;
  const { from, add } = await searchParams;
  // `?add=<kind>` is the education home's nudge landing ("this kit has no
  // quiz"): it opens the kit's own convert surface with that format leading.
  // An unknown value is simply ignored — a bad link opens the kit, never a
  // broken picker.
  const addTarget = (ALL_TARGET_KINDS as string[]).includes(add ?? "")
    ? (add as TargetKind)
    : undefined;
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <KitHub
        sourceId={sourceId}
        sourceType={from ?? "file"}
        addTarget={addTarget}
      />
    </div>
  );
}
