/**
 * THE ONE PLACE THE FRONTEND LEARNS GOOGLE WORKSPACE FILE TYPES.
 *
 * THE DEFECT THIS CLOSES (V13-3, second half). The server has declared three
 * file types since `google_workspace/service.py`'s
 * `ResourceType = Literal["google_document", "google_spreadsheet",
 * "google_presentation"]`, `_resource_type_for_mime` maps the Slides MIME type
 * onto the third, `capabilities.py` ships `slides` as an `available` capability
 * whose `eligible_resource_types` is `("google_presentation",)`, and live
 * connection `4a4f4ad5` had already made a successful `slides.read` call with
 * one `google_presentation` row registered. The frontend hand-typed the PAIR in
 * six places, so a deck a person picked in Google Picker was accepted by the
 * attach call and then:
 *   - `features/marketing/google/service.ts`'s `connectionResource` THREW on it,
 *     killing the whole inventory read — every Google account, property, channel
 *     and file vanished from every surface because one deck existed;
 *   - `features/google-workspace/service.ts` answered "unsupported file type";
 *   - the review workspace, the connect body and the chat resource picker
 *     filtered it out of their lists, so the named identity had no door.
 *
 * So the types live HERE, once, with everything a surface needs to render one
 * honestly: the name a person uses, its icon, its door at Google, and — the
 * part that keeps a surface from lying — which reads this client actually has.
 * A deck's `clientRead` is `null` and `writable` is false: there is no Slides
 * reader in this repo (the server's `google_workspace.read_presentation` is an
 * agent tool, not a client endpoint), so a deck's detail says what it can show
 * and offers the door, and NEVER falls through to the Sheets reader — which is
 * exactly what `readSelected`'s `if document … else sheet` would have done.
 *
 * THE GUARD: `features/connectors/__tests__/capability-keys-are-the-servers-keys.test.ts`
 * censuses this record against the server's own `eligible_resource_types` in the
 * sibling aidream checkout and fails on any type the server declares that this
 * client cannot render. Add a type to the server → that test names it.
 */

import {
  FileSpreadsheet,
  FileText,
  Presentation,
  type LucideIcon,
} from "lucide-react";

export interface GoogleWorkspaceFileType {
  /** What a person calls this file. Never the wire token (D6). */
  readonly label: string;
  /** Plural, for a prompt that offers several kinds at once. */
  readonly plural: string;
  readonly icon: LucideIcon;
  /** One accent per type, in both themes. */
  readonly iconClassName: string;
  /** The door at Google when the row carries no stored `web_view_link`. */
  readonly hrefFor: (resourceRef: string) => string;
  /**
   * Which read THIS CLIENT has for the file, or `null` when it has none. A
   * surface switches on this instead of assuming "not a Doc means a Sheet".
   */
  readonly clientRead: "document" | "sheet" | null;
  /** Whether this client can write back to the file. */
  readonly writable: boolean;
  /** Said on the detail when there is no client read — honest, with the door. */
  readonly readOnlyNote: string | null;
}

export const GOOGLE_WORKSPACE_FILE_TYPES = {
  google_document: {
    label: "Google Doc",
    plural: "Docs",
    icon: FileText,
    iconClassName: "text-sky-600 dark:text-sky-400",
    hrefFor: (resourceRef) =>
      `https://docs.google.com/document/d/${encodeURIComponent(resourceRef)}/edit`,
    clientRead: "document",
    writable: true,
    readOnlyNote: null,
  },
  google_spreadsheet: {
    label: "Google Sheet",
    plural: "Sheets",
    icon: FileSpreadsheet,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    hrefFor: (resourceRef) =>
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(resourceRef)}/edit`,
    clientRead: "sheet",
    writable: true,
    readOnlyNote: null,
  },
  google_presentation: {
    label: "Google Slides deck",
    plural: "Slides decks",
    icon: Presentation,
    iconClassName: "text-amber-600 dark:text-amber-400",
    hrefFor: (resourceRef) =>
      `https://docs.google.com/presentation/d/${encodeURIComponent(resourceRef)}/edit`,
    clientRead: null,
    writable: false,
    readOnlyNote:
      "This deck is connected and AI Matrx agents can read it, including its speaker notes. There is no deck viewer on this screen yet, so open it in Google Slides to see the slides themselves.",
  },
} as const satisfies Record<string, GoogleWorkspaceFileType>;

/** Every file type a person can pick through Google Picker, as one union. */
export type GoogleWorkspaceResourceType =
  keyof typeof GOOGLE_WORKSPACE_FILE_TYPES;

export const GOOGLE_WORKSPACE_RESOURCE_TYPES = Object.keys(
  GOOGLE_WORKSPACE_FILE_TYPES,
) as readonly GoogleWorkspaceResourceType[];

export function isGoogleWorkspaceResourceType(
  value: unknown,
): value is GoogleWorkspaceResourceType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(GOOGLE_WORKSPACE_FILE_TYPES, value)
  );
}

export function googleWorkspaceFileType(
  resourceType: GoogleWorkspaceResourceType,
): GoogleWorkspaceFileType {
  return GOOGLE_WORKSPACE_FILE_TYPES[resourceType];
}

/**
 * The prompt on every "pick a file" control, derived so a fourth file type
 * cannot leave three buttons saying "Choose a Doc or Sheet" behind.
 */
export function googleWorkspacePickLabel(): string {
  const plurals = GOOGLE_WORKSPACE_RESOURCE_TYPES.map(
    (type) => GOOGLE_WORKSPACE_FILE_TYPES[type].plural,
  );
  const last = plurals[plurals.length - 1]!;
  return plurals.length === 1
    ? `Choose ${last}`
    : `Choose ${plurals.slice(0, -1).join(", ")} or ${last}`;
}
