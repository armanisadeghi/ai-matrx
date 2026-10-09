"use client";

// Archive / Restore for the template detail page — shown only to someone who may edit the template.

import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTemplateEditAccess } from "./templateArchive";
import { useTemplateArchive } from "./useTemplateArchive";

interface Props {
  templateId: string;
  name: string;
  createdBy: string | null;
  isArchived: boolean;
}

export function TemplateArchiveButton({ templateId, name, createdBy, isArchived }: Props) {
  const allowed = useTemplateEditAccess([{ id: templateId, created_by: createdBy }]);
  const { busyId, archive, restore } = useTemplateArchive();
  if (!allowed.has(templateId)) return null;
  const busy = busyId === templateId;
  return (
    <Button
      variant="outline"
      icon={busy ? <Loader2 className="animate-spin" /> : isArchived ? <ArchiveRestore /> : <Archive />}
      disabled={busy}
      onClick={() => void (isArchived ? restore(templateId, name) : archive(templateId, name))}
    >
      {isArchived ? "Restore" : "Archive"}
    </Button>
  );
}
