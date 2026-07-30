"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { ImageSource } from "@/features/image-studio/modes/shared/types";
import { ModeImagePicker } from "@/features/image-studio/components/ModeImagePicker";

const AnnotateModeShell = dynamic(
  () =>
    import("@/features/image-studio/modes/annotate/AnnotateModeShell").then(
      (m) => ({ default: m.AnnotateModeShell }),
    ),
  { ssr: false },
);

interface Props {
  urlParam: string | null;
  cloudFileId: string | null;
  folder?: string;
}

export default function AnnotateShellClient({
  urlParam,
  cloudFileId,
  folder,
}: Props) {
  const [source, setSource] = useState<ImageSource | null>(() => {
    if (urlParam) return { kind: "url", url: urlParam };
    if (cloudFileId) return { kind: "cloudFileId", cloudFileId };
    return null;
  });

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-background">
      {source ? (
        <AnnotateModeShell
          source={source}
          defaultFolder={folder ?? "Images/Annotated"}
          presentation="page"
        />
      ) : (
        <ModeImagePicker
          title="Pick a screenshot to annotate"
          onPick={setSource}
          enableCapture
        />
      )}
    </div>
  );
}
