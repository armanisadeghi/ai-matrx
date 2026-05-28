"use client";

import { useRouter } from "next/navigation";
import { SkillCategoryTreeEditor } from "@/features/skills/components/SkillCategoryTreeEditor";

/** Admin deep-link to the categories editor. The component itself handles
 * the admin gate + back navigation; this page wires the URL back to the
 * Skills registry root. */
export default function SkillsCategoriesAdminPage() {
  const router = useRouter();
  return (
    <SkillCategoryTreeEditor
      onBack={() => router.push("/administration/skills")}
    />
  );
}
