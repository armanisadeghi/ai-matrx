"use client";

import React, { useState } from "react";
import {
  Crown,
  Shield,
  User as UserIcon,
  MoreVertical,
  Loader2,
  Search,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserAvatarDisplay } from "@/components/user/UserIdentity";
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
import { toast } from "sonner";
import {
  useProjectMembers,
  useProjectMemberOperations,
  useProjectUserRole,
} from "../hooks";
import type { ProjectRole } from "../types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";

interface MemberManagementProps {
  projectId: string;
  userRole: ProjectRole;
  isOwner: boolean;
}

export function MemberManagement({
  projectId,
  userRole,
  isOwner,
}: MemberManagementProps) {
  const currentUser = useAppSelector(selectUser);
  const [searchTerm, setSearchTerm] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  const { members, loading, error, refresh } = useProjectMembers(projectId);
  const {
    updateRole,
    remove,
    loading: operationLoading,
  } = useProjectMemberOperations(projectId);

  const filteredMembers = members.filter(
    (m) =>
      (m.user?.email ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.user?.displayName ?? "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  const handleRoleChange = async (userId: string, newRole: ProjectRole) => {
    const result = await updateRole(userId, newRole);
    if (result.success) {
      toast.success("Member role updated");
    } else {
      toast.error(result.error ?? "Failed to update role");
    }
  };

  const handleRemove = async () => {
    if (!memberToRemove) return;
    const result = await remove(memberToRemove);
    if (result.success) {
      toast.success("Member removed");
      setMemberToRemove(null);
    } else {
      toast.error(result.error ?? "Failed to remove member");
    }
  };

  const getRoleIcon = (role: ProjectRole) => {
    switch (role) {
      case "owner":
        return <Crown className="h-3 w-3 text-yellow-500" />;
      case "admin":
        return <Shield className="h-3 w-3 text-blue-500" />;
      default:
        return <UserIcon className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getRoleBadgeClass = (role: ProjectRole) => {
    switch (role) {
      case "owner":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "admin":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const canManage = userRole === "owner" || userRole === "admin";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 p-4 md:p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Button onClick={refresh} variant="outline" size="sm" className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {members.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      <div className="space-y-2">
        {filteredMembers.map((member) => {
          const isCurrentUser = member.userId === currentUser?.id;
          const isOnlyOwner =
            member.role === "owner" &&
            members.filter((m) => m.role === "owner").length === 1;

          return (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
            >
              <div className="flex items-center gap-3">
                <UserAvatarDisplay
                  user={member.user}
                  size="sm"
                  className="flex-shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {member.user?.displayName ??
                        member.user?.email ??
                        "Unknown"}
                    </span>
                    {isCurrentUser && (
                      <Badge variant="outline" className="text-xs py-0">
                        You
                      </Badge>
                    )}
                    <Badge
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        getRoleBadgeClass(member.role),
                      )}
                    >
                      {getRoleIcon(member.role)}
                      {member.role.charAt(0).toUpperCase() +
                        member.role.slice(1)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {member.user?.email}
                  </p>
                </div>
              </div>

              {canManage && !isCurrentUser && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      disabled={operationLoading}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner && member.role !== "owner" && (
                      <>
                        <DropdownMenuItem
                          onClick={() =>
                            handleRoleChange(member.userId, "admin")
                          }
                        >
                          <Shield className="h-4 w-4 mr-2 text-blue-500" />
                          Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleRoleChange(member.userId, "member")
                          }
                        >
                          <UserIcon className="h-4 w-4 mr-2" />
                          Make Member
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {!isOnlyOwner && (
                      <DropdownMenuItem
                        className="text-red-600 dark:text-red-400"
                        onClick={() => setMemberToRemove(member.userId)}
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Remove
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={() => setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member from the project? They
              will lose access to all project resources.
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
    </div>
  );
}
