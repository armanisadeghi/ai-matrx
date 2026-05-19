"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileName } from "@/features/files/redux/selectors";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import type { ImageSource } from "@/features/image-studio/modes/shared/types";

const EditModeShell = dynamic(
  () =>
    import("@/features/image-studio/modes/edit/EditModeShell").then((m) => ({
      default: m.EditModeShell,
    })),
  { ssr: false },
);

interface Props {
  cloudFileId: string;
  folder?: string;
}

export default function EditByIdClient({ cloudFileId, folder }: Props) {
  const url = useFileSrc({ kind: "file_id", fileId: cloudFileId });
  const fileName = useAppSelector((s) => selectFileName(s, cloudFileId));

  if (!url) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading image…
        </div>
      </div>
    );
  }

  const source: ImageSource = {
    kind: "url",
    url,
    suggestedFilename: fileName ?? "image",
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-background">
      <EditModeShell
        source={source}
        cloudFileId={cloudFileId}
        defaultFolder={folder ?? "Images/Edited"}
        presentation="page"
      />
    </div>
  );
}
