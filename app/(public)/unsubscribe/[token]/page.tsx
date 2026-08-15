// app/(public)/unsubscribe/[token]/page.tsx
//
// The human unsubscribe page — where the visible "unsubscribe" link in the body
// of a message lands. Anonymous by design: the recipient is a stranger with no
// account, and requiring one would make the mechanism non-functional (and
// therefore unlawful in all four regimes we send under).
//
// This page DOES show a button rather than unsubscribing on load. That is not a
// confirmation step in the RFC 8058 sense — the one-click header path is
// /api/unsubscribe/[token] and completes with no interaction. A bare GET that
// mutates would fire on every link scanner and antivirus prefetch, which is the
// exact accident RFC 8058 was written to prevent.
//
// Never leaks the raw address: outreach_unsubscribe_preview returns a masked one,
// so a leaked token cannot become a disclosed email address.

import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { UnsubscribeForm } from "./UnsubscribeForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  // A preference page has no business in an index.
  robots: { index: false, follow: false },
};

type Preview = {
  ok: boolean;
  error?: string;
  organization_name?: string | null;
  list_name?: string | null;
  masked_address?: string | null;
  already_unsubscribed?: boolean;
};

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("outreach_unsubscribe_preview", {
    p_token: token,
  });

  const preview: Preview = error
    ? { ok: false, error: "server_error" }
    : ((data ?? { ok: false, error: "no_result" }) as Preview);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-textured p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        {preview.ok ? (
          <UnsubscribeForm
            token={token}
            organizationName={preview.organization_name ?? null}
            listName={preview.list_name ?? null}
            maskedAddress={preview.masked_address ?? null}
            alreadyUnsubscribed={Boolean(preview.already_unsubscribed)}
          />
        ) : (
          // Even the failure path is a real answer with a way forward. The
          // recipient did nothing wrong and must never be told to "contact
          // support" about a link we sent them.
          <div className="space-y-3">
            <h1 className="text-lg font-semibold text-foreground">
              We couldn&apos;t find that link
            </h1>
            <p className="text-sm text-muted-foreground">
              The unsubscribe link may have been shortened or altered by your email
              app. You can also reply to the message with the word{" "}
              <span className="font-medium text-foreground">unsubscribe</span> — we
              read replies and will stop contacting you.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
