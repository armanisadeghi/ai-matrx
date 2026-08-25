"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2,
  UserPlus,
  CheckCircle,
  XCircle,
  Users,
  MessageSquare,
  Building2,
  Mail,
} from "lucide-react";
import type {
  PermissionLevel,
  ResourceType,
  ShareActionResult,
} from "@/utils/permissions/types";
import { PermissionLevelDescription } from "../PermissionBadge";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/utils/supabase/client";
import {
  useUserConnections,
  type ConnectionUser,
} from "@/features/messaging/hooks/useUserConnections";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  sharingLocation,
  type SharingCopyContext,
} from "@/features/sharing/format";
import { UserSearchField } from "@/features/user-search/UserSearchField";
import type { UserSearchCandidate } from "@/features/user-search/types";

interface ShareWithUserTabProps {
  onShare: (
    userId: string,
    level: PermissionLevel,
  ) => Promise<ShareActionResult>;
  onSuccess: () => void;
  resourceType: ResourceType;
  resourceId: string;
  /** Identity + the page's leading KPIs, mirrored into the failure payload. */
  copy?: SharingCopyContext;
}

type StatusType = "idle" | "loading" | "success" | "error";

interface Status {
  type: StatusType;
  message: string;
}

const SOURCE_ICONS: Record<ConnectionUser["source"], typeof Users> = {
  conversation: MessageSquare,
  organization: Building2,
  invitation: Mail,
};

const SOURCE_LABELS: Record<ConnectionUser["source"], string> = {
  conversation: "Contact",
  organization: "Organization",
  invitation: "Invited",
};

