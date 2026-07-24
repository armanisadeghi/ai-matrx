import Link from "next/link";
import IconResolver from "@/components/official/icons/IconResolver";
import {
  adminDomainHref,
  findAdminNavigationDomainBySlug,
  type AdminNavigationDomain,
} from "@/features/admin/constants/admin-navigation";

interface AdminDomainSectionProps {
  domain: AdminNavigationDomain;
  headingLevel?: "h1" | "h2";
}

/**
 * Compact, direct-link rendering of one administration domain.
 * Used by both the administration home and static domain landing routes.
 */
export function AdminDomainSection({
  domain,
  headingLevel: Heading = "h2",
}: AdminDomainSectionProps) {
  return (
    <section className="border-b border-border bg-background last:border-b-0">
      <div className="flex items-center gap-3 border-b border-border/70 bg-muted/30 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <IconResolver iconName={domain.iconName} className="h-4 w-4" />
        </span>
        <Link
          href={adminDomainHref(domain)}
          className="min-w-0 text-foreground hover:text-primary"
        >
          <Heading className="text-base font-semibold">{domain.name}</Heading>
          <span className="text-xs text-muted-foreground">
            {domain.sections.reduce(
              (count, section) => count + section.destinations.length,
              0,
            )}{" "}
            destinations
          </span>
        </Link>
      </div>

      <div
        className={
          domain.sections.length > 1
            ? "grid divide-y divide-border/70 xl:grid-cols-2 xl:divide-x xl:divide-y-0"
            : "grid"
        }
      >
        {domain.sections.map((section) => (
          <div key={section.name} className="min-w-0">
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <IconResolver iconName={section.iconName} className="h-3.5 w-3.5" />
              <span>{section.name}</span>
            </div>
            <div className="divide-y divide-border/50">
              {section.destinations.map((destination) => (
                <Link
                  key={destination.link}
                  href={destination.link}
                  className="group flex min-h-11 items-center gap-3 px-4 py-2 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground group-hover:text-primary">
                    <IconResolver
                      iconName={destination.iconName}
                      className="h-4 w-4"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {destination.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {destination.description}
                    </span>
                  </span>
                  <IconResolver
                    iconName="ChevronRight"
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                  />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AdminDomainDirectory({ domainSlug }: { domainSlug: string }) {
  const domain = findAdminNavigationDomainBySlug(domainSlug);
  if (!domain) {
    throw new Error(`Unknown administration domain: ${domainSlug}`);
  }

  return (
    <div className="h-full overflow-y-auto bg-textured p-4">
      <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
        <AdminDomainSection domain={domain} headingLevel="h1" />
      </div>
    </div>
  );
}
