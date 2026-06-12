"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  FileText,
  Folder,
  LayoutDashboard,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getOrganizationBySlugOrId,
  getUserRole,
} from "@/features/organizations/service";
import type { Organization, OrgRole } from "@/features/organizations/types";
import {
  OrgShortcutsProvider,
  type OrgShortcutsContextValue,
} from "./OrgShortcutsContext";

function getNavItems(orgId: string) {
  return [
    {
      label: "Dashboard",
      href: `/organizations/${orgId}/shortcuts`,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: "Shortcuts",
      href: `/organizations/${orgId}/shortcuts/shortcuts`,
      icon: Zap,
    },
    {
      label: "Categories",
      href: `/organizations/${orgId}/shortcuts/categories`,
      icon: Folder,
    },
    {
      label: "Content Blocks",
      href: `/organizations/${orgId}/shortcuts/content-blocks`,
      icon: FileText,
    },
  ];
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}

function roleCanWrite(role: OrgRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function OrgShortcutsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const urlOrgId = params.orgId as string;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  const [organization, setOrganization] = React.useState<Organization | null>(
    null,
  );
  const [role, setRole] = React.useState<OrgRole | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const org = await getOrganizationBySlugOrId(urlOrgId);
        if (!org) {
          setError("Organization not found");
          return;
        }
        setOrganization(org);
        const userRole = await getUserRole(org.id);
        if (!userRole) {
          setError("Access denied. You must be a member of this organization.");
          return;
        }
        setRole(userRole);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load organization";
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [urlOrgId]);

  const isEditPage = pathname.includes("/shortcuts/edit/");

  if (loading) {
    return (
      <div className="h-[calc(100dvh-2.5rem)] flex items-center justify-center bg-textured">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading organization…
        </div>
      </div>
    );
  }

  if (error || !organization || !role) {
    return (
      <div className="h-[calc(100dvh-2.5rem)] flex items-center justify-center bg-textured p-4">
        <Card className="max-w-lg w-full p-8 border-destructive/30">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-destructive/10 rounded-full">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                {!organization ? "Organization Not Found" : "Access Denied"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {error ?? "You don't have permission to access this resource."}
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button
                onClick={() => router.push(`/organizations/${urlOrgId}`)}
                variant="outline"
                size="sm"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Organization
              </Button>
              <Button
                onClick={() => router.push("/dashboard")}
                variant="outline"
                size="sm"
              >
                Dashboard
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Use the canonical slug for navigation URLs
  const navOrgId = organization.slug;
  const canWrite = roleCanWrite(role);
  const ctxValue: OrgShortcutsContextValue = {
    orgId: navOrgId,
    organizationId: organization.id,
    organizationName: organization.name,
    role,
    canWrite,
  };

  if (isEditPage) {
    return (
      <OrgShortcutsProvider value={ctxValue}>{children}</OrgShortcutsProvider>
    );
  }

  const navItems = getNavItems(navOrgId);

  const handleNavigate = (href: string) => {
    if (pathname === href || isPending) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <OrgShortcutsProvider value={ctxValue}>
      <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
        <div className="border-b border-border px-4 bg-card flex items-center gap-2 flex-wrap">
          <Link
            href={`/organizations/${navOrgId}`}
            className="text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <nav className="flex items-center h-12 gap-1 flex-1 min-w-0 overflow-x-auto">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              const navigating = isPending && pendingHref === item.href;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => handleNavigate(item.href)}
                  disabled={isPending}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                >
                  {navigating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <item.icon className="w-4 h-4" />
                  )}
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="flex items-center gap-2 pr-1">
            <Badge
              variant="outline"
              className="text-[11px] capitalize inline-flex items-center gap-1"
            >
              {canWrite ? (
                <Shield className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              {role}
            </Badge>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </OrgShortcutsProvider>
  );
}
