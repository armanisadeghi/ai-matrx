"use client";

/**
 * VaultContextMenu — the ONE right-click menu for the credential vault.
 *
 * 🚨 THE VAULT MENU NEVER CARRIES A SECRET. This is the single surface on the
 * context-menu rollout where a wrong `content` is a credential leak, so the
 * payload is built HERE, by hand, from non-secret item metadata only — and the
 * menu is given `getApplicationScope`, which WINS OUTRIGHT over the shell's
 * DOM-text fallback (`value-resolution.ts`). That matters because a revealed
 * `SecretValue` puts plaintext in the DOM: had this been wired the ordinary way
 * (let the menu self-resolve content from the subtree), right-clicking a
 * revealed credential would have handed the value to Copy, Export and every AI
 * action on the menu.
 *
 * Concretely, and deliberately:
 *   • `content` is names + type + provider + host + status + FIELD KEYS. Never
 *     a field value, never `notes`, never a non-secret custom field's value —
 *     a user can and does paste a secret into a free-text box.
 *   • `selection` is forced empty. The user's own highlight is DOM text, and on
 *     this surface DOM text can be a revealed credential.
 *   • no `entity` is passed, so Attach To and Share stay hidden. A credential
 *     is not agent context and has no share door; hiding them is the answer,
 *     not a disabled row.
 *
 * Surface: `matrx-user/vault`, whose manifest is deliberately narrow for the
 * same reason (count / labels / providers only) — the three values it declares
 * `alwaysAvailable` are exactly what this scope emits.
 *
 * Mounted by `VaultWorkspace`, so BOTH the `/vault` page and the floating Vault
 * window get it from one wiring — and the window therefore mounts its own menu
 * instead of being answered by the page underneath it.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { KeyRound, PanelRightOpen, Type } from "lucide-react";

import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type {
  ContextMenuExtraSection,
  ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { toast } from "@/lib/toast";

import { credentialIdentity } from "../credential-identity";
import type { CredentialDefinition, VaultItem } from "../types";

/** Row anchor the delegated menu resolves the clicked credential from. */
export const VAULT_ITEM_ATTR = "data-vault-item-id";

export const VAULT_SURFACE_NAME = "matrx-user/vault";

/**
 * Everything the menu is allowed to know about one credential. Building this
 * is the whole security boundary — add a field here only after asking whether
 * a user could have typed a secret into it.
 */
function itemLines(
  item: VaultItem,
  definition: CredentialDefinition | undefined,
): string[] {
  const identity = credentialIdentity(item, definition);
  const hosts = item.login_urls
    .map((url) => {
      try {
        return new URL(url).host;
      } catch {
        return null;
      }
    })
    .filter((h): h is string => Boolean(h));
  return [
    `Name: ${item.display_name}`,
    ...(identity.kindLabel ? [`Type: ${identity.kindLabel}`] : []),
    ...(item.provider_key ? [`Provider: ${item.provider_key}`] : []),
    ...(hosts.length ? [`Sites: ${hosts.join(", ")}`] : []),
    `Status: ${item.status}`,
    `Access: ${item.access_mode}`,
    ...(item.tags.length ? [`Tags: ${item.tags.join(", ")}`] : []),
    // KEYS only. A field's value is the secret.
    ...(item.fields.length
      ? [`Fields: ${item.fields.map((f) => f.field_key).join(", ")}`]
      : []),
  ];
}

export interface VaultContextMenuProps {
  items: VaultItem[];
  definitionsByKey: Map<string, CredentialDefinition>;
  /** Open a credential's detail — the row menu's door (no dead ends). */
  onOpenItem: (id: string) => void;
  children: ReactNode;
}

export function VaultContextMenu({
  items,
  definitionsByKey,
  onOpenItem,
  children,
}: VaultContextMenuProps) {
  // The right-clicked credential. STATE, not a ref, so the extra items label
  // and disable themselves correctly — `resolveContextOnOpen` fires before
  // `MenuContent` mounts, so this re-render lands in time (the same contract
  // `ItemContextMenu` relies on).
  const [clickedId, setClickedId] = useState<string | null>(null);
  const clicked = clickedId
    ? (items.find((i) => i.id === clickedId) ?? null)
    : null;

  const providers = [
    ...new Set(items.map((i) => i.provider_key).filter((p): p is string => !!p)),
  ];

  const inventoryLines = (): string[] => [
    `Vault — ${items.length} credential${items.length === 1 ? "" : "s"}`,
    ...items.map((i) => {
      const id = credentialIdentity(i, definitionsByKey.get(i.definition_key));
      return `• ${i.display_name}${id.kindLabel ? ` — ${id.kindLabel}` : ""}`;
    }),
  ];

  /**
   * The complete scope. Live builder ON PURPOSE: it is the branch of
   * `resolveApplicationScope` that ignores the DOM-text fallback entirely.
   */
  const getApplicationScope = (): ApplicationScope => ({
    content: (clicked
      ? itemLines(clicked, definitionsByKey.get(clicked.definition_key))
      : inventoryLines()
    ).join("\n"),
    // Forced empty — see the file header. Never the user's DOM selection here.
    selection: "",
    text_before: "",
    text_after: "",
    context: {
      surface: "credential vault",
      viewing: clicked ? clicked.display_name : "the credential list",
    },
    // The three values `vault.manifest.ts` declares alwaysAvailable.
    credential_count: items.length,
    credential_labels: items.map((i) => i.display_name),
    credential_providers: providers,
  });

  const section: ContextMenuExtraSection = {
    id: "vault",
    label: "Credential",
    icon: KeyRound,
    items: [
      {
        kind: "item",
        id: "vault-open",
        label: clicked ? `Open "${clicked.display_name}"` : "Open credential",
        icon: PanelRightOpen,
        description: clicked
          ? undefined
          : "Right-click a credential to open it",
        disabled: !clicked,
        onSelect: () => {
          if (clicked) onOpenItem(clicked.id);
        },
      },
      {
        kind: "item",
        id: "vault-copy-name",
        label: "Copy name",
        icon: Type,
        description: clicked
          ? "The credential's name — never its value"
          : "Right-click a credential first",
        disabled: !clicked,
        onSelect: () => {
          if (!clicked) return;
          void copyToClipboard(clicked.display_name, {
            formatJson: false,
            onSuccess: () => toast.success("Name copied"),
            onError: () => toast.error("Could not copy the name"),
          });
        },
      },
    ],
  };

  return (
    <NonEditableContextMenu
      sourceFeature="system"
      surfaceName={VAULT_SURFACE_NAME}
      contentSource={{ type: "raw" }}
      // No `entity` — and no per-row entity either. See the file header.
      getApplicationScope={getApplicationScope}
      resolveContextOnOpen={(target): ResolvedContextMenuContext | null => {
        const id = target
          ?.closest<HTMLElement>(`[${VAULT_ITEM_ATTR}]`)
          ?.getAttribute(VAULT_ITEM_ATTR);
        setClickedId(id ?? null);
        // Values come from `getApplicationScope`, which reads the state this
        // just set. Returning null keeps the reserved entity key absent so the
        // (deliberately unset) entity prop stands.
        return null;
      }}
      extraSections={[section]}
    >
      {children}
    </NonEditableContextMenu>
  );
}
