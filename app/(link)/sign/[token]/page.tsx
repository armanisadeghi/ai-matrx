// app/(link)/sign/[token]/page.tsx — THE PUBLIC SIGNING PAGE. PRODUCTS row 16.
//
// A client with no account opens a link, reads the document their contractor
// sent, types or draws their name, and the signature becomes a Value on the
// record with its own audit trail. DocuSign and Dropbox Sign are the bar for
// what the signer sees, and the bar is: one document, one thing to do, nothing
// else on the screen.
//
// IT LIVES IN `(link)` FOR THAT GROUP'S OWN REASON. This is a link somebody SENT
// — a contractor asking their client to sign a proposal. Rendering our marketing
// header around it would invite the client to download our product instead of
// signing their contractor's document, and print an unrelated company's name at
// the foot of somebody else's agreement.
//
// SERVER-RENDERED, AND NOT AS A HABIT. The document text, the state and the
// expiry are resolved HERE, through `custom.sign_request_public` — so the first
// paint is the real document at its real size, and the browser never holds a key
// to the record store. The only client code is the signing control.
//
// THERE IS NO 404 ON THIS ROUTE, AND THAT IS DELIBERATE. A link that was never
// ours, a request that is gone, a wrong secret, an expired link and a withdrawn
// one all render the SAME page with the store's own sentence. Telling them apart
// would make the link a way to learn that something is there — and a signer who
// followed a real link that has since been answered deserves a sentence, not a
// dead end.

import type { Metadata } from "next";

import { publicSignRequest } from "@/features/esign/service";

import { PublicLinkNotice } from "@/components/public-link/PublicLinkNotice";

import { SignRunner } from "./SignRunner";

// A signing link is answered now, by whoever holds it; its state moves and
// nothing about it is cacheable across people.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // THE TITLE NAMES NO DOCUMENT. A tab title and an Open Graph card are the two
  // places a link's contents leak into somebody else's screenshot or chat
  // preview, and what a client is being asked to sign is their business.
  title: "Signature request",
  robots: { index: false, follow: false },
};

export default async function PublicSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const request = await publicSignRequest(token, null);

  // THE STORE'S WORDS, VERBATIM. The page and the door can never say different
  // things because there is only one sentence.
  //
  // `unavailable` is STORE-OFF's (2026-09-22) and it replaced something worse than
  // a 404: this door used to call `custom.assert_store_door`, which RAISES 42501,
  // and the service turns a refused door into a thrown Error — so a signer opening
  // a link from their own email got an HTTP 500 off an organization's own switch.
  if (!request.found || !request.signable) {
    return (
      <PublicLinkNotice
        title={request.found && request.state === "signed" ? "Already signed" : "Signature request"}
        message={request.message}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-safe pt-8 matrx-touch-targets">
      <SignRunner token={token} request={request} />
    </main>
  );
}
