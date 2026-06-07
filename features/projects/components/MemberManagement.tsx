"use client";

/**
 * MemberManagement — the project members list on the Manage page. Matches the
 * polished organization MemberManagement: UserIdentity rows, hover-tooltip quick
 * actions (direct message + email), a clean role menu, and a real empty state.
 * Project data wiring (project member hooks) is unchanged.
 */

import React, { useState } from "react";
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
import { UserIdentity } from "@/components/user/UserIdentity";
import { EmailComposeSheet } from "@/components/admin/EmailComposeSheet";
import { toast } from "sonner";
import {
  useProjectMembers,
  useProjectMemberOperations,
} from "../hooks";
import type { ProjectRole } from "../types";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  openMessaging,
  setCurrentConversation,
} from "@/features/messaging/redux/messagingSlice";
import { useConversations } from "@/hooks/useSupabaseMessaging";
import { cn } from "@/lib/utils";

interface MemberManagementProps {
  projectId: string;
  userRole: ProjectRole;
  isOwner: boolean;
}

function getRoleDisplay(role: ProjectRole) {
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
    default:
      return {
        icon: <UserIcon className="h-3 w-3" />,
        label: "Member",
        color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      };
  }
}

export function MemberManagement({
  projectId,
  userRole,
  isOwner,
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

  const { members, loading, error, refresh } = useProjectMembers(projectId);
  const {
    updateRole,
    remove,
    loading: operationLoading,
  } = useProjectMemberOperations(projectId);
  const { createConversation } = useConversations(currentUser?.id ?? null);

  const filteredMembers = members.filter(
    (m) =>
      (m.user?.email ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.user?.displayName ?? "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  const ownerCount = members.filter((m) => m.role === "owner").length;

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

  const handleRoleChange = async (userId: string, newRole: ProjectRole) => {
    const result = await updateRole(userId, newRole);
    if (result.success) {
      toast.success("Member role updated");
      refresh();
    } else {
      toast.error(result.error ?? "Failed to update role");
    }
  };

  const handleRemove = async () => {
    if (!memberToRemove) return;
    const member = members.find((m) => m.userId === memberToRemove);
    const result = await remove(memberToRemove);
    if (result.success) {
      toast.success(
        member?.user?.email
          ? `Removed ${member.user.email} from project`
          : "Member removed",
      );
      setMemberToRemove(null);
      refresh();
    } else {
      toast.error(result.error ?? "Failed to remove member");
    }
  };

  const canManage = userRole === "owner" || userRole === "admin";

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
        <Button onClick={refresh} variant="outline" size="sm" className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and count */}
      <div className="flex items-center gap-3">
        {members.length > 3 && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
          {members.length} member{members.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Members list */}
      <div className="space-y-2">
        {filteredMembers.map((member) => {
          const roleDisplay = getRoleDisplay(member.role);
          const isCurrentUser = member.userId === currentUser?.id;
          const isLastOwner = member.role === "owner" && ownerCount === 1;
          const canManageThisMember =
            isOwner || (userRole === "admin" && member.role === "member");

          return (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
            >
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

              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "flex items-center gap-1",
                    roleDisplay.color,
                  )}
                >
                  {roleDisplay.icon}
                  {roleDisplay.label}
                </Badge>

                {/* Quick actions — message & email (not for self) */}
                {!isCurrentUser && member.user?.email && (
                  <TooltipProvider delayDuration={300}>
                    <div className="flex items-center gap-1">
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
                    </div>
                  </TooltipProvider>
                )}

                {/* Role / remove menu */}
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
                      {isOwner && member.role !== "admin" && (
                        <DropdownMenuItem
                          onClick={() =>
                            handleRoleChange(member.userId, "admin")
                          }
                        >
                          <Shield className="h-4 w-4 mr-2 text-blue-500" />
                          Make admin
                        </DropdownMenuItem>
                      )}
                      {isOwner && member.role !== "member" && (
                        <DropdownMenuItem
                          onClick={() =>
                            handleRoleChange(member.userId, "member")
                          }
                        >
                          <UserIcon className="h-4 w-4 mr-2" />
                          Make member
                        </DropdownMenuItem>
                      )}
                      {isOwner && member.role !== "owner" && (
                        <DropdownMenuSeparator />
                      )}
                      <DropdownMenuItem
                        onClick={() => setMemberToRemove(member.userId)}
                        className="text-red-600 dark:text-red-400"
                        disabled={isLastOwner}
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Remove
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
            <Search className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No members found matching &quot;{searchTerm}&quot;
            </p>
          </div>
        )}

        {members.length === 0 && (
          <div className="text-center py-8 border rounded-lg bg-muted/10">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No members yet. Invite people below to collaborate.
            </p>
          </div>
        )}
      </div>

      {/* Remove confirmation */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={() => setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>
                {members.find((m) => m.userId === memberToRemove)?.user?.email ??
                  "this member"}
              </strong>{" "}
              from the project? They will lose access to all project resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email compose sheet */}
      <EmailComposeSheet
        isOpen={!!emailRecipient}
        onClose={() => setEmailRecipient(null)}
        recipients={emailRecipient ? [emailRecipient] : []}
        title={emailRecipient ? `Email ${emailRecipient.name}` : "Compose email"}
      />
    </div>
  );
}
