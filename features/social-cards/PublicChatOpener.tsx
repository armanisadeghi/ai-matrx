"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageSquareText } from "lucide-react";

export function PublicChatOpener({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const destination = `/chat/${encodeURIComponent(conversationId)}?attention=approval`;

  useEffect(() => {
    router.replace(destination);
  }, [destination, router]);

  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-br from-background via-background to-primary/10 px-5 py-16">
      <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card p-7 text-center shadow-2xl shadow-primary/10">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
          <MessageSquareText className="size-7" />
        </div>
        <h1 className="mt-5 text-balance text-2xl font-semibold text-foreground">
          Opening your secure conversation
        </h1>
        <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
          Your text assistant has an action ready for review. Nothing happens until you approve it.
        </p>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
        </div>
        <Link
          href={destination}
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Continue to conversation
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
