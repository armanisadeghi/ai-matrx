// Suggestion inbox — the deck owner reviews suggest-edits on their community
// decks. Signed-in only; the RLS + RPC enforce owner-only access to the rows.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { OwnerSuggestionInbox } from "@/features/education/library/components/OwnerSuggestionInbox";
import { eduHref } from "@/features/education/constants";

export const metadata: Metadata = {
  title: "Suggestions · Community Library · AI Matrx Education",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SuggestionInboxPage() {
  const { user, authUnavailable } = await getServerAuth();
  if (!user) {
    // Could-not-verify is not signed-out — never bounce a signed-in owner to
    // /login over an auth-authority blink.
    if (authUnavailable) {
      console.warn("[/education/library/suggestions] identity could not be verified — showing the retry notice, not redirecting.");
      return (
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 text-sm text-muted-foreground">
          We could not verify who you are on this request, so your suggestion
          inbox is not loading. You have not been signed out — reload in a moment.
        </div>
      );
    }
    redirect(`/login?redirectTo=${encodeURIComponent(eduHref("library", "suggestions"))}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-1">
        <Lightbulb className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Deck suggestions</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Improvements the community proposed for your decks. Accept or decline —
        your decks never change until you say so.{" "}
        <Link href={eduHref("library")} className="text-primary hover:underline">
          Back to the library
        </Link>
      </p>
      <OwnerSuggestionInbox />
    </div>
  );
}
