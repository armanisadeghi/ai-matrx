import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { BrowseImageProvider } from "@/features/image-manager/browse/BrowseImageProvider";
import { ImagesListHeader } from "./_components/ImagesListHeader";
import { ImagesSidebar } from "./_components/ImagesSidebar";

export const metadata = createRouteMetadata("/images", {
  title: "Images",
  description:
    "Browse, generate, edit, annotate, and convert images — every tool in one place.",
  letter: "I",
  additionalMetadata: {
    keywords: [
      "image manager",
      "image studio",
      "image editor",
      "image converter",
      "favicon generator",
      "avatar generator",
      "image library",
      "cloud images",
    ],
  },
});

// Cloud-files realtime is mounted globally in app/Providers.tsx — no
// per-route provider needed.
export default function ImagesLayout({ children }: { children: ReactNode }) {
  return (
    <BrowseImageProvider>
      <PageHeader>
        <ImagesListHeader />
      </PageHeader>
      <div className="flex h-full min-h-0 overflow-hidden bg-textured">
        <ImagesSidebar />
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden max-md:pb-24 pt-[var(--shell-header-h)]">
          {children}
        </main>
      </div>
    </BrowseImageProvider>
  );
}
