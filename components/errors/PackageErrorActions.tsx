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
import type { ErrorActionsInput } from "@ai-matrx/design-system";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function renderPackageErrorActions(facts: ErrorActionsInput) {
  const details = facts.origin ? { drawn_by: facts.origin } : undefined;
  if (facts.message) {
    return (
      <ErrorAlchemyMenu
        className="ml-auto align-middle"
        input={{
          message: facts.message,
          ...(facts.title ? { title: facts.title } : {}),
          ...(facts.error !== undefined ? { error: facts.error } : {}),
          ...(facts.operation ? { operation: facts.operation } : {}),
          ...(facts.records ? { records: facts.records } : {}),
          ...(facts.unsavedInput !== undefined ? { unsavedInput: facts.unsavedInput } : {}),
          ...(details ? { details } : {}),
          source: "alert",
        }}
      />
    );
  }
  return (
    <ErrorAlchemyMenu
      className="ml-auto align-middle"
      {...(facts.operation ? { operation: facts.operation } : {})}
      {...(facts.records ? { records: facts.records } : {})}
      {...(facts.unsavedInput !== undefined ? { unsavedInput: facts.unsavedInput } : {})}
      {...(facts.error !== undefined ? { error: facts.error } : {})}
      {...(details ? { details } : {})}
    />
  );
}
