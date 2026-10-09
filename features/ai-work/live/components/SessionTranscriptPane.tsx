"use client";

import { useEffect, useState } from "react";
import { ErrorNotice } from "@ai-matrx/design-system";
import { supabase } from "@/utils/supabase/client";
import { ProviderConversationTranscript } from "../../components/ProviderConversationTranscript";
import {
  readProviderConversationWith,
  type ProviderConversationRead,
} from "../../service/providerConversationRead";

/** The session's mirrored transcript, read client-side through the one reader. */
export function SessionTranscriptPane({ address }: { address: string }) {
  const [loaded, setLoaded] = useState<{
    address: string;
    read: ProviderConversationRead;
  } | null>(null);
  const read = loaded?.address === address ? loaded.read : null;

  useEffect(() => {
    let current = true;
    void readProviderConversationWith(supabase, address).then((result) => {
      if (current) setLoaded({ address, read: result });
    });
    return () => {
      current = false;
    };
  }, [address]);

  if (!read) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
    );
  }
  if (read.state !== "ready") {
    return (
      <div className="p-4">
        {read.state === "not-provider" ? (
          <p className="text-sm text-muted-foreground">
            This conversation is not a coding-session mirror.
          </p>
        ) : (
          <ErrorNotice message="The transcript could not be read." error={read.error} size="compact" />
        )}
      </div>
    );
  }
  return <ProviderConversationTranscript key={address} detail={read.detail} />;
}
