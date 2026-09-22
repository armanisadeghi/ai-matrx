// components/public-link/PublicLinkNotice.tsx — THE ONE PAGE A REFUSED PUBLIC LINK ANSWERS.
//
// Every link this platform hands out to somebody who is not signed in — a form, a booking
// page, the visitor's own appointment, a signing request, a crew capture sheet, a client
// portal — can end in a refusal that is nobody's mistake: the page is closed, it is full, the
// appointment was cancelled, or the organization has switched its record store off. Before
// this component each route drew its own centred `<main>`, and the ones that reached
// `notFound()` fell through to `app/not-found.tsx` — the PRODUCT's 404, with a "browse AI
// Matrx" grid, shown to somebody's patient who has never heard of us.
//
// So: one component, one shape, six routes. A heading that is the thing's own name, the
// STORE's own sentence under it (never a sentence written here — the page and the door can
// never disagree if there is only one copy of the words), and nothing else unless the route
// has something genuinely useful to offer, which it passes as children.
//
// NO CLIENT JAVASCRIPT. A refusal is a sentence; it does not need to hydrate. That also keeps
// it usable from `not-found.tsx`, which renders inside the same group shell.

import type { ReactNode } from "react";

export function PublicLinkNotice({
  title,
  message,
  children,
}: {
  /** The thing's own name — the form's, the booking page's, the portal's. */
  title: string;
  /** The refusal, in the words of whichever door said no. */
  message: string | null | undefined;
  /** Anything the route can honestly offer. Usually nothing. */
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 pb-safe pt-8 text-center matrx-touch-targets">
      <h1 className="text-xl font-medium">{title}</h1>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
      {children ? <div className="mt-8 flex flex-col gap-3">{children}</div> : null}
    </main>
  );
}

/**
 * The sentence for a link that resolves to NOTHING — never existed, or was never published.
 *
 * It is written here and not in the store because there is no door to ask: the store answered
 * silence, which is the whole point of that answer. A link that was switched off says so in
 * the STORE's words (`custom.store_off_sentence`); this is only for the address nobody ever
 * handed out.
 */
export const NO_SUCH_LINK =
  "This link does not open anything. It may have been mistyped, or whoever sent it may have taken it down since.";
