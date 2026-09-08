"use client";

/**
 * AppLink — THE LINK DOOR for a repo that is built into three deployments.
 *
 * Use this instead of `next/link` for ANY href that can point at a surface the
 * running build might not compile (`/administration/*`, `/demos/*`). It is a
 * no-op — literally `next/link` with the same props — on a build that serves
 * the path itself, so a component shared between www and manage stays correct
 * on both without knowing which one it is rendering on.
 *
 * When the build CANNOT serve the path, this renders a plain `<a>` carrying the
 * sibling deployment's ABSOLUTE url. That matters for one reason: `next/link`
 * prefetches an internal href on hover with an RSC `fetch()`, the browser
 * preflights it, `proxy.ts` answers with a cross-origin redirect, and a
 * preflight may not be redirected. See `lib/deployment/surfaces.ts` for the
 * full account of the production defect this closes.
 *
 * `scripts/check-cross-deployment-links.ts` fails the gates on a `next/link`
 * link to a split surface, so new code cannot re-open the hole.
 */

import Link from "next/link";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { crossDeploymentHref } from "@/lib/deployment/surfaces";

type AppLinkProps = ComponentPropsWithoutRef<typeof Link>;

const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, prefetch, replace, scroll, shallow, locale, ...rest },
  ref,
) {
  const external = crossDeploymentHref(href);
  if (external) {
    // A different origin: a document navigation, and nothing else. Router-only
    // props are dropped deliberately — none of them mean anything across a
    // deployment boundary, and passing them to <a> would warn in React.
    return <a {...rest} ref={ref} href={external} />;
  }
  return (
    <Link
      {...rest}
      ref={ref}
      href={href}
      prefetch={prefetch}
      replace={replace}
      scroll={scroll}
      shallow={shallow}
      locale={locale}
    />
  );
});

export default AppLink;
export { AppLink };
