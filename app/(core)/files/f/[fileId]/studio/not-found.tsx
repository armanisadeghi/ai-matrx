"use client";

// The 404 boundary for /files/f/[fileId]/studio. The page calls notFound()
// when the file row is missing or not readable; the access gate asks the
// platform which state it actually is (denied / deleted / never existed /
// signed out) instead of the bare root 404.

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function FileStudioUnavailable() {
  const params = useParams();
  const fileId = typeof params?.fileId === "string" ? params.fileId : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="file"
        id={fileId}
        fallbackHref="/files"
        fallbackLabel="Your files"
      />
    </div>
  );
}
