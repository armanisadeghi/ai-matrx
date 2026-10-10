"use client";

/**
 * Add a website login from anywhere, over the current page: the one canonical Vault create form,
 * opened straight on "Website login" with the site prefilled. Nothing navigates; `onSaved` gets the
 * new item so the caller can carry on with it selected.
 */

import { VaultCreateDialog } from "./VaultCreateDialog";
import { useVault, useVaultDefinitions } from "../vault-hooks";
import { WEBSITE_LOGIN_DEFINITION_KEY, type VaultItem } from "../types";

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
  const { definitions } = useVaultDefinitions();
  if (!definitions.some((d) => d.key === WEBSITE_LOGIN_DEFINITION_KEY)) return null;
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
