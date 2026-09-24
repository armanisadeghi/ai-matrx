// app/(portal)/portal/c/[slug]/f/[formId]/page.tsx — ONE OF HER PORTAL'S FORMS (lane S6, U12).
//
// A property manager opens her supplier's portal and presses "Update a gate code": the form opens
// HERE, inside the portal, with the business's own look, signed in as her. The questions are the
// store's answer (`custom.portal_form`, called as her): the form's exposed Fields MINUS the one
// that says which client this is for — the portal fills that with her own record, so she is never
// asked who she is and can never answer for somebody else.
//
// Every refusal has a sentence: signed out, not on this portal, a form that is not on her portal,
// a closed or full form. Never a blank page, never a 404 for a real link.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PortalAccentBand, PortalBrandHeading, PortalFooter } from "@/features/portals/PortalBrand";
import { portalLook, type PortalLook } from "@/features/portals/look";
import {
  DoorRefusal,
  membershipFor,
  portalForm,
  portalMe,
  portalPublic,
  portalViewer,
  type PortalFormSpec,
} from "@/features/portals/service";

import { PortalFormRunner } from "./PortalFormRunner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Send a request",
  robots: { index: false, follow: false },
};

export default async function PortalFormPage({
  params,
}: {
  params: Promise<{ slug: string; formId: string }>;
}) {
  const { slug, formId } = await params;
  const portal = await portalPublic(slug);
  if (!portal) notFound();

  const look = portalLook(portal.style, portal.organization);
  const viewer = await portalViewer();
  const membership = viewer ? membershipFor(await portalMe(), portal.slug) : null;
  const back = `/portal/c/${encodeURIComponent(portal.slug)}`;

  if (!membership) {
    return (
      <Frame look={look}>
        <Notice
          look={look}
          title={portal.title}
          body={`Sign in to send this. ${look.name} invites each client by email address.`}
          href={back}
          cta="Go to the sign-in page"
        />
      </Frame>
    );
  }

  const her = portalLook(membership.style ?? portal.style, membership.organization);
  let form: PortalFormSpec;
  try {
    form = await portalForm({
      organizationId: membership.organization_id,
      portalId: membership.portal_id,
      formId,
    });
  } catch (error) {
    const said =
      error instanceof DoorRefusal
        ? [error.message, error.hint].filter(Boolean).join(" ")
        : "This form could not be opened just now. Go back to your portal and try again.";
    return (
      <Frame look={her}>
        <Notice look={her} title="That form is not open to you" body={said} href={back} cta="Back to your portal" />
      </Frame>
    );
  }

  if (form.state !== "open") {
    return (
      <Frame look={her}>
        <Notice
          look={her}
          title={form.label || form.title}
          body={form.message ?? "This form is not taking answers right now."}
          href={back}
          cta="Back to your portal"
        />
      </Frame>
    );
  }

  return (
    <Frame look={her} align="start">
      <div className="w-full max-w-xl">
        <Link
          href={back}
          data-tap-target
          className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {membership.client}
        </Link>
        <div className="mt-3">
          <PortalBrandHeading look={her} withWelcome={false} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">{form.label || form.title}</h1>
        <section className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-6">
          <PortalFormRunner slug={membership.slug} form={form} business={her.name} />
        </section>
        <PortalFooter look={her} />
      </div>
    </Frame>
  );
}

function Notice({
  look,
  title,
  body,
  href,
  cta,
}: {
  look: PortalLook;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-sm shadow-sm sm:p-8">
      <PortalBrandHeading look={look} withWelcome={false} />
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-muted-foreground">{body}</p>
      <Link href={href} className="mt-4 inline-block font-medium text-primary underline underline-offset-4">
        {cta}
      </Link>
    </section>
  );
}

/** The portal's frame, the same as its front page's. */
function Frame({
  children,
  look,
  align = "center",
}: {
  children: React.ReactNode;
  look: PortalLook;
  align?: "center" | "start";
}) {
  return (
    <main
      className={`matrx-touch-targets flex min-h-dvh w-full flex-col items-center bg-textured px-4 pb-safe sm:px-6 ${
        align === "center" ? "justify-center py-10" : "justify-start py-6"
      }`}
    >
      <PortalAccentBand look={look} />
      {children}
    </main>
  );
}
