"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { ProviderConversationTranscript } from "../../components/ProviderConversationTranscript";
import {
  readProviderConversationWith,
  type ProviderConversationRead,
} from "../../service/providerConversationRead";

/** The session's mirrored transcript, read client-side through the one reader. */
export function SessionTranscriptPane({ address }: { address: string }) {
  const [read, setRead] = useState<ProviderConversationRead | null>(null);

  useEffect(() => {
    let current = true;
    setRead(null);
    void readProviderConversationWith(supabase, address).then((result) => {
      if (current) setRead(result);
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
      <p className="p-4 text-sm text-muted-foreground">
        {read.state === "not-provider"
          ? "This conversation is not a coding-session mirror."
          : "The transcript could not be read."}
      </p>
    );
  }
  return <ProviderConversationTranscript key={address} detail={read.detail} />;
}
