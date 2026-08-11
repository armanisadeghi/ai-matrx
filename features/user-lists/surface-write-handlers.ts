/**
 * features/user-lists/surface-write-handlers.ts
 *
 * The ONE implementation behind `LIST_SURFACE_WRITE_TARGETS`, shared by both
 * mounts of a user list's editable state:
 *
 *   - `matrx-user/list-manager` — `ListManagerFloatingWorkspace`
 *   - `matrx-user/lists`        — `ListDetailClient` on the `/lists/[id]` route
 *
 * Every handler runs the SAME canonical server action the user's own dialog
 * runs (`updateListAction` for the list, `addItemAction` for items) — never a
 * parallel write path — so an agent write and a human write are the same
 * database operation. Because there is no draft layer, an applied write is a
 * commit; that is why all three targets are `applyPolicy: "ask"`.
 *
 * Every handler VALIDATES and THROWS on a bad shape. The writeback seam
 * (`features/surfaces/runtime/surface-writeback.ts`) converts a throw into the
 * error envelope the agent reads, so a wrong value is the agent's problem to
 * hear about and correct — never something we silently coerce into whatever
 * the user will later find in their list.
 *
 * A NOTE ON JSON, which costs agents real turns: the inline-tool layer parses
 * a JSON-looking argument BEFORE a handler sees it. A string target therefore
 * receives an already-parsed object when the model sends JSON text, and if the
 * error it gets back is vague the model "fixes" it by double-encoding — which
 * lands escaped newlines and stray quotes in the user's data. So the
 * string-shaped throws below say, in the message itself, that the field wants
 * plain text and not JSON.
 *
 * CALLER CONTRACT — `resolveListId` MUST read through a ref, not off a render
 * closure. `applySurfaceWrite` resolves handler closures before the confirm
 * dialog is answered, so a value captured at render time can be stale by the
 * time the user presses Apply.
 */

import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { addItemAction, updateListAction } from "./actions/list-actions";
import { LIST_WRITE_TARGET_NAMES } from "./surface-write-targets";

export interface ListSurfaceWriteOptions {
  /**
   * The list this write lands on, resolved at APPLY time. Throw a message
   * naming what the agent should do instead when no list is active.
   * Must read through a ref — see the caller contract above.
   */
  resolveListId: (targetName: string) => string;
  /**
   * Refresh the read twins after a successful write, so the values the agent
   * sees on its next turn already reflect what it just wrote.
   */
  afterWrite: (listId: string) => void | Promise<void>;
}

/** Shared "this must be plain text" guard for the string-shaped targets. */
function requirePlainString(
  targetName: string,
  value: unknown,
  { allowEmpty }: { allowEmpty: boolean },
): string {
  if (typeof value !== "string") {
    throw new Error(
      `${targetName} expects plain text, not JSON and not JSON-encoded text. ` +
        `Received ${Array.isArray(value) ? "an array" : typeof value}. ` +
        `Send the finished text itself as the value — do not wrap it in an ` +
        `object, quote it, or escape it.`,
    );
  }
  if (!allowEmpty && !value.trim()) {
    throw new Error(
      `${targetName} expects a non-empty string — it cannot be blank.`,
    );
  }
  return value;
}

/**
 * Build the write handlers for one list-editing mount. The returned object's
 * KEYS are exactly the names in `LIST_SURFACE_WRITE_TARGETS`, so a declared
 * target can never be left unwired on a mount that uses this builder.
 */
export function buildListSurfaceWriteHandlers(
  options: ListSurfaceWriteOptions,
): SurfaceWriteHandlers {
  const { resolveListId, afterWrite } = options;

  return {
    [LIST_WRITE_TARGET_NAMES.activeListName]: async (value: unknown) => {
      const name = requirePlainString(
        LIST_WRITE_TARGET_NAMES.activeListName,
        value,
        { allowEmpty: false },
      );
      const listId = resolveListId(LIST_WRITE_TARGET_NAMES.activeListName);
      await updateListAction({ list_id: listId, list_name: name.trim() });
      await afterWrite(listId);
    },

    [LIST_WRITE_TARGET_NAMES.activeListDescription]: async (value: unknown) => {
      const description = requirePlainString(
        LIST_WRITE_TARGET_NAMES.activeListDescription,
        value,
        { allowEmpty: true },
      );
      const listId = resolveListId(
        LIST_WRITE_TARGET_NAMES.activeListDescription,
      );
      await updateListAction({ list_id: listId, description });
      await afterWrite(listId);
    },

    [LIST_WRITE_TARGET_NAMES.addListItems]: async (value: unknown) => {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(
          `${LIST_WRITE_TARGET_NAMES.addListItems} expects a non-empty ARRAY ` +
            `of { label, description?, help_text?, group? } objects. Send the ` +
            `array itself as the value — not a JSON string of it, and not a ` +
            `single object.`,
        );
      }
      const listId = resolveListId(LIST_WRITE_TARGET_NAMES.addListItems);
      const items = value.map((entry, index) => {
        if (
          typeof entry !== "object" ||
          entry === null ||
          Array.isArray(entry)
        ) {
          throw new Error(
            `add_list_items item ${index + 1} must be an object with at least a "label".`,
          );
        }
        const row = entry as Record<string, unknown>;
        // Every optional field must be a string when present — a number or an
        // object here means the agent misread the contract, not that we should
        // stringify something the user will later see as garbage.
        const optional = (key: string): string | undefined => {
          const raw = row[key];
          if (raw === undefined || raw === null || raw === "") return undefined;
          if (typeof raw !== "string") {
            throw new Error(
              `add_list_items item ${index + 1} field "${key}" must be a plain string, not ${
                Array.isArray(raw) ? "an array" : typeof raw
              }.`,
            );
          }
          return raw.trim() || undefined;
        };
        if (typeof row.label !== "string" || !row.label.trim()) {
          throw new Error(
            `add_list_items item ${index + 1} needs a non-empty "label" string.`,
          );
        }
        return {
          label: row.label.trim(),
          description: optional("description"),
          helpText: optional("help_text"),
          groupName: optional("group"),
        };
      });
      for (const item of items) {
        await addItemAction({ listId, ...item });
      }
      await afterWrite(listId);
    },
  };
}
