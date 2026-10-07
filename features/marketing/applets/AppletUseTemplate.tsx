"use client";

// features/marketing/applets/AppletUseTemplate.tsx — "USE THIS TEMPLATE" ON AN APPLET TEMPLATE'S PAGE.
//
// A guest gets a link through sign-up that comes back here with ?use=1. A signed-in person gets the
// data template's own install door (TemplatePreview: the organization it saves to — held until one is
// set — the live progress and the landing); when the install lands, the Applet is copied into that
// organization with its sources rebound, and "Open your app" goes to /applets/<slug>. An organization
// that already has the data template gets "Add the app" over the install it has.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@ai-matrx/design-system/controls";
import { supabaseDataSource } from "@ai-matrx/records/core";
import { runTemplateDoor, type TemplateDoorAnswer } from "@ai-matrx/records/templates";

import { TemplatePreview } from "@/features/make/gallery/TemplateGallery";
import { galleryFilter, type GalleryCard } from "@/features/make/gallery/catalogue";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useSignedIn } from "@/lib/scoped-config/useSignedIn";
import { createClient } from "@/utils/supabase/client";

import { copyAppletFromTemplate, type CopiedApplet } from "./copyAppletFromTemplate";
import { appletHref } from "./types";

export const USE_ON_RETURN = "use";

type Copy = { phase: "idle" } | { phase: "copying" } | { phase: "done"; applet: CopiedApplet } | { phase: "failed"; why: string };

export function AppletUseTemplate({
  appletId,
  appletName,
  templateId,
  signUpHref,
}: {
  appletId: string;
  appletName: string;
  templateId: string;
  signUpHref: string;
}) {
  const signedIn = useSignedIn();
  const params = useSearchParams();
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const [copy, setCopy] = useState<Copy>({ phase: "idle" });
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  // The person's live copy of this Applet (an archived one is gone): known before any organization is chosen.
  const [mine, setMine] = useState<CopiedApplet | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    let q = createClient()
      .schema("app")
      .from("definition")
      .select("id, slug, name")
      .eq("metadata->from_template->>applet_id", appletId)
      .is("deleted_at", null);
    if (organizationId) q = q.eq("organization_id", organizationId);
    void q
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setMine(data ? { ...data, existed: true } : null);
      });
    return () => {
      alive = false;
    };
  }, [signedIn, organizationId, appletId, copy.phase]);

  // Does the chosen organization already have the data template? Then the app is added over it.
  useEffect(() => {
    if (!signedIn || !organizationId) return;
    let alive = true;
    void createClient()
      .schema("custom")
      .rpc("templates", { p_filter: galleryFilter({}, { installedIn: organizationId, id: templateId }) })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setCopy({ phase: "failed", why: `Could not check this organization's templates: ${error.message}` });
          return;
        }
        const card = ((data as { cards?: GalleryCard[] } | null)?.cards ?? []).find((c) => c.id === templateId);
        setAlreadyInstalled(card?.installed?.state === "installed");
      });
    return () => {
      alive = false;
    };
  }, [signedIn, organizationId, templateId]);

  const addApp = async (answer: TemplateDoorAnswer, orgId: string) => {
    setCopy({ phase: "copying" });
    try {
      const applet = await copyAppletFromTemplate(createClient(), { templateAppletId: appletId, organizationId: orgId, answer });
      setCopy({ phase: "done", applet });
    } catch (err) {
      setCopy({ phase: "failed", why: err instanceof Error ? err.message : String(err) });
    }
  };

  const addOverInstall = async () => {
    if (!organizationId) return;
    setCopy({ phase: "copying" });
    // The install door answers an organization's existing install ("already") with the ids it made.
    const done = await runTemplateDoor(supabaseDataSource(createClient()), "template_install", organizationId, templateId, { maxCalls: 400 });
    if (!done.ok || !done.answer?.done) {
      setCopy({ phase: "failed", why: String(done.answer?.refusal?.["message"] ?? "The template's tables could not be read.") });
      return;
    }
    await addApp(done.answer, organizationId);
  };

  if (!signedIn) {
    return (
      <Link
        href={signUpHref}
        data-applet-template-use=""
        className="inline-flex h-10 items-center self-start rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Use this template
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-applet-template-install="">
      {copy.phase === "done" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3" data-applet-template-done={copy.applet.slug}>
          <span className="text-sm font-medium">{copy.applet.existed ? "Your Applet is ready" : "Your Applet is added"}</span>
          <Link
            href={appletHref(copy.applet.slug)}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open your app
          </Link>
        </div>
      ) : null}
      {copy.phase === "copying" ? <p className="text-sm text-muted-foreground">Adding the Applet to your organization…</p> : null}
      {copy.phase === "failed" ? (
        <p className="text-sm text-destructive" role="alert" data-applet-template-failed="">
          {copy.why}
        </p>
      ) : null}
      {mine && copy.phase !== "done" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3" data-applet-template-have={mine.slug}>
          <span className="text-sm font-medium">Your Applet is ready</span>
          <Link
            href={appletHref(mine.slug)}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open your app
          </Link>
        </div>
      ) : null}
      {alreadyInstalled && !mine && copy.phase !== "done" ? (
        <Button variant="primary" onClick={() => void addOverInstall()} disabled={copy.phase === "copying"} className="self-start">
          Add the app
        </Button>
      ) : null}
      <TemplatePreview
        templateId={templateId}
        productName={appletName}
        bare
        autoInstall={params.get(USE_ON_RETURN) === "1"}
        onInstalled={(answer, orgId) => void addApp(answer, orgId)}
      />
    </div>
  );
}
