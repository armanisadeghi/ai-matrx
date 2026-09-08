"use client";

import { useRouter } from "next/navigation";
import { SkillCategoryTreeEditor } from "@/features/skills/components/SkillCategoryTreeEditor";
import { pushAppHref } from "@/lib/deployment/navigate";

/** Admin deep-link to the categories editor. The component itself handles
 * the admin gate + back navigation; this page wires the URL back to the
 * Skills registry root. */
export default function SkillsCategoriesAdminPage() {
  const router = useRouter();
  return (
    <SkillCategoryTreeEditor
      onBack={() => pushAppHref(router, "/administration/agents/skills")}
    />
  );
}
