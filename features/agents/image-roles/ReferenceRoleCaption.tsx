"use client";

import { referenceRoleCaption } from "@ai-matrx/agents";

/**
 * The reference role (and `@name`) an image or video carried as an input,
 * redisplayed above the media. Renders nothing for media without a role.
 */
export function ReferenceRoleCaption({
  role,
  name,
}: {
  role: unknown;
  name: unknown;
}) {
  const caption = referenceRoleCaption(role, name);
  if (!caption) return null;
  return (
    <div
      className="mt-2 -mb-1 text-xs font-medium text-muted-foreground"
      data-reference-role={typeof role === "string" ? role : undefined}
    >
      {caption}
    </div>
  );
}
