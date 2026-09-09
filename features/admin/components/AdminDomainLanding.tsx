import type { ReactNode } from "react";
import {
  findAdminNavigationDomainBySlug,
  type AdminNavigationDomain,
} from "@/features/admin/constants/admin-navigation";
import { AdminDomainSection } from "@/features/admin/components/AdminDomainSection";

/**
 * THE standard administration domain landing page.
 *
 * Every `/administration/<domain-slug>` root renders this. It exists because a
 * hand-built landing always drifts: it ships linking six of its nine
 * destinations, a seventh is added later, and nobody notices the door is
 * missing. Here the destination directory is generated from
 * `adminNavigationRegistry`, so a domain's landing page CANNOT fall behind its
 * own routes — adding a destination to the registry adds it to the landing.
 *
 * Custom content is welcome and is the nicer page when it exists: pass it as
 * `children` and it renders above the directory (KPIs, a live table, a console).
 * What custom content may never do is REPLACE the directory — that is the whole
 * point of the template. A domain whose custom body genuinely is the complete
 * navigation can pass `directory="none"`, but it must then be obvious that
 * every destination is reachable from that body.
 */
interface AdminDomainLandingProps {
  domainSlug: string;
  /** Custom body for this domain, rendered above the destination directory. */
  children?: ReactNode;
  /**
   * `full` (default) renders every section and destination.
   * `none` opts out — only for a custom body that already links all of them.
   */
  directory?: "full" | "none";
}

export function AdminDomainLanding({
  domainSlug,
  children,
  directory = "full",
}: AdminDomainLandingProps) {
  const domain = findAdminNavigationDomainBySlug(domainSlug);
  if (!domain) {
    throw new Error(`Unknown administration domain: ${domainSlug}`);
  }

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="flex flex-col gap-4 p-4">
        {children ? <div className="min-w-0">{children}</div> : null}

        {directory === "full" ? (
          <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            <AdminDomainSection
              domain={domain}
              headingLevel={children ? "h2" : "h1"}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Count of destinations a domain owns — for callers rendering their own summary. */
export function countAdminDomainDestinations(
  domain: AdminNavigationDomain,
): number {
  return domain.sections.reduce(
    (count, section) => count + section.destinations.length,
    0,
  );
}
