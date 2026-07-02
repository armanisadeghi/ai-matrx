"use client";

import React, { useState, useMemo } from "react";
import { useOrganizationMembers } from "../hooks";
import { EmailComposeSheet } from "@/components/admin/EmailComposeSheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Search, Users, Send } from "lucide-react";
import type { OrganizationMemberWithUser } from "@/features/organizations/types";

interface OrgEmailTabProps {
  organizationId: string;
  organizationName: string;
}

/** Narrows a member to one with a resolved user + non-empty email. */
type EmailableMember = OrganizationMemberWithUser & {
  user: NonNullable<OrganizationMemberWithUser["user"]> & { email: string };
};

function hasEmail(m: OrganizationMemberWithUser): m is EmailableMember {
  return Boolean(m.user?.email);
}

function getInitials(name?: string, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) {
    return email[0].toUpperCase();
  }
  return "?";
}

/**
 * OrgEmailTab - Send emails to organization members
 *
 * Shows a list of org members with checkboxes for selection,
 * then opens the EmailComposeSheet with selected recipients.
 */
export function OrgEmailTab({
  organizationId,
  organizationName,
}: OrgEmailTabProps) {
  const { members, loading, error } = useOrganizationMembers(organizationId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);

  // Filter members with valid emails
  const emailableMembers = useMemo(() => {
    return members.filter(hasEmail);
  }, [members]);

  // Search filter
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return emailableMembers;
    const q = searchQuery.toLowerCase();
    return emailableMembers.filter(
      (m) =>
        (m.user?.displayName && m.user.displayName.toLowerCase().includes(q)) ||
        (m.user?.email && m.user.email.toLowerCase().includes(q)) ||
        m.role.toLowerCase().includes(q),
    );
  }, [emailableMembers, searchQuery]);

  // Build recipients array from selected members
  const selectedRecipients = useMemo(() => {
    return emailableMembers
      .filter((m) => selectedIds.has(m.userId))
      .map((m) => ({
        id: m.userId,
        email: m.user.email,
        name: m.user.displayName || m.user.email,
      }));
  }, [emailableMembers, selectedIds]);

  const toggleMember = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredMembers.map((m) => m.userId)));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const allFilteredSelected =
    filteredMembers.length > 0 &&
    filteredMembers.every((m) => selectedIds.has(m.userId));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-700 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (emailableMembers.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-border rounded-lg">
        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">
          No members with email addresses found.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Invite members to your organization first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Email Members</h3>
          <p className="text-xs text-muted-foreground">
            Select members to send an email to
          </p>
        </div>
        <Button
          onClick={() => setComposeOpen(true)}
          disabled={selectedRecipients.length === 0}
          size="sm"
          className="gap-1.5"
        >
          <Send className="h-3.5 w-3.5" />
          Compose ({selectedRecipients.length})
        </Button>
      </div>

      {/* Search + Select all/none */}
      <div className="flex items-center gap-2">
        {emailableMembers.length > 5 && (
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}
        <div className="flex gap-1.5 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={allFilteredSelected ? selectNone : selectAll}
          >
            {allFilteredSelected ? "Deselect All" : "Select All"}
          </Button>
        </div>
      </div>

      {/* Members list */}
      <div className="border rounded-lg divide-y divide-border bg-card overflow-hidden">
        {filteredMembers.map((member) => {
          const isSelected = selectedIds.has(member.userId);
          return (
            <label
              key={member.userId}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleMember(member.userId)}
              />
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarImage src={member.user?.avatarUrl || undefined} />
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {getInitials(member.user?.displayName, member.user?.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {member.user?.displayName || member.user?.email || "Unknown"}
                </p>
                {member.user?.displayName && member.user.email && (
                  <p className="text-xs text-muted-foreground truncate">
                    {member.user.email}
                  </p>
                )}
              </div>
              <Badge
                variant="outline"
                className="text-[10px] capitalize flex-shrink-0"
              >
                {member.role}
              </Badge>
            </label>
          );
        })}
        {filteredMembers.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No members match your search
          </div>
        )}
      </div>

      {/* Selected count */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          {selectedRecipients.length} member
          {selectedRecipients.length !== 1 ? "s" : ""} selected
        </div>
      )}

      {/* Email compose sheet */}
      <EmailComposeSheet
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        recipients={selectedRecipients}
        title={`Email ${organizationName} Members`}
        sendAsUser
      />
    </div>
  );
}