function getInitials(name: string | null, email: string | null): string {
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
 * ShareWithUserTab - Form to share with a specific user.
 * Shows the user's contacts from conversations, organizations, and invitations
 * for quick selection, with a manual email input fallback.
 */
export function ShareWithUserTab({
  onShare,
  onSuccess,
  resourceType,
  resourceId,
  copy,
}: ShareWithUserTabProps) {
  const [email, setEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [permissionLevel, setPermissionLevel] =
    useState<PermissionLevel>("viewer");
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
  const [selectedContact, setSelectedContact] = useState<ConnectionUser | null>(
    null,
  );
  const { toast } = useToast();

  const { connections, isLoading: connectionsLoading } = useUserConnections();

  const filteredConnections = useMemo(() => {
    if (!searchQuery.trim()) return connections;
    const q = searchQuery.toLowerCase();
    return connections.filter(
      (c) =>
        (c.display_name && c.display_name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)),
    );
  }, [connections, searchQuery]);

  const userSearchCandidates: UserSearchCandidate[] = connections.map(
    (connection) => ({
      id: connection.user_id,
      email: connection.email,
      displayName: connection.display_name,
      avatarUrl: connection.avatar_url,
      phone: null,
      adminLevel: null,
      organizations:
        connection.source === "organization" && connection.sourceDetails
          ? [connection.sourceDetails]
          : [],
      source: SOURCE_LABELS[connection.source],
      createdAt: null,
      lastSignInAt: null,
    }),
  );

  const resetStatus = () => {
    setStatus({ type: "idle", message: "" });
  };

  const selectContact = (contact: ConnectionUser) => {
    setSelectedContact(contact);
    setEmail(contact.email || "");
    setSearchQuery("");
    if (status.type === "error") resetStatus();
  };

  const clearContact = () => {
    setSelectedContact(null);
    setEmail("");
  };

  const handleShare = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setStatus({
        type: "error",
        message: "Please enter a valid email address",
      });
      return;
    }

    setStatus({ type: "loading", message: "Looking up user..." });

    try {
      // Resolve userId — use selected contact to skip the lookup RPC when possible
      let targetUserId: string | null = null;

      if (selectedContact && selectedContact.email === trimmedEmail) {
        targetUserId = selectedContact.user_id;
      } else {
        const client = createClient();
        const { data: lookupData, error: lookupError } = await client.rpc(
          "lookup_user_by_email",
          { lookup_email: trimmedEmail },
        );

        if (lookupError) {
          setStatus({
            type: "error",
            message: `Lookup failed: ${lookupError.message}`,
          });
          return;
        }

        const userData = Array.isArray(lookupData) ? lookupData[0] : lookupData;

        if (!userData || !userData.user_id) {
          setStatus({
            type: "error",
            message: `No user found with email "${trimmedEmail}". They may need to create an account first.`,
          });
          return;
        }

        targetUserId = userData.user_id;
      }

      setStatus({ type: "loading", message: "Sharing with user..." });

      // Delegate to the onShare prop — this calls shareWithUser() in the service,
      // which validates ownership via the share_resource_with_user RPC and sends
      // the notification email. Never call the RPC directly from the UI layer.
      const result = await onShare(targetUserId, permissionLevel);
      const errorMsg = result?.error;

      if (!errorMsg) {
        setStatus({
          type: "success",
          message: `Successfully shared with ${trimmedEmail}`,
        });
        setEmail("");
        setSelectedContact(null);
        setPermissionLevel("viewer");

        toast({
          title: "Shared Successfully",
          description: `Access granted to ${trimmedEmail}`,
          duration: 5000,
        });

        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setStatus({ type: "error", message: errorMsg });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setStatus({ type: "error", message: `Unexpected error: ${message}` });
    }
  };

  const isLoading = status.type === "loading";

  return (
    <div className="space-y-2.5 p-3 bg-muted/30 rounded-lg border">
      <div>
        <h3 className="text-sm font-medium mb-1">Share with User</h3>
        <p className="text-xs text-muted-foreground">
          Select a contact or enter an email address
        </p>
      </div>

      {/* STATUS MESSAGE */}
      {status.type !== "idle" && (
        <div
          className={`p-2 rounded-md flex items-start gap-2 text-xs ${
            status.type === "loading"
              ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
              : status.type === "success"
                ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20"
                : "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"
          }`}
        >
          {status.type === "loading" && (
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 mt-0.5" />
          )}
          {status.type === "success" && (
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          )}
          {status.type === "error" && (
            <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{status.message}</span>
          {status.type === "error" && (
            <>
              {/*
               * THE FAILURE IS THE PAYLOAD. "No user found with email X — they
               * may need to create an account first" is exactly the sentence a
               * user hands an agent, and it is only actionable together with
               * the LIVE form state that produced it: the address they typed,
               * the contact they picked, the level they chose. Built inside the
               * click handler so it reads the current inputs, never a stale
               * render.
               */}
              <CopyButtons
                size="xs"
                label="Share failure"
                human={() =>
                  [
                    "Sharing with a user failed.",
                    `Error shown: ${status.message}`,
                    `Email entered: ${email.trim() || "(empty)"}`,
                    `Contact selected: ${
                      selectedContact
                        ? `${selectedContact.display_name ?? selectedContact.email} (${selectedContact.source})`
                        : "none"
                    }`,
                    `Permission level chosen: ${permissionLevel}`,
                    `Resource: ${resourceType}:${resourceId}`,
                  ].join("\n")
                }
                json={() => ({
                  error: status.message,
                  email: email.trim(),
                  selected_contact: selectedContact,
                  permission_level: permissionLevel,
                  resource_type: resourceType,
                  resource_id: resourceId,
                })}
                agent={() => ({
                  kind: "share-with-user-failure",
                  location: sharingLocation(copy?.surface ?? "Share with user"),
                  description:
                    "A share-with-user attempt that failed, with the error sentence on screen and the live form state that produced it.",
                  data: {
                    rendered_error: status.message,
                    form_state: {
                      email_entered: email.trim(),
                      selected_contact: selectedContact,
                      permission_level: permissionLevel,
                      contacts_available: connections.length,
                    },
                    resource: {
                      type: resourceType,
                      id: resourceId,
                      name: copy?.resourceName ?? null,
                    },
                    kpis: copy?.kpis ?? null,
                  },
                  attributes: {
                    ...(copy?.kpis ?? {}),
                    resource_type: resourceType,
                    resource_id: resourceId,
                    state: "error",
                    permission_level: permissionLevel,
                  },
                })}
              />
              <button
                onClick={resetStatus}
                className="text-xs underline hover:no-underline flex-shrink-0"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {/* CONTACTS LIST */}
        {!selectedContact && (
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              Your Contacts
            </Label>
            {connectionsLoading ? (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                Loading contacts...
              </div>
            ) : connections.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                No contacts found. Enter an email below.
              </p>
            ) : (
              <>
                {connections.length > 5 && (
                  <div>
                    <UserSearchField
                      placeholder="Search contacts..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      onUserSelect={(user) => {
                        const contact = connections.find(
                          (candidate) => candidate.user_id === user.id,
                        );
                        if (contact) selectContact(contact);
                      }}
                      candidates={userSearchCandidates}
                      title="Search your contacts"
                      disabled={isLoading}
                      className="w-full"
                      inputClassName="h-8 text-xs"
                    />
                  </div>
                )}
                <ScrollArea className="max-h-36 rounded-md border bg-background">
                  <div className="p-1">
                    {filteredConnections.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        No matching contacts
                      </p>
                    ) : (
                      filteredConnections.map((contact) => {
                        const SourceIcon = SOURCE_ICONS[contact.source];
                        return (
                          <button
                            key={contact.user_id}
                            onClick={() => selectContact(contact)}
                            disabled={isLoading}
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
        )}

        {/* SELECTED CONTACT CHIP */}
        {selectedContact && (
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
              onClick={clearContact}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* MANUAL EMAIL INPUT */}
        {!selectedContact && (
          <div className="space-y-1.5">
            <Label htmlFor="user-email" className="text-xs">
              Or enter email manually
            </Label>
            <UserSearchField
              id="user-email"
              placeholder="user@example.com"
              value={email}
              onValueChange={(value) => {
                setEmail(value);
                if (status.type === "error") resetStatus();
              }}
              onUserSelect={(user) => {
                const contact = connections.find(
                  (candidate) => candidate.user_id === user.id,
                );
                if (contact) selectContact(contact);
              }}
              candidates={userSearchCandidates}
              title="Choose a user to share with"
              inputType="email"
              disabled={isLoading}
              inputClassName="h-9"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="user-permission" className="text-xs">
            Permission Level
          </Label>
          <Select
            value={permissionLevel}
            onValueChange={(value) =>
              setPermissionLevel(value as PermissionLevel)
            }
            disabled={isLoading}
          >
            <SelectTrigger id="user-permission" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <PermissionLevelDescription level={permissionLevel} />
        </div>

        <Button
          onClick={handleShare}
          disabled={isLoading || !email.trim()}
          className="w-full h-9"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {status.message || "Processing..."}
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4 mr-2" />
              Share with User
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
