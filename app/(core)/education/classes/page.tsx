import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { ClassesHome } from "@/features/education/classes/components/ClassesHome";

export const metadata: Metadata = toolMetadata("classes");

export default function ClassesPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <ClassesHome />
    </div>
  );
}
