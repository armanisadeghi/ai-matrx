// app/(public)/templates/applets/page.tsx — THE APPLET TEMPLATE GALLERY (AP-0 item 10, lane E).
// Ready-made apps over ready-made tables, ours first. Each card opens the template's own page
// (/applets/<slug>), where "Use this template" installs its tables and the app into an organization.

import type { Metadata } from "next";
import Link from "next/link";

import { createRouteMetadata } from "@/utils/route-metadata";
import { signUpHref } from "@/utils/auth/auth-destination";
import { AppletSignUpLink } from "@/features/marketing/applets/AppletSignUpLink";
import { AppletCardGrid } from "@/features/marketing/applets/AppletIntroPage";
import { readPublicApplets } from "@/features/marketing/applets/publicApplets.server";
import { APPLET_TEMPLATES_PATH } from "@/features/marketing/applets/types";
import { PUBLIC_GALLERY_PATH } from "@/features/make/gallery/publicGallery";

export const revalidate = 3600;

export const metadata: Metadata = createRouteMetadata(APPLET_TEMPLATES_PATH, {
  title: "Applet templates",
  description: "Ready-made Applets for client approvals, sales pipelines and time tracking, with their tables and sample data. Pick one and it is yours.",
  canonicalPath: APPLET_TEMPLATES_PATH,
  keywords: ["Applet templates", "no-code Applet", "client portal template", "crm template", "time tracking template"],
});

export default async function AppletTemplatesPage() {
  const cards = await readPublicApplets(true);
  return (
    <div className="bg-textured" data-applet-templates="">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Link href={PUBLIC_GALLERY_PATH} className="type-body text-muted-foreground hover:text-foreground">
              All templates
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">Applet templates</h1>
            <span className="type-body text-muted-foreground tabular-nums">{cards.length} templates</span>
          </div>
          <AppletSignUpLink href={signUpHref(APPLET_TEMPLATES_PATH)} />
        </header>
        <AppletCardGrid cards={cards} />
      </div>
    </div>
  );
}
