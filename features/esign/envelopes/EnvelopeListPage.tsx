"use client";

// features/esign/envelopes/EnvelopeListPage.tsx — /esign: every envelope I sent, was given, or
// must sign. Feature entry pages are LIST views (CLAUDE.md); sending starts from "Send".

import Link from "next/link";
import { Send } from "lucide-react";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
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
    <ControlButton variant="primary" asChild icon={<Send className="h-4 w-4" />} collapse="container">
      <Link href="/esign/new">
        Send for signature
      </Link>
    </ControlButton>
  );

  return (
    <>
      <RecordPageHeader record={{ name: "E-Signatures" }} />
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
