"use client";

/**
 * InvitationManager — pending project invitations on the Manage page. Matches
 * the polished organization InvitationManager: a labeled invite form, copy-link
 * action, resend/renew, refresh, and a clean empty state. Project data wiring
 * (project invitation hooks) is unchanged.
 */

import React, { useState } from "react";
import { Mail, Send, X, RefreshCw, Loader2, Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  useProjectInvitations,
  useProjectInvitationOperations,
} from "../hooks";
import { validateEmail, getExpiryDisplay, type ProjectRole } from "../types";
import { formatDistanceToNow } from "date-fns";

interface InvitationManagerProps {
  projectId: string;
  projectName: string;
  userRole: ProjectRole;
}

export function InvitationManager({
  projectId,
  projectName,
  userRole,
}: InvitationManagerProps) {
  const [emailInput, setEmailInput] = useState("");
  const [roleInput, setRoleInput] = useState<ProjectRole>("member");
  const [invitationToCancel, setInvitationToCancel] = useState<string | null>(
    null,
  );

  const { invitations, loading, error, refresh } =
    useProjectInvitations(projectId);
  const {
    invite,
    cancel,
    resend,
    loading: operationLoading,
  } = useProjectInvitationOperations(projectId);

  const emailValidation = emailInput
    ? validateEmail(emailInput)
    : { valid: false, error: "" };
  const canSubmit =
    !!emailInput && emailValidation.valid && !operationLoading;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const result = await invite({ email: emailInput, role: roleInput });
    if (result.success) {
      toast.success(`Invitation sent to ${emailInput}`);
      setEmailInput("");
      setRoleInput("member");
      refresh();
    } else {
      toast.error(result.error ?? "Failed to send invitation");
    }
  };

  const handleCancel = async () => {
    if (!invitationToCancel) return;
    const invitation = invitations.find((inv) => inv.id === invitationToCancel);
    const result = await cancel(invitationToCancel);
    if (result.success) {
      toast.success(
        invitation
          ? `Cancelled invitation to ${invitation.email}`
          : "Invitation cancelled",
      );
      setInvitationToCancel(null);
      refresh();
    } else {
      toast.error(result.error ?? "Failed to cancel invitation");
    }
  };

  const handleResend = async (invitationId: string, email: string) => {
    const result = await resend(invitationId);
    if (result.success) {
      toast.success(`Invitation resent to ${email}`);
      refresh();
    } else {
      toast.error(result.error ?? "Failed to resend invitation");
    }
  };

  const canManage = userRole === "owner" || userRole === "admin";

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite form */}
      {canManage && (
        <form onSubmit={handleInvite} className="space-y-2">
          <Label
            htmlFor="project-invite-email"
            className="text-xs font-medium text-muted-foreground"
          >
            Invite to {projectName}
          </Label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                id="project-invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                disabled={operationLoading}
                className={`h-9 ${
                  emailInput && !emailValidation.valid ? "border-red-500" : ""
                }`}
              />
              {emailInput && !emailValidation.valid && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {emailValidation.error}
                </p>
              )}
            </div>
            <Select
              value={roleInput}
              onValueChange={(v) => setRoleInput(v as ProjectRole)}
            >
              <SelectTrigger disabled={operationLoading} className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!canSubmit} size="sm" className="h-9">
              {operationLoading ? (
                <Loader2 className="h-4 w-4 animate-spin sm:mr-1" />
              ) : (
                <Send className="h-4 w-4 sm:mr-1" />
              )}
              <span className="hidden sm:inline">Invite</span>
            </Button>
          </div>
        </form>
      )}

      {/* Pending invitations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {invitations.length} pending{" "}
            {invitations.length === 1 ? "invitation" : "invitations"}
          </span>
          {invitations.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="h-7 px-2"
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading invitations...</span>
          </div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-6 border rounded-lg bg-muted/10">
            <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">
              No pending invitations
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {invitations.map((inv) => {
              const expiresAt = new Date(inv.expiresAt);
              const isExpired = expiresAt <= new Date();
              const invitationLink = `${
                typeof window !== "undefined"
                  ? window.location.origin
                  : "https://www.aimatrx.com"
              }/invitations/project/accept/${inv.token}`;

              const handleCopyLink = async () => {
                try {
                  await navigator.clipboard.writeText(invitationLink);
                  toast.success("Invitation link copied");
                } catch {
                  toast.error("Failed to copy link");
                }
              };

              return (
                <div
                  key={inv.id}
                  className={`flex items-center justify-between p-4 rounded-lg border bg-card ${
                    isExpired ? "opacity-60 border-dashed" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium truncate">{inv.email}</p>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {inv.role}
                      </Badge>
                      {isExpired && (
                        <Badge variant="destructive" className="text-xs">
                          Expired
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {isExpired ? "Expired" : getExpiryDisplay(inv.expiresAt)}
                      </span>
                      <span>
                        Invited{" "}
                        {formatDistanceToNow(new Date(inv.invitedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isExpired && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyLink}
                          title="Copy invitation link"
                        >
                          <Copy className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Copy link</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(inv.id, inv.email)}
                        disabled={operationLoading}
                        title={
                          isExpired
                            ? "Renew and extend expiry"
                            : "Resend and extend expiry"
                        }
                      >
                        <RefreshCw className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">
                          {isExpired ? "Renew" : "Resend"}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInvitationToCancel(inv.id)}
                        disabled={operationLoading}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Cancel invitation"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!invitationToCancel}
        onOpenChange={() => setInvitationToCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the invitation to{" "}
              <strong>
                {invitations.find((inv) => inv.id === invitationToCancel)?.email}
              </strong>
              ? They will no longer be able to accept it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-red-600 hover:bg-red-700"
            >
              Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
