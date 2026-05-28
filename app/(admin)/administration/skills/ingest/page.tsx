"use client";

import { useRouter } from "next/navigation";
import { SkillIngestPanel } from "@/features/skills/components/SkillIngestPanel";

/** Admin deep-link to the filesystem ingest panel. */
export default function SkillsIngestAdminPage() {
  const router = useRouter();
  return (
    <SkillIngestPanel
      onBack={() => router.push("/administration/skills")}
    />
  );
}
