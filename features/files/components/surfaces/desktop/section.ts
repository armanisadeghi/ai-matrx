/**
 * features/files/components/surfaces/desktop/section.ts
 *
 * Section identifiers for the Dropbox-style files shell. One value per
 * primary route so `PageShell` can render every sibling page from the same
 * layout.
 */

export type CloudFilesSection =
  | "all"
  | "folders"
  | "folders-root"
  | "photos"
  | "recents"
  | "shared"
  | "requests"
  | "trash"
  | "starred"
  | "activity"
  | "webhooks";

export interface SectionNavEntry {
  key: CloudFilesSection;
  href: string;
  label: string;
}

export const PRIMARY_SECTIONS: SectionNavEntry[] = [
  // Labeled "Home" because the section renders root-level items only.
  // Recents/Starred surface deeper files through dedicated selectors.
  { key: "all", href: "/files", label: "Home" },
  { key: "recents", href: "/files/recents", label: "Recents" },
  { key: "photos", href: "/files/photos", label: "Photos" },
  { key: "shared", href: "/files/shared", label: "Shared" },
  {
    key: "requests",
    href: "/files/requests",
    label: "File requests",
  },
  { key: "trash", href: "/files/trash", label: "Deleted files" },
  { key: "webhooks", href: "/files/webhooks", label: "Webhooks" },
];
