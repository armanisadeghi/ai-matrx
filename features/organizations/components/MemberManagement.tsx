"use client";

import React, { useState } from "react";
import {
  Users,
  Crown,
  Shield,
  User as UserIcon,
  MoreVertical,
  Loader2,
  Search,
  UserX,
  MessageSquare,
  Mail,
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
import {
  useOrganizationMembers,
  useMemberOperations,
  useUserRole,
} from "../hooks";
import type { OrgRole } from "../types";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  openMessaging,
  setCurrentConversation,
} from "@/features/messaging/redux/messagingSlice";
import { useConversations } from "@/hooks/useSupabaseMessaging";
import { EmailComposeSheet } from "@/components/admin/EmailComposeSheet";
import { UserIdentity } from "@/components/user/UserIdentity";

interface MemberManagementProps {
  organizationId: string;
  userRole: OrgRole;
  isOwner: boolean;
  isPersonal: boolean;
}

/**
 * MemberManagement - Component for managing organization members
 *
 * Features:
 * - List all members with roles
 * - Change member roles (admin/owner permissions)
 * - Remove members (with safeguards)
 * - Search members
 * - Cannot remove last owner
 * - Cannot change own role
 */
export function MemberManagement({
  organizationId,
  userRole,
  isOwner,
  isPersonal,
}: MemberManagementProps) {
  const currentUser = useAppSelector(selectUser);
  const dispatch = useAppDispatch();
  const [searchTerm, setSearchTerm] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [emailRecipient, setEmailRecipient] = useState<{
    id: string;
    email: string;
    name: string;
  } | null>(null);
  const [messageLoading, setMessageLoading] = useState<string | null>(null);

  const { members, loading, error, refresh } =
    useOrganizationMembers(organizationId);
  const {
    updateRole,
    remove,
    loading: operationLoading,
  } = useMemberOperations(organizationId);
  const { createConversation } = useConversations(currentUser?.id || null);

  // Handle sending a direct message to a member
  const handleSendMessage = async (memberId: string, memberEmail: string) => {
    if (!currentUser?.id || memberId === currentUser.id) return;

    setMessageLoading(memberId);
    try {
      // Create or get existing conversation with this user
      const conversationId = await createConversation(memberId);

      // Open messaging sheet and select this conversation
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

  // Handle opening email compose for a member
  const handleSendEmail = (member: {
    userId: string;
    email: string;
    displayName?: string;
  }) => {
    setEmailRecipient({
      id: member.userId,
      email: member.email,
      name: member.displayName || member.email,
    });
  };

  // Filter members
  const filteredMembers = members.filter((member) =>
    member.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Count owners
  const ownerCount = members.filter((m) => m.role === "owner").length;

  // Handle role change
  const handleRoleChange = async (
    memberId: string,
    memberEmail: string,
    newRole: OrgRole,
  ) => {
    const result = await updateRole(memberId, newRole);

    if (result.success) {
      toast.success(`Updated ${memberEmail}'s role to ${newRole}`);
      refresh();
    } else {
      toast.error(result.error || "Failed to update role");
    }
  };

  // Handle member removal
  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    const member = members.find((m) => m.userId === memberToRemove);
    if (!member) return;

    const result = await remove(memberToRemove);

    if (result.success) {
      toast.success(`Removed ${member.user?.email} from organization`);
      setMemberToRemove(null);
      refresh();
    } else {
      toast.error(result.error || "Failed to remove member");
    }
  };

  // Get role icon and color
  const getRoleDisplay = (role: OrgRole) => {
    switch (role) {
      case "owner":
        return {
          icon: <Crown className="h-3 w-3" />,
          label: "Owner",
          color:
            "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
        };
      case "admin":
        return {
          icon: <Shield className="h-3 w-3" />,
          label: "Admin",
          color:
            "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
        };
      case "member":
        return {
          icon: <UserIcon className="h-3 w-3" />,
          label: "Member",
          color:
            "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and count */}
      <div className="flex items-center gap-3">
        {members.length > 3 && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {members.length} members
        </span>
      </div>

      {/* Members List */}
      <div className="space-y-2">
        {filteredMembers.map((member) => {
          const roleDisplay = getRoleDisplay(member.role);
          const isCurrentUser = member.userId === currentUser.id;
          const isLastOwner = member.role === "owner" && ownerCount === 1;
          const canManageThisMember =
            isOwner || (userRole === "admin" && member.role === "member");

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
                  className={`flex items-center gap-1 ${roleDisplay.color}`}
                >
                  {roleDisplay.icon}
                  {roleDisplay.label}
                </Badge>

                {/* Quick Actions - Message & Email (not for self) */}
                {!isCurrentUser && member.user?.email && (
                  <TooltipProvider delayDuration={300}>
                    <div className="flex items-center gap-1">
                      {/* Send Message */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              handleSendMessage(
                                member.userId,
                                member.user?.email || "",
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

                      {/* Send Email */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              handleSendEmail({
                                userId: member.userId,
                                email: member.user?.email || "",
                                displayName: member.user?.displayName,
                              })
                            }
                          >
                            <Mail className="h-4 w-4 text-green-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Send email</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                )}

                {/* Actions Menu */}
                {canManageThisMember && !isCurrentUser && !isPersonal && (
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
                      {isOwner && member.role !== "owner" && (
                        <DropdownMenuItem
                          onClick={() =>
                            handleRoleChange(
                              member.userId,
                              member.user?.email || "",
                              "owner",
                            )
                          }
                        >
                          <Crown className="h-4 w-4 mr-2" />
                          Make Owner
                        </DropdownMenuItem>
                      )}
                      {member.role !== "admin" && (
                        <DropdownMenuItem
                          onClick={() =>
                            handleRoleChange(
                              member.userId,
                              member.user?.email || "",
                              "admin",
                            )
                          }
                        >
                          <Shield className="h-4 w-4 mr-2" />
                          Make Admin
                        </DropdownMenuItem>
                      )}
                      {member.role !== "member" && (
                        <DropdownMenuItem
                          onClick={() =>
                            handleRoleChange(
                              member.userId,
                              member.user?.email || "",
                              "member",
                            )
                          }
                        >
                          <UserIcon className="h-4 w-4 mr-2" />
                          Make Member
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setMemberToRemove(member.userId)}
                        className="text-red-600 dark:text-red-400"
                        disabled={isLastOwner}
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Remove Member
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {isLastOwner && (
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
              No members found matching "{searchTerm}"
            </p>
          </div>
        )}
      </div>

      {/* Personal Org Notice */}
      {isPersonal && (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <p className="text-sm text-purple-800 dark:text-purple-200">
            <strong>Personal Organization:</strong> This is your personal space.
            You cannot add or remove members.
          </p>
        </div>
      )}

      {/* Remove Member Confirmation */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={() => setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>
                {members.find((m) => m.userId === memberToRemove)?.user?.email}
              </strong>{" "}
              from this organization? They will lose access to all shared
              resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove Member
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
