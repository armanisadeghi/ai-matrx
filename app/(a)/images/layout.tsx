import type { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { createRouteMetadata } from "@/utils/route-metadata";
import { CloudFilesRealtimeProvider } from "@/features/files/providers/CloudFilesRealtimeProvider";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { BrowseImageProvider } from "@/features/image-manager/browse/BrowseImageProvider";
import { ImagesListHeader } from "./_components/ImagesListHeader";
import { ImagesSidebar } from "./_components/ImagesSidebar";

export const metadata = createRouteMetadata("/images", {
  title: "Images",
  description:
    "Browse, generate, edit, annotate, and convert images — every tool in one place.",
  letter: "Im",
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

export default async function ImagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <CloudFilesRealtimeProvider userId={user?.id ?? null}>
      <BrowseImageProvider>
        <PageHeader>
          <ImagesListHeader />
        </PageHeader>
        <span className="shell-hide-dock" aria-hidden="true" />
        <div className="flex h-dvh min-h-0 overflow-hidden bg-textured pt-[calc(var(--shell-header-h,2.75rem)+0.5rem)]">
          <ImagesSidebar />
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden max-md:pb-24">
            {children}
          </main>
        </div>
      </BrowseImageProvider>
    </CloudFilesRealtimeProvider>
  );
}
