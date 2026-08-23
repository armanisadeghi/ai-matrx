import PageHeader from "@/features/shell/components/header/PageHeader";
import { ShapeBrowsePage } from "@/features/content-ir/browse/ShapeBrowsePage";
import { ShapesListHeader } from "@/features/content-ir/studio/components/ShapesListHeader";

export default function ShapesAllPage() {
  return (
    <>
      <PageHeader>
        <ShapesListHeader />
      </PageHeader>
      <ShapeBrowsePage />
    </>
  );
}
