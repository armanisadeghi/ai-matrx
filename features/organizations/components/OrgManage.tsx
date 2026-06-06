"use client";

/**
 * OrgManage — the organization manage/edit experience.
 *
 * Replaces the old tabbed OrgSettings with a single scrollable, sectioned page
 * that matches the OrgWorkspace aesthetic: an identity header, a sticky section
 * nav (jumps, not tabs — every section stays on the page), and each concern as
 * its own Card. Reuses the existing settings sub-components unchanged; only the
 * shell changed.
 *
 * Rendered inside the settings layout's scroll area, so it lays out as a content
 * block (no own full-height scroll container).
 */

import React from "react";
import Link from "next/link";
import {
  Settings,
  Users,
  Mail,
  AlertTriangle,
  Send,
  FolderTree,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  ArrowLeft,
  Crown,
  Shield,
  SlidersHorizontal,
  User as UserIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineMediaRef } from "@/features/files";
import type { Organization, OrgRole } from "../types";
import { GeneralSettings } from "./GeneralSettings";
import { MemberManagement } from "./MemberManagement";
import { InvitationManager } from "./InvitationManager";
import { DangerZone } from "./DangerZone";
import { OrgEmailTab } from "./OrgEmailTab";
import { OrgPrivacyTab } from "./OrgPrivacyTab";
import { OrgScopeTree } from "./OrgScopeTree";
import { OrgModuleSettings } from "./OrgModuleSettings";

interface OrgManageProps {
  organization: Organization;
  userRole: OrgRole;
  isOwner: boolean;
  isAdmin: boolean;
}

interface SectionDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
  danger?: boolean;
}

export function OrgManage({ organization, userRole, isOwner, isAdmin }: OrgManageProps) {
  const [displayOrganization, setDisplayOrganization] =
    React.useState<Organization>(organization);

  React.useEffect(() => {
    setDisplayOrganization(organization);
  }, [organization]);

  const canManageSettings = isOwner || isAdmin;
  const canManageMembers = isOwner || isAdmin;
  const canDelete = isOwner && !displayOrganization.isPersonal;

  const slug = displayOrganization.slug ?? displayOrganization.id;
  const RoleIcon = userRole === "owner" ? Crown : userRole === "admin" ? Shield : UserIcon;

  const sections: SectionDef[] = [
    { id: "general", label: "General", icon: Settings, show: true },
    { id: "members", label: "Members", icon: Users, show: canManageMembers },
    { id: "invitations", label: "Invitations", icon: Mail, show: canManageSettings },
    { id: "scopes", label: "Scopes", icon: FolderTree, show: canManageSettings },
    { id: "modules", label: "Modules", icon: SlidersHorizontal, show: canManageSettings },
    { id: "privacy", label: "Privacy", icon: ShieldCheck, show: canManageSettings },
    { id: "email", label: "Email", icon: Send, show: canManageMembers },
    { id: "danger", label: "Danger zone", icon: AlertTriangle, show: canDelete, danger: true },
  ].filter((s) => s.show);

  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5 pr-14 md:pr-6">
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2">
        <Link href={`/organizations/${slug}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {displayOrganization.name}
        </Link>
      </Button>

      {/* Identity header */}
      <Card className="p-5 relative overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-500" />
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden">
            <InlineMediaRef
              ref={displayOrganization.logoUrl ?? null}
              size="fill"
              fit="cover"
              rounded="lg"
              fallbackIcon={
                <div className="w-full h-full bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center text-white text-xl font-bold">
                  {displayOrganization.name?.[0]?.toUpperCase() ?? "?"}
                </div>
              }
              alt={displayOrganization.name}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground truncate">
                {displayOrganization.name}
              </h1>
              {displayOrganization.isPersonal && <Badge variant="secondary">Personal</Badge>}
              <Badge variant="outline" className="text-xs capitalize gap-1">
                <RoleIcon className="h-3 w-3" />
                {userRole}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage this organization&apos;s identity, members, and settings.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`/organizations/${slug}`}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Workspace
            </Link>
          </Button>
        </div>
      </Card>

      {/* Sticky section nav */}
      <div className="sticky top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 py-2 bg-textured/90 backdrop-blur border-b border-border">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => jumpTo(s.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                s.danger
                  ? "text-red-600 dark:text-red-400 hover:bg-red-500/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!canManageSettings && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            View-only access. Contact an admin to make changes.
          </p>
        </div>
      )}

      {/* General */}
      <SectionCard id="general" icon={Settings} title="General" description="Name, logo, website, and description.">
        <GeneralSettings
          organization={displayOrganization}
          canEdit={canManageSettings}
          userRole={userRole}
          onOrganizationUpdated={setDisplayOrganization}
        />
      </SectionCard>

      {/* Members */}
      {canManageMembers && (
        <SectionCard id="members" icon={Users} title="Members" description="Who's on the team and what they can do.">
          <MemberManagement
            organizationId={displayOrganization.id}
            userRole={userRole}
            isOwner={isOwner}
            isPersonal={displayOrganization.isPersonal}
          />
        </SectionCard>
      )}

      {/* Invitations */}
      {canManageSettings && (
        <SectionCard id="invitations" icon={Mail} title="Invitations" description="Invite new members by email and manage pending invites.">
          <InvitationManager
            organizationId={displayOrganization.id}
            organizationName={displayOrganization.name}
            userRole={userRole}
          />
        </SectionCard>
      )}

      {/* Scopes — inline tree + edit links */}
      {canManageSettings && (
        <section id="scopes" className="scroll-mt-16">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="h-9 w-9 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <FolderTree className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-semibold leading-tight">Scopes</h2>
                  <p className="text-xs text-muted-foreground">
                    The dimensions your team works in — the most important part of context.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href={`/organizations/${slug}/scopes`}>
                  Edit scopes
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
            <OrgScopeTree orgId={displayOrganization.id} slug={slug} />
          </Card>
        </section>
      )}

      {/* Module settings — per-kind org rules (placeholder tasklist UI) */}
      {canManageSettings && (
        <SectionCard
          id="modules"
          icon={SlidersHorizontal}
          title="Module settings"
          description="Org rules for each kind of resource — agents, notes, files, and the rest."
        >
          <OrgModuleSettings />
        </SectionCard>
      )}

      {/* Privacy — OrgPrivacyTab self-cards */}
      {canManageSettings && (
        <section id="privacy" className="scroll-mt-16 space-y-2">
          <SectionHeading icon={ShieldCheck} title="Privacy & ingestion" description="Control automatic knowledge ingestion and daily budget." />
          <OrgPrivacyTab organizationId={displayOrganization.id} canEdit={canManageSettings} />
        </section>
      )}

      {/* Email */}
      {canManageMembers && (
        <SectionCard id="email" icon={Send} title="Email" description="Send a message to everyone in this organization.">
          <OrgEmailTab
            organizationId={displayOrganization.id}
            organizationName={displayOrganization.name}
          />
        </SectionCard>
      )}

      {/* Danger zone */}
      {canDelete && (
        <section id="danger" className="scroll-mt-16">
          <Card className="p-5 border-red-200 dark:border-red-900/50">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <h2 className="text-base font-semibold text-red-700 dark:text-red-400">
                Danger zone
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Irreversible actions. Proceed with care.
            </p>
            <DangerZone organization={displayOrganization} />
          </Card>
        </section>
      )}
      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-9 w-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function SectionCard({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <Card className="p-5">
        <div className="mb-4">
          <SectionHeading icon={icon} title={title} description={description} />
        </div>
        {children}
      </Card>
    </section>
  );
}
