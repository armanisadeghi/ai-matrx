"use client";

/**
 * MembersPanel — the single, shared, presentational members list used by BOTH
 * organization and project Manage pages (and any future "team" surface).
 *
 * This is the battle-tested organization MemberManagement UI, lifted verbatim
 * and made data-agnostic. It does NOT fetch members, roles, or run mutations —
 * its consumer (a thin wrapper around org/project hooks) supplies the data and
 * the operations. The visual design is intentionally identical to what shipped
 * for organizations, because that is the design the product owner approves of.
 *
 * It DOES own the two cross-cutting member quick-actions — direct message and
 * email — because those reuse app-wide infrastructure (the messaging Redux
 * slice + EmailComposeSheet) that behaves the same regardless of whether the
 * member belongs to an org or a project. Consumers can opt out per-flag.
 */

import { useState } from "react";
import {
  Crown,
  Shield,
  User as UserIcon,
  MoreVertical,
  Loader2,
  Search,
  UserX,
  MessageSquare,
  Mail,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { idMatchesQuery } from "@/utils/search-scoring";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  openMessaging,
  setCurrentConversation,
} from "@/features/messaging/redux/messagingSlice";
import { useConversations } from "@/hooks/useSupabaseMessaging";
import { EmailComposeSheet } from "@/components/admin/EmailComposeSheet";
import {
  UserIdentity,
  type UserLike,
} from "@/components/user/UserIdentity";
import type { MembershipRole, MembershipRoleOption } from "./types";

/**
 * A member, shaped neutrally so org members, project members, and any future
 * team member can flow in unchanged. `user` is UserIdentity-compatible.
 */
export interface PanelMember {
  /** Membership row id (unique key). */
  id: string;
  /** The user's id — used for self-detection, role/remove ops, messaging. */
  userId: string;
  role: MembershipRole;
  joinedAt: string;
  user?: UserLike;
}

export interface MembersPanelProps {
  members: PanelMember[];
  /** Roles this surface understands, in display order. Drives the role menu. */
  roleOptions: MembershipRoleOption[];
  /** Whether the viewer may manage THIS specific member's role / removal. */
  canManageMember: (member: PanelMember) => boolean;
  /** Whether the viewer may assign `role` to `member` (e.g. only owners grant owner). */
  canAssignRole?: (member: PanelMember, role: MembershipRole) => boolean;
  /** True when removing this member is forbidden (e.g. the last owner). */
  isLastOwner: (member: PanelMember) => boolean;
  onChangeRole: (member: PanelMember, role: MembershipRole) => void | Promise<void>;
  onRemove: (member: PanelMember) => void | Promise<void>;
  /** Disable role/remove controls while a mutation is in flight. */
  operationLoading?: boolean;
  /** Quick direct-message action. Default true. */
  enableMessaging?: boolean;
  /** Quick email action. Default true. */
  enableEmail?: boolean;
  /** Noun used in the remove-confirmation copy ("organization" / "project"). */
  containerNoun?: string;
  /** Optional notice rendered under the list (e.g. personal-org message). */
  footerNotice?: React.ReactNode;
  /** Word used in the count line. Default "member". */
  memberNoun?: string;
}

const ROLE_ICONS: Record<MembershipRole, LucideIcon> = {
  owner: Crown,
  admin: Shield,
  member: UserIcon,
};

