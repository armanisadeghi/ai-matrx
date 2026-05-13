"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Menu, Building2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/features/organizations/hooks";
import { OrgSidebar } from "@/features/organizations/components/OrgSidebar";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

export default function OrgSettingsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const orgId = params.orgId as string;
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Resolve the org UUID so the useOrganization hook (which needs a UUID) works
  const [resolvedOrgId, setResolvedOrgId] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function resolve() {
      try {
        const org = await getOrganizationBySlugOrId(orgId);
        if (org) setResolvedOrgId(org.id);
      } catch {
        // ignore
      }
    }
    resolve();
  }, [orgId]);

  const { organization } = useOrganization(resolvedOrgId ?? "");

  return (
    <div className="h-page w-full bg-textured overflow-hidden flex flex-col">
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="h-12 px-3 md:px-4 flex items-center gap-3">
          <Link
            href="/organizations"
            className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Back to Organizations"
          >
            <ArrowLeft size={18} />
          </Link>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <h1 className="text-base font-semibold text-foreground truncate">
              {organization?.name || "Organization Settings"}
            </h1>
          </div>

          {isMobile && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader>
                  <SheetTitle>Organizations</SheetTitle>
                </SheetHeader>
                <div className="mt-4" onClick={() => setMobileMenuOpen(false)}>
                  <OrgSidebar />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden md:flex w-52 flex-shrink-0 border-r border-border bg-card overflow-y-auto">
          <div className="p-3 w-full">
            <OrgSidebar />
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
