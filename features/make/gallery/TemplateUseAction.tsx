"use client";

// features/make/gallery/TemplateUseAction.tsx — lane CHAIR-GALLERY, 2026-10-05.
//
// "USE THIS TEMPLATE" ON THE ONE ROUTE: /templates/<slug> is the same page signed in or out. A guest
// gets a link through sign-up that comes back here with ?install=1; a signed-in person gets the
// install door itself (TemplatePreview, bare): the organization it saves to, the live progress and
// the landing. The server renders the guest link, so a crawler and a first paint both have an action.

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useSignedIn } from "@/lib/scoped-config/useSignedIn";

import { INSTALL_ON_RETURN } from "./publicGallery";
import { TemplatePreview } from "./TemplateGallery";

export function TemplateUseAction({ templateId, signUpHref }: { templateId: string; signUpHref: string }) {
  const signedIn = useSignedIn();
  const params = useSearchParams();
  if (!signedIn) {
    return (
      <Link
        href={signUpHref}
        data-public-template-use=""
        className="inline-flex h-10 items-center self-start rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Use this template
      </Link>
    );
  }
  return (
    <div data-public-template-install="">
      <TemplatePreview templateId={templateId} bare autoInstall={params.get(INSTALL_ON_RETURN) === "1"} />
    </div>
  );
}

/** An organization's own saved template is never public: signed in, it opens here through the gallery door. */
export function OwnTemplateFallback({ templateId }: { templateId: string }) {
  const signedIn = useSignedIn();
  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground" data-public-template-missing="">
        This template is not in the gallery
      </p>
    );
  }
  return <TemplatePreview templateId={templateId} />;
}