const ROLE_BADGE_COLORS: Record<MembershipRole, string> = {
  owner:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  member: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function MembersPanel({
  members,
  roleOptions,
  canManageMember,
  canAssignRole,
  isLastOwner,
  onChangeRole,
  onRemove,
  operationLoading = false,
  enableMessaging = true,
  enableEmail = true,
  containerNoun = "organization",
  footerNotice,
  memberNoun = "member",
}: MembersPanelProps) {
  const currentUser = useAppSelector(selectUser);
  const dispatch = useAppDispatch();
  const [searchTerm, setSearchTerm] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<PanelMember | null>(null);
  const [emailRecipient, setEmailRecipient] = useState<{
    id: string;
    email: string;
    name: string;
  } | null>(null);
  const [messageLoading, setMessageLoading] = useState<string | null>(null);

  const { createConversation } = useConversations(currentUser?.id ?? null);

  const handleSendMessage = async (memberId: string, memberEmail: string) => {
    if (!currentUser?.id || memberId === currentUser.id) return;
    setMessageLoading(memberId);
    try {
      const conversationId = await createConversation(memberId);
      dispatch(openMessaging(conversationId));
      dispatch(setCurrentConversation(conversationId));
      toast.success(`Opening conversation with ${memberEmail}`);
    } catch (err) {
      console.error("Failed to start conversation:", err);
      toast.error("Failed to start conversation");
    } finally {
      setMessageLoading(null);
    }
  };

  const handleConfirmRemove = async () => {
    if (!memberToRemove) return;
    await onRemove(memberToRemove);
    setMemberToRemove(null);
  };

  const filteredMembers = members.filter((member) => {
    const q = searchTerm.toLowerCase();
    return (
      (member.user?.email ?? "").toLowerCase().includes(q) ||
      (member.user?.displayName ?? member.user?.display_name ?? "")
        .toLowerCase()
        .includes(q) ||
      idMatchesQuery(member, q) ||
      (member.userId ?? "").toLowerCase().includes(q)
    );
  });

  const canShowRole = (member: PanelMember, role: MembershipRole) =>
    canAssignRole ? canAssignRole(member, role) : true;

  return (
    <div className="space-y-4">
      {/* Search and count */}
      <div className="flex items-center gap-3">
        {members.length > 3 && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={`Search ${memberNoun}s...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {members.length} {memberNoun}
          {members.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Members List */}
      <div className="space-y-2">
        {filteredMembers.map((member) => {
          const RoleIcon = ROLE_ICONS[member.role];
          const isCurrentUser = member.userId === currentUser?.id;
          const lastOwner = isLastOwner(member);
          const canManageThisMember = canManageMember(member);

          return (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
            >
              {/* Member Info */}
              <UserIdentity
                user={member.user}
                className="flex-1"
                nameSuffix={
                  isCurrentUser ? (
                    <span className="text-xs text-muted-foreground">(You)</span>
                  ) : undefined
                }
                subtitle={
                  <>
                    {member.user?.displayName && member.user?.email
                      ? `${member.user.email} · `
                      : ""}
                    Joined {new Date(member.joinedAt).toLocaleDateString()}
                  </>
                }
              />

              {/* Role Badge and Actions */}
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "flex items-center gap-1",
                    ROLE_BADGE_COLORS[member.role],
                  )}
                >
                  <RoleIcon className="h-3 w-3" />
                  {ROLE_LABELS[member.role]}
                </Badge>

                {/* Quick Actions - Message & Email (not for self) */}
                {!isCurrentUser &&
                  member.user?.email &&
                  (enableMessaging || enableEmail) && (
                    <TooltipProvider delayDuration={300}>
                      <div className="flex items-center gap-1">
                        {enableMessaging && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() =>
                                  handleSendMessage(
                                    member.userId,
                                    member.user?.email ?? "",
                                  )
                                }
                                disabled={messageLoading === member.userId}
                              >
                                {messageLoading === member.userId ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MessageSquare className="h-4 w-4 text-blue-500" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Send message</TooltipContent>
                          </Tooltip>
                        )}

                        {enableEmail && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() =>
                                  setEmailRecipient({
                                    id: member.userId,
                                    email: member.user?.email ?? "",
                                    name:
                                      member.user?.displayName ??
                                      member.user?.email ??
                                      "",
                                  })
                                }
                              >
                                <Mail className="h-4 w-4 text-green-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Send email</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  )}

                {/* Actions Menu */}
                {canManageThisMember && !isCurrentUser && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={operationLoading}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {roleOptions
                        .filter(
                          (opt) =>
                            opt.value !== member.role &&
                            canShowRole(member, opt.value),
                        )
                        .map((opt) => {
                          const OptIcon = ROLE_ICONS[opt.value];
                          return (
                            <DropdownMenuItem
                              key={opt.value}
                              onClick={() => onChangeRole(member, opt.value)}
                            >
                              <OptIcon className="h-4 w-4 mr-2" />
                              {opt.makeLabel ?? `Make ${opt.label}`}
                            </DropdownMenuItem>
                          );
                        })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setMemberToRemove(member)}
                        className="text-red-600 dark:text-red-400"
                        disabled={lastOwner}
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Remove {memberNoun === "member" ? "Member" : memberNoun}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {lastOwner && (
                  <p className="text-xs text-muted-foreground italic px-2">
                    Last owner
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {filteredMembers.length === 0 && searchTerm && (
          <div className="text-center py-8">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">
              No {memberNoun}s found matching &quot;{searchTerm}&quot;
            </p>
          </div>
        )}

        {members.length === 0 && (
          <div className="text-center py-8 border rounded-lg bg-muted/10">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No {memberNoun}s yet. Invite people below to collaborate.
            </p>
          </div>
        )}
      </div>

      {footerNotice}

      {/* Remove Member Confirmation */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={() => setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {memberNoun === "member" ? "Member" : memberNoun}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>
                {memberToRemove?.user?.email ?? `this ${memberNoun}`}
              </strong>{" "}
              from this {containerNoun}? They will lose access to all shared
              resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove {memberNoun === "member" ? "Member" : memberNoun}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Compose Sheet */}
      <EmailComposeSheet
        isOpen={!!emailRecipient}
        onClose={() => setEmailRecipient(null)}
        recipients={emailRecipient ? [emailRecipient] : []}
        title={
          emailRecipient ? `Email ${emailRecipient.name}` : "Compose Email"
        }
      />
    </div>
  );
}
