// ModuleSignInGate — the interim guest surface for a feature route that has
// no marketing landing yet.
//
// THE RULE (module-landing-pages skill): an anonymous visitor must NEVER see
// an error, a blank shell, or a raw login wall. The ideal guest surface is a
// registered ModuleLanding; until a feature has one, render THIS instead of
// the workspace. It is a calm, branded "sign in to use X" panel — not an
// error state — with real routes in (login carries redirectTo back here).
//
// Usage (server-side branch, same shape as the notes/layout.tsx exemplar):
//
//   const { isAuthenticated } = await getServerAuth();
//   if (!isAuthenticated) {
//     return <ModuleSignInGate title="Projects" route="/projects"
//       description="Plan and track work across your organization." />;
//   }
//
// Always branch on the SERVER — never render the workspace tree for guests
// and patch over its errors client-side. When the feature gets a real
// landing, replace this with the ModuleLanding + directory registration.

import Link from "next/link";
import { LogIn, ArrowRight, LayoutGrid, type LucideIcon } from "lucide-react";

export function ModuleSignInGate({
  title,
  route,
  description,
  icon: Icon = LogIn,
}: {
  /** Feature display name, e.g. "Projects". */
  title: string;
  /** The route to return to after login, e.g. "/projects". */
  route: string;
  /** One-line pitch shown under the heading. */
  description?: string;
  /** Optional Lucide icon for the panel header (server-side only). */
  icon?: LucideIcon;
}) {
  const loginHref = `/login?redirectTo=${encodeURIComponent(route)}`;
  const signupHref = `/sign-up?redirectTo=${encodeURIComponent(route)}`;
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-5 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <Icon className="h-7 w-7 text-primary" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-foreground sm:text-2xl">
          Sign in to use {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {description ??
            `${title} is part of your AI Matrx workspace. Sign in to pick up where you left off, or create a free account to get started.`}
        </p>
        <div className="mt-6 flex w-full flex-col gap-2">
          <Link
            href={loginHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
          <Link
            href={signupHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Create a free account
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <Link
          href="/features"
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Explore what AI Matrx can do
        </Link>
      </div>
    </div>
  );
}
