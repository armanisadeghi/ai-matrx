"use client";

import { useRouter } from "next/navigation";
import { SkillIngestPanel } from "@/features/skills/components/SkillIngestPanel";
import { pushAppHref } from "@/lib/deployment/navigate";

/** Admin deep-link to the filesystem ingest panel. */
export default function SkillsIngestAdminPage() {
  const router = useRouter();
  return (
    <SkillIngestPanel
      onBack={() => pushAppHref(router, "/administration/agents/skills")}
      onViewSkill={(skillId) =>
        pushAppHref(router, `/administration/agents/skills?open=${encodeURIComponent(skillId)}`)
      }
    />
  );
}
