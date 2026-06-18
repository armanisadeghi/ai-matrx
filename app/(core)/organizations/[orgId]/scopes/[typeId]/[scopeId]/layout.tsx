import { ScopesRouteHeader } from "@/features/scope-system/components/ScopesRouteHeader";

/**
 * Wraps every page about a single scope (detail, item, edit, context-items) with
 * a shared header-injected breadcrumb. The breadcrumb renders into the shell
 * header center slot, so it costs zero page body space.
 */
export default function ScopeDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ScopesRouteHeader />
      {children}
    </>
  );
}
