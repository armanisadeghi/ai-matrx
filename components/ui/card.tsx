"use client";

/**
 * HOST BINDING ONLY — the Card implementation lives in
 * `@ai-matrx/design-system`. This file binds the ONE thing four forked cards
 * actually disagreed about: density.
 *
 * This app is dense on purpose (`p-2` sections), so it binds `size="sm"`;
 * dashboard binds `lg`. The package declares density once on the root and
 * every section reads it from context, so a card can no longer end up with a
 * `p-6` header above a `p-2` body — which is how the forks drifted.
 *
 * Pass `size` explicitly on any individual card that wants something else.
 * `CardAction` (a trailing header control slot) is new and worth reaching for
 * instead of another one-off absolute wrapper.
 */

import { Card as PackageCard, type CardProps } from "@ai-matrx/design-system";
import * as React from "react";

export {
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@ai-matrx/design-system";
export type { CardProps, CardSize } from "@ai-matrx/design-system";

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ size = "sm", ...props }, ref) => (
    <PackageCard ref={ref} size={size} {...props} />
  ),
);
Card.displayName = "Card";

export { Card };
