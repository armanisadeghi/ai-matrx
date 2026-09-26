"use client";

import Link from "next/link";
import { HardDrive } from "lucide-react";
import { useGoogleCapabilities } from "@/features/marketing/google/hooks";
import {
  DRIVE_BROWSE_FILES_PATH,
  driveBrowseIsAvailable,
} from "./drive-browser";

/** One mobile Files discovery door; the Drive screen owns all browse controls. */
export function DriveBrowseMobileLink() {
  const capabilities = useGoogleCapabilities();
  const capability = capabilities.data?.find(
    (item) => item.key === "drive_browse",
  );
  if (!driveBrowseIsAvailable(capability)) return null;
  return (
    <Link
      href={DRIVE_BROWSE_FILES_PATH}
      className="flex min-h-11 items-center gap-3 border-b px-4 text-sm font-medium text-foreground active:bg-accent/60"
    >
      <HardDrive className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      Google Drive
    </Link>
  );
}
