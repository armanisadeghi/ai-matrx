"use client";

/**
 * The host half of `@ai-matrx/design-system`'s error slot: every error a
 * package draws (`ErrorBox`, a destructive `Alert`) renders this, so the
 * design-system data table, the organization picker, records-ui refusals,
 * comments, media, meetings, chat and capture errors all carry the Alchemy
 * Menu — the same one the frontend's own errors carry. Mounted once in
 * `AlchemyHost`.
 *
 * When the package passed the sentence, it is used as given; when it did not
 * (a destructive `Alert` whose words are its children), the menu reads the
 * rendered box at the click.
 */
import type { ErrorActionsInput, ErrorCardMenus } from "@ai-matrx/design-system";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { OpenOneMenuButton } from "@ai-matrx/rich-content/rich-document/variants/shared/OpenOneMenuButton";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function renderPackageErrorActions(facts: ErrorActionsInput) {
  const details =
    facts.origin || facts.details
      ? { ...(facts.details ?? {}), ...(facts.origin ? { drawn_by: facts.origin } : {}) }
      : undefined;
  // An ErrorNotice card/line ("inline") carries the small menu on its sentence.
  const inline = facts.source === "inline";
  if (facts.message) {
    return (
      <ErrorAlchemyMenu
        {...(inline ? { size: "xs" as const } : {})}
        input={{
          message: facts.message,
          ...(facts.title ? { title: facts.title } : {}),
          ...(facts.error !== undefined ? { error: facts.error } : {}),
          ...(facts.operation ? { operation: facts.operation } : {}),
          ...(facts.records ? { records: facts.records } : {}),
          ...(facts.unsavedInput !== undefined ? { unsavedInput: facts.unsavedInput } : {}),
          ...(details ? { details } : {}),
          ...(facts.code !== undefined ? { code: facts.code } : {}),
          ...(facts.status !== undefined ? { status: facts.status } : {}),
          ...(facts.calls ? { calls: facts.calls } : {}),
          source: inline ? "inline" : "alert",
        }}
      />
    );
  }
  return (
    <ErrorAlchemyMenu
      {...(facts.operation ? { operation: facts.operation } : {})}
      {...(facts.records ? { records: facts.records } : {})}
      {...(facts.unsavedInput !== undefined ? { unsavedInput: facts.unsavedInput } : {})}
      {...(facts.error !== undefined ? { error: facts.error } : {})}
      {...(details ? { details } : {})}
    />
  );
}

/**
 * The error card's corner menu and right-click menu (`ErrorCardMenusProvider`): the ONE content
 * action registry over the card's sentence, read-only (ALC-15). Mounted in `AlchemyHost`.
 */
export const errorCardMenus: ErrorCardMenus = {
  Button: function ErrorCardMenuButton({ title, text: _text, className }) {
    return <OpenOneMenuButton source={{ type: "raw", title, readOnly: true }} className={className} />;
  },
  Boundary: function ErrorCardMenuBoundary({ title, text, children }) {
    return (
      <NonEditableContextMenu
        sourceFeature="system"
        contentSource={{ type: "raw", title, readOnly: true }}
        contextData={{ content: text }}
      >
        {children}
      </NonEditableContextMenu>
    );
  },
};
