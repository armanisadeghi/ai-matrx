"use client";

/**
 * Walkthrough — a short, honest written guide (WS-8 first-release scope).
 *
 * A person who has never seen the feature can follow it. It is honest about the
 * AWS session-expiry caveat (D-7): we cannot keep those sessions alive forever.
 * Rendered through the canonical markdown component.
 */

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { AWS_SESSION_CAVEAT } from "../constants";
import { cn } from "@/utils/cn";

const WALKTHROUGH = `## Your Cloud Browser, in a minute

A **Cloud Browser** is a real web browser that lives on our servers and stays signed in to your
accounts, so an agent can do real work for you — check billing, pull a report, update a setting —
even when your laptop is closed.

### What you'll see

1. **Written progress** (the default). A plain-language list of what the agent is doing and where.
   No video, nothing to watch — just the story of the work.
2. **Show me what's happening.** Press it to get a fresh picture of the page every few seconds. It
   stops on its own after a few minutes so nothing runs in the background. Start it again whenever.
3. **Take control.** Some steps need you — a verification code, a sign-in, an approval. When that
   happens you'll be notified, you step into the live browser, do the one thing, and hand it back.
   The banner at the top always says who is driving.

### When we need you

We'll reach you the way you chose — a pop-up, an in-app message, an email, or a text. You decide
when you set this up, and you can change it any time.

### One honest limit

${AWS_SESSION_CAVEAT}
`;

export function Walkthrough({ className }: { className?: string }) {
  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="p-4">
        <BasicMarkdownContent content={WALKTHROUGH} showCopyButton={false} />
      </div>
    </ScrollArea>
  );
}
