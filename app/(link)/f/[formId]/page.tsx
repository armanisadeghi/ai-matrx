// app/(link)/f/[formId]/page.tsx — THE PUBLIC FORM. PRODUCTS row 1.
//
// A person with no account opens an unguessable link and answers a few
// questions. The answers become ordinary records in a real Table, stamped with
// the form they came through, and whoever owns the form is told.
//
// THE LINK IS THE CAPABILITY. 122 bits of UUIDv4, exactly as Typeform's form id
// in `/to/<id>` is and as an unguessable meeting slug is elsewhere on this
// platform. There is no second secret and nothing to hand out; revoking it is
// closing the form.
//
// SERVER-RENDERED, AND NOT AS A HABIT. The questions, the Field definitions and
// the open/closed state are resolved HERE, on the server, through
// `custom.form_public` — so the first paint is the real form at its real size
// (no skeleton settling into content, SSR-ZERO-LAYOUT-SHIFT), and the browser
// never holds a key to the record store. The only client code on this page is
// the runner itself, which takes answers and posts them to a route handler.
//
// 404 IS THE ANSWER TO THREE DIFFERENT QUESTIONS, on purpose: a form that never
// existed, one that was never published, and one in an organization whose store
// is switched off all resolve to nothing. Telling them apart would let a link be
// used to learn that something is there.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { publicForm } from "@/features/forms/service";

import { PublicFormRunner } from "./PublicFormRunner";

// A public form is answered now, by whoever has the link; nothing about it is
// cacheable across people and the state it shows (open / closed / full) moves.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ formId: string }>;
}): Promise<Metadata> {
  const { formId } = await params;
  const form = await publicForm(formId).catch(() => null);
  if (!form) {
    return { title: "Form · AI Matrx", robots: { index: false, follow: false } };
  }
  const intro = form.presentation?.intro ?? undefined;
  return {
    title: `${form.title} · AI Matrx`,
    ...(intro ? { description: intro } : {}),
    // A form's link is meant to be sent to the people who should answer it, not
    // found by strangers searching. The owner shares it; we do not index it.
    robots: { index: false, follow: false },
    openGraph: { title: form.title, ...(intro ? { description: intro } : {}), type: "website" },
  };
}

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const form = await publicForm(formId);
  if (!form) notFound();

  // CLOSED AND FULL ARE NOT ERRORS, and they are not 404s either: the link is
  // real and the person following it deserves a sentence rather than a dead
  // end. The words are the STORE's (`custom.form_public.message`), so the page
  // and the door can never say different things.
  if (form.state !== "open") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-12 text-center">
        <h1 className="text-xl font-medium">{form.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{form.message}</p>
      </main>
    );
  }

  return (
    // NOTHING ON THIS PAGE BUT THE FORM. It is somebody's clinic asking their
    // patient four questions, so it is centred on the screen the way Typeform
    // and Tally centre theirs, with the form's own name as the page's heading —
    // said once, here, because the runner deliberately no longer repeats it.
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 pb-safe pt-8 matrx-touch-targets">
      <h1 className="text-xl font-medium">{form.title}</h1>
      <PublicFormRunner form={form} />
    </main>
  );
}
