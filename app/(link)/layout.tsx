// app/(link)/layout.tsx — A LINK SOMEBODY SENT, NOT A PAGE OF OUR WEBSITE.
//
// WHAT THIS GROUP IS FOR. `/f/<form id>` is a clinic's patient intake form, sent
// to a patient. The person opening it has no account, has never heard of us, and
// is answering their doctor — not visiting AI Matrx. Every route of that shape
// belongs here.
//
// WHY IT IS NOT IN `(public)`. `(public)` is the MARKETING SITE, and its layout
// is right for what it is for: a header with Download / theme / Sign in, and a
// footer with How It Works, Why AI Matrx, The Landscape, Privacy, Terms, and the
// operating company's legal name. Rendered around a patient intake form — which
// is exactly what shipped until this file existed, and what the first headless
// render of that page showed — it invites a stranger to download our product
// instead of answering the four questions their doctor asked, and it prints an
// unrelated company's name at the bottom of a clinic's form. Typeform and Tally
// put nothing on a form's page but the form.
//
// A nested layout could not fix it: in the App Router a child layout NESTS
// inside its parent, so escaping the marketing chrome means being outside the
// group that adds it. Route groups do not appear in the URL, so `/f/<id>` is
// unchanged — only what is drawn around it is.
//
// WHAT IS STILL HERE. `Providers`, and deliberately: light and dark have to keep
// working (a form is answered at night), and the app's own theme is how a form
// stays legible in both without a second theme of its own.
//
// THE REST OF THE CLASS. `(public)` still holds several routes of exactly this
// shape — a shared page `/p/<slug>`, a share link `/s/<token>`, a short link
// `/l/<code>`, `/r/<token>`, `/c/<handle>`, `/open/chat`, `/unsubscribe/<token>`
// and the appointment reminder. Every one of them is a link somebody sent to
// somebody else and every one of them is wearing the marketing site right now.
// They belong in this group. They were left where they are because each is
// another lane's route with its own screens to re-check, and moving a route you
// have not rendered is how a link quietly 404s — so this is the home for the
// class, with one route moved into it and verified.

import React from "react";

import { Providers } from "@/app/Providers";

export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div data-link-layout className="flex min-h-dvh flex-col">
        {children}
      </div>
    </Providers>
  );
}
