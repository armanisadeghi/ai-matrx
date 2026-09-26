"use client";

// features/notifications/components/NotificationBody.tsx
//
// A notice's body is TEXT SOMEONE WROTE (a quoted comment, a mention, a reply) in the platform's one
// markdown: it renders through the ONE core at the inline level — mentions become names, emphasis is
// emphasis — never as raw markup (verify RC-B11 round 2). It is someone else's text, so remote images
// wait for a click.

import { RichContent } from "@/components/rich-content/RichContent";

export function NotificationBody({ body, className }: { body: string; className?: string }) {
  return (
    <span className={className}>
      <RichContent level="inline" source={body} imagePolicy="other" />
    </span>
  );
}
