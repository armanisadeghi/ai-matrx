"use client";

import React, { useState, useMemo } from "react";
import {
  Mail,
  Send,
  X,
  RefreshCw,
  Loader2,
  Clock,
  Copy,
  Search,
  Users,
  MessageSquare,
  Building2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useOrganizationInvitations, useInvitationOperations } from "../hooks";
import { validateEmail, type OrgRole } from "../types";
import { formatDistanceToNow } from "date-fns";
import {
  useUserConnections,
  type ConnectionUser,
} from "@/features/messaging/hooks/useUserConnections";

const SOURCE_ICONS: Record<ConnectionUser["source"], typeof Users> = {
  conversation: MessageSquare,
  organization: Building2,
  invitation: Mail,
};

const SOURCE_LABELS: Record<ConnectionUser["source"], string> = {
  conversation: "Contact",
  organization: "Org member",
  invitation: "Invited",
};

function getInitials(name: string | null, email: string | null): string {
  if (name)
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  if (email) return email[0].toUpperCase();
  return "?";
}

interface InvitationManagerProps {
  organizationId: string;
  organizationName: string;
  userRole: OrgRole;
}

/**
 * InvitationManager - Component for managing organization invitations
 *
 * Features:
 * - Send new invitations
 * - List pending invitations
 * - Resend invitations
 * - Cancel invitations
 * - Email validation
 * - Expiry countdown
 */
