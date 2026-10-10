"use client";

/**
 * Add a website login from anywhere, over the current page: the one canonical Vault create form,
 * opened straight on "Website login" with the site prefilled. Nothing navigates; `onSaved` gets the
 * new item so the caller can carry on with it selected.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@ai-matrx/design-system/controls";
import { VaultCreateDialog } from "./VaultCreateDialog";
import { useVault, useVaultDefinitions } from "../vault-hooks";
import { WEBSITE_LOGIN_DEFINITION_KEY, type VaultItem } from "../types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export function WebsiteLoginCreateDialog({
  open,
  onOpenChange,
  loginUrl,
  displayName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The site the login is for ("https://www.instagram.com/"). */
  loginUrl: string;
  displayName?: string;
  onSaved: (item: VaultItem) => void | Promise<void>;
}) {
  const vault = useVault({ kind: "mine" });
  const { definitions, loading, error } = useVaultDefinitions();
  if (!definitions.some((d) => d.key === WEBSITE_LOGIN_DEFINITION_KEY)) {
    // Never a button that opens nothing: while the form's definition loads (or if it cannot) say so.
    if (!open) return null;
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="matrx-touch-targets max-w-sm">
          <DialogHeader>
            {loading ? (
              <DialogTitle>Opening the login form</DialogTitle>
            ) : (
              <div className="flex items-center gap-2">
                <DialogTitle>Couldn&apos;t open the login form</DialogTitle>
                <ErrorAlchemyMenu input={{ message: error ?? "Website logins are not available on this account." }} />
              </div>
            )}
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {loading ? "One moment." : (error ?? "Website logins are not available on this account.")}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <VaultCreateDialog
      open={open}
      onOpenChange={onOpenChange}
      principal={{ type: "user" }}
      definitions={definitions}
      busy={vault.busy}
      initialDefinitionKey={WEBSITE_LOGIN_DEFINITION_KEY}
      initialLoginUrl={loginUrl}
      initialDisplayName={displayName}
      onCreate={(body, attachments) =>
        attachments?.length
          ? vault.actions.createItemWithAttachments(body, attachments)
          : vault.actions.createItem(body)
      }
      onAssign={vault.actions.assign}
      onSaved={onSaved}
    />
  );
}
