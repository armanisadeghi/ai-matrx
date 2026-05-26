"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { ImageSource } from "@/features/image-studio/modes/shared/types";
import { ModeImagePicker } from "../_shared/ModeImagePicker";

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
  const initial = useMemo<ImageSource | null>(() => {
    if (urlParam) return { kind: "url", url: urlParam };
    if (cloudFileId) return { kind: "cloudFileId", cloudFileId };
    return null;
  }, [urlParam, cloudFileId]);

  const [source, setSource] = useState<ImageSource | null>(initial);

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
          onPick={(file) => setSource({ kind: "file", file })}
        />
      )}
    </div>
  );
}