export function InvitationManager({
  organizationId,
  organizationName,
  userRole,
}: InvitationManagerProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [invitationToCancel, setInvitationToCancel] = useState<string | null>(
    null,
  );
  const [selectedContact, setSelectedContact] = useState<ConnectionUser | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");

  const { invitations, loading, error, refresh } =
    useOrganizationInvitations(organizationId);
  const {
    invite,
    cancel,
    resend,
    loading: operationLoading,
  } = useInvitationOperations(organizationId);
  const { connections, isLoading: connectionsLoading } = useUserConnections();

  // Filter out already-invited emails from the contact list
  const invitedEmails = useMemo(
    () => new Set(invitations.map((inv) => inv.email.toLowerCase())),
    [invitations],
  );

  const filteredConnections = useMemo(() => {
    const available = connections.filter(
      (c) => !c.email || !invitedEmails.has(c.email.toLowerCase()),
    );
    if (!searchQuery.trim()) return available;
    const q = searchQuery.toLowerCase();
    return available.filter(
      (c) =>
        (c.display_name && c.display_name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)),
    );
  }, [connections, searchQuery, invitedEmails]);

  const selectContact = (contact: ConnectionUser) => {
    setSelectedContact(contact);
    setEmail(contact.email || "");
    setSearchQuery("");
  };

  const clearContact = () => {
    setSelectedContact(null);
    setEmail("");
  };

  // Email validation
  const emailValidation = email
    ? validateEmail(email)
    : { valid: false, error: "" };
  const canSubmit = email && emailValidation.valid && !operationLoading;

  // Handle send invitation
  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) return;

    const result = await invite({ email, role });

    if (result.success) {
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      setRole("member");
      setSelectedContact(null);
      refresh();
    } else {
      toast.error(result.error || "Failed to send invitation");
    }
  };

  // Handle cancel invitation
  const handleCancelInvitation = async () => {
    if (!invitationToCancel) return;

    const invitation = invitations.find((inv) => inv.id === invitationToCancel);
    if (!invitation) return;

    const result = await cancel(invitationToCancel);

    if (result.success) {
      toast.success(`Cancelled invitation to ${invitation.email}`);
      setInvitationToCancel(null);
      refresh();
    } else {
      toast.error(result.error || "Failed to cancel invitation");
    }
  };

  // Handle resend invitation
  const handleResendInvitation = async (
    invitationId: string,
    invitationEmail: string,
  ) => {
    const result = await resend(invitationId);

    if (result.success) {
      toast.success(`Resent invitation to ${invitationEmail}`);
      refresh();
    } else {
      toast.error(result.error || "Failed to resend invitation");
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
    <div className="space-y-6">
      {/* Send Invitation Form */}
      <form onSubmit={handleSendInvitation} className="space-y-3">
        {/* Contact picker */}
        {!selectedContact ? (
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-3 h-3" />
              Quick select from contacts
            </Label>
            {connectionsLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading contacts...
              </div>
            ) : connections.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">
                No contacts found — enter an email below.
              </p>
            ) : (
              <>
                {connections.length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search contacts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={operationLoading}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                )}
                <ScrollArea className="max-h-36 rounded-md border bg-background">
                  <div className="p-1">
                    {filteredConnections.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        {searchQuery
                          ? "No matching contacts"
                          : "All contacts already invited"}
                      </p>
                    ) : (
                      filteredConnections.map((contact) => {
                        const SourceIcon = SOURCE_ICONS[contact.source];
                        return (
                          <button
                            key={contact.user_id}
                            type="button"
                            onClick={() => selectContact(contact)}
                            disabled={operationLoading}
                            className="w-full flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
                          >
                            <Avatar className="w-6 h-6 flex-shrink-0">
                              <AvatarImage
                                src={contact.avatar_url || undefined}
                              />
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {getInitials(
                                  contact.display_name,
                                  contact.email,
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                {contact.display_name ||
                                  contact.email ||
                                  "Unknown"}
                              </p>
                              {contact.display_name && contact.email && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {contact.email}
                                </p>
                              )}
                            </div>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
                              <SourceIcon className="w-3 h-3" />
                              {SOURCE_LABELS[contact.source]}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        ) : (
          /* Selected contact chip */
          <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
            <Avatar className="w-6 h-6 flex-shrink-0">
              <AvatarImage src={selectedContact.avatar_url || undefined} />
              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                {getInitials(
                  selectedContact.display_name,
                  selectedContact.email,
                )}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">
                {selectedContact.display_name || selectedContact.email}
              </p>
              {selectedContact.display_name && selectedContact.email && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {selectedContact.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={clearContact}
              disabled={operationLoading}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Email Input — shown always, pre-filled when contact selected */}
          <div className="flex-1">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (
                  selectedContact &&
                  e.target.value !== selectedContact.email
                ) {
                  setSelectedContact(null);
                }
              }}
              placeholder={selectedContact ? "" : "Or enter email manually"}
              disabled={operationLoading}
              className={`h-9 ${email && !emailValidation.valid ? "border-red-500" : ""}`}
            />
            {email && !emailValidation.valid && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {emailValidation.error}
              </p>
            )}
          </div>

          {/* Role Select */}
          <Select
            value={role}
            onValueChange={(value) => setRole(value as OrgRole)}
          >
            <SelectTrigger disabled={operationLoading} className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              {userRole === "owner" && (
                <SelectItem value="owner">Owner</SelectItem>
              )}
            </SelectContent>
          </Select>

          <Button
            type="submit"
            disabled={!canSubmit}
            size="sm"
            className="bg-blue-500 hover:bg-blue-600 h-9"
          >
            <Send className="h-4 w-4 mr-1" />
            Invite
          </Button>
        </div>
      </form>

      {/* Invitations List */}
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
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {invitations.length === 0 ? (
          <div className="text-center py-6 border rounded-lg bg-muted/10">
            <p className="text-sm text-muted-foreground">
              No pending invitations
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {invitations.map((invitation) => {
              const expiresAt = new Date(invitation.expiresAt);
              const isExpired = expiresAt < new Date();
              const timeToExpiry = isExpired
                ? "Expired"
                : `Expires ${formatDistanceToNow(expiresAt, { addSuffix: true })}`;

              const invitationLink = `${typeof window !== "undefined" ? window.location.origin : "https://www.aimatrx.com"}/invitations/organization/accept/${invitation.token}`;

              const handleCopyLink = async () => {
                try {
                  await navigator.clipboard.writeText(invitationLink);
                  toast.success("Invitation link copied to clipboard");
                } catch (err) {
                  toast.error("Failed to copy link");
                }
              };

              return (
                <div
                  key={invitation.id}
                  className={`flex items-center justify-between p-4 rounded-lg border bg-card ${
                    isExpired ? "opacity-60 border-dashed" : ""
                  }`}
                >
                  {/* Invitation Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium truncate">{invitation.email}</p>
                      <Badge variant="secondary" className="text-xs">
                        {invitation.role}
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
                        {timeToExpiry}
                      </span>
                      <span>
                        Invited{" "}
                        {formatDistanceToNow(new Date(invitation.invitedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {!isExpired && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyLink}
                        title="Copy invitation link"
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy Link
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        handleResendInvitation(invitation.id, invitation.email)
                      }
                      disabled={operationLoading}
                      title={
                        isExpired
                          ? "Renew and extend expiry"
                          : "Resend and extend expiry"
                      }
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      {isExpired ? "Renew" : "Resend"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInvitationToCancel(invitation.id)}
                      disabled={operationLoading}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Cancel invitation"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel Invitation Confirmation */}
      <AlertDialog
        open={!!invitationToCancel}
        onOpenChange={() => setInvitationToCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the invitation to{" "}
              <strong>
                {
                  invitations.find((inv) => inv.id === invitationToCancel)
                    ?.email
                }
              </strong>
              ? They will no longer be able to accept this invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, Keep It</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelInvitation}
              className="bg-red-600 hover:bg-red-700"
            >
              Yes, Cancel Invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
