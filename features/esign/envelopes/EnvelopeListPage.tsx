"use client";

// features/esign/envelopes/EnvelopeListPage.tsx — /esign: every envelope I sent, was given, or
// must sign. Feature entry pages are LIST views (CLAUDE.md); sending starts from "Send".

import Link from "next/link";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken, selectAuthReady, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { envelopeListConfig } from "./listConfig";

export function EnvelopeListPage() {
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const mayLoad = Boolean(authReady && userId && accessToken);

  const sendButton = (
    <Button size="sm" asChild>
      <Link href="/esign/new">
        <Send className="h-4 w-4" />
        <span className="max-sm:sr-only">Send for signature</span>
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold text-foreground">E-Signatures</h1>
        </div>
      </PageHeader>
      {mayLoad ? (
        <EntityListPage config={envelopeListConfig} headerActions={sendButton} emptyAction={sendButton} />
      ) : (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground" role="status">
          Loading your envelopes…
        </div>
      )}
    </>
  );
}
