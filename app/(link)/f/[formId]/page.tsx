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
// 404 IS THE ANSWER TO TWO DIFFERENT QUESTIONS, on purpose: a form that never
// existed and one that was never published both resolve to nothing. Telling them
// apart would let a link be used to learn that something is there.
//
// IT USED TO BE THREE, AND THE THIRD WAS A DEFECT (STORE-OFF, 2026-09-22): a
// PUBLISHED form in an organization that has switched its record store off also
// answered nothing, so the owner published it, was handed a URL, sent it to her
// customers, and every one of them saw a page that said nothing was there. She
// gave them this address; there is nothing left to hide. The store now answers
// `state: "unavailable"` and says whose switch it is, and the branch below —
// which was already the right shape for closed and full — prints it.

import { markdownToPlainText } from "@/lib/markdown/plain-text";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicLinkNotice } from "@/components/public-link/PublicLinkNotice";
import { FormLookFrame } from "@ai-matrx/records-ui";
import { isPortalAccent, type PortalStyle as RecordsPortalStyle } from "@ai-matrx/records";
import { prefillFromLink, publicForm, type PublicForm } from "@/features/forms/service";

import { PublicFormRunner } from "./PublicFormRunner";

function recordsFormLook(
  style: NonNullable<PublicForm["presentation"]["look"]> | null,
): Partial<RecordsPortalStyle> | null {
  if (!style) return null;
  return {
    ...style,
    accent: isPortalAccent(style.accent) ? style.accent : null,
    from_organization: style.from_organization.filter(
      (field): field is "display_name" | "logo" =>
        field === "display_name" || field === "logo",
    ),
  };
}

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
  // A meta description is WORDS: the intro may carry markdown, which would
  // show its asterisks in link previews and search results.
  const intro = markdownToPlainText(form.presentation?.intro) || undefined;
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
  searchParams,
}: {
  params: Promise<{ formId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { formId } = await params;
  const query = await searchParams;
  const form = await publicForm(formId);
  if (!form) notFound();

  // CLOSED, FULL AND SWITCHED OFF ARE NOT ERRORS, and they are not 404s either:
  // the link is real and the person following it deserves a sentence rather than
  // a dead end. The words are the STORE's (`custom.form_public.message`), so the
  // page and the door can never say different things, and the shape is the one
  // every public link in this product uses for a refusal.
  if (form.state !== "open") {
    return <PublicLinkNotice title={form.title} message={form.message} />;
  }

  // THE ORGANIZATION'S LOOK (MAKE-HOME W5, W5b): the store resolved it (`presentation.look`), and the
  // ONE frame draws it — cover, logo, name, title, colour, footer — the same component the builder's
  // preview uses, so an owner sees exactly what a stranger will. Its colour becomes the primary of
  // everything inside it: the buttons, the progress line, the focus ring and the choice rows.
  // EMBED MODE (`?embed=1`): the same form inside somebody else's page — an inline iframe or the
  // popup / slider of /embed/form.js — without the page's own outer spacing.
  const embedded = query["embed"] === "1";

  return (
    // NOTHING ON THIS PAGE BUT THE FORM. It is somebody's clinic asking their patient four
    // questions: one column, the title and every answer box on one left edge, full width of the
    // column at any screen size (the live walk measured a 166 px box at 390 px).
    <main
      className={
        embedded
          ? "matrx-touch-targets mx-auto flex w-full max-w-xl flex-col gap-4 px-3 py-3"
          : "matrx-touch-targets mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 pb-safe pt-6 sm:px-5 sm:pt-10"
      }
      data-form-embedded={embedded ? "" : undefined}
    >
      <FormLookFrame look={recordsFormLook(form.presentation?.look ?? null)} title={form.title}>
        {/* PREFILL BY LINK (lane S7-PRIME): `?<question key>=<answer>` starts the form with
            that answer in its question. Resolved HERE, against the form's own questions and
            Field kinds, so the first paint is already filled in. */}
        <PublicFormRunner form={form} prefill={prefillFromLink(form, query).answers} linkQuery={query} />
      </FormLookFrame>
    </main>
  );
}
