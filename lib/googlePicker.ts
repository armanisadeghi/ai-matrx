/**
 * Canonical typed Google Picker loader.
 *
 * Two deliberate modes share this one implementation:
 * - Workspace mode selects one file for live Google operations. WHICH file
 *   types it offers, what its title says, and what it refuses after the fact
 *   all derive from the ONE file-type record
 *   (`features/google-workspace/resource-types.ts`) — never a list written out
 *   here. The pair used to be hardcoded in this file, so when the buttons began
 *   offering "Docs, Sheets or Slides decks" the Picker still filtered decks out
 *   and a person following the label could not do what it promised.
 * - Drive-import mode selects one or more non-folder files whose bytes will be
 *   copied into Matrx Files.
 *
 * Both stay inside the per-file `drive.file` permission. No mode lists Drive
 * through our own API or broadens OAuth scope.
 */

import {
  GOOGLE_WORKSPACE_MIME_TYPES,
  googleWorkspaceFileTypesPhrase,
  googleWorkspacePickTitle,
  googleWorkspaceTypeForMime,
  type GoogleWorkspaceResourceType,
} from "@/features/google-workspace/resource-types";

import {
  GOOGLE_IDENTITY_POLL_INTERVAL_MS,
  GOOGLE_IDENTITY_READY_TIMEOUT_MS,
  GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
} from "@/providers/google-provider/googleIdentityReadiness";

const PICKER_SCRIPT = "https://apis.google.com/js/api.js";

interface GooglePickerView {
  setIncludeFolders(value: boolean): GooglePickerView;
  setMimeTypes(value: string): GooglePickerView;
  setMode(value: string): GooglePickerView;
  setQuery(value: string): GooglePickerView;
  setSelectFolderEnabled(value: boolean): GooglePickerView;
}

interface GooglePickerInstance {
  setVisible(value: boolean): void;
}

interface GooglePickerBuilder {
  addView(view: GooglePickerView): GooglePickerBuilder;
  build(): GooglePickerInstance;
  enableFeature(value: string): GooglePickerBuilder;
  setAppId(value: string): GooglePickerBuilder;
  setCallback(callback: (data: unknown) => void): GooglePickerBuilder;
  setDeveloperKey(value: string): GooglePickerBuilder;
  setOAuthToken(value: string): GooglePickerBuilder;
  setOrigin(value: string): GooglePickerBuilder;
  setTitle(value: string): GooglePickerBuilder;
}

export interface GooglePickerNamespace {
  DocsView: new (viewId: string) => GooglePickerView;
  PickerBuilder: new () => GooglePickerBuilder;
  DocsViewMode: { LIST: string };
  Feature: { MULTISELECT_ENABLED: string };
  ViewId: { DOCS: string };
}

export interface GooglePlatformApi {
  load(
    name: string,
    config: {
      callback: () => void;
      onerror: () => void;
      timeout: number;
      ontimeout: () => void;
    },
  ): void;
}

export interface PickedGoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string | null;
}

export interface PickedGoogleFile extends PickedGoogleDriveFile {
  /** Which file type the person actually chose, resolved from its MIME type. */
  resourceType: GoogleWorkspaceResourceType;
}

export interface GooglePickerOptions {
  initialQuery?: string;
}

/**
 * 🚨 BOUNDED, like the Identity Services wait (V-24 NEW-4, lane F-111).
 *
 * The old version had two ways to hang forever: a script served but stripped
 * of its body never fires `error` and never defines `window.gapi`, and reusing
 * an `existing` tag that had ALREADY loaded waited on a `load` event that was
 * never coming again. Both left the caller's promise pending for the life of
 * the tab. The bound is the same technical readiness limit as the Identity
 * script's — a constant, not an organization knob — and its rejection is a
 * sentence a caller can show.
 */
function loadScript(): Promise<void> {
  if (window.gapi) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${PICKER_SCRIPT}"]`,
  );
  return new Promise((resolve, reject) => {
    let settled = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + GOOGLE_IDENTITY_READY_TIMEOUT_MS;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (poll !== undefined) clearTimeout(poll);
      if (error) reject(error);
      else resolve();
    };

    const check = () => {
      if (settled) return;
      if (window.gapi) {
        finish();
        return;
      }
      if (Date.now() >= deadline) {
        finish(new Error(GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE));
        return;
      }
      poll = setTimeout(check, GOOGLE_IDENTITY_POLL_INTERVAL_MS);
    };

    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => check(), { once: true });
    script.addEventListener(
      "error",
      () => finish(new Error(GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE)),
      { once: true },
    );
    if (!existing) {
      script.src = PICKER_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
    // An `existing` tag that already finished loading will never fire another
    // event; polling under the bound is what notices that, and what notices a
    // tag that loaded but defined nothing.
    check();
  });
}

async function loadPickerNamespace(): Promise<GooglePickerNamespace> {
  await loadScript();
  const gapi = window.gapi;
  if (!gapi) throw new Error("Google Picker loader is unavailable.");
  await new Promise<void>((resolve, reject) => {
    gapi.load("picker", {
      callback: resolve,
      onerror: () => reject(new Error("Google Picker failed to initialize.")),
      timeout: 10_000,
      ontimeout: () =>
        reject(new Error("Google Picker timed out while loading.")),
    });
  });
  const picker = window.google?.picker;
  if (!picker) throw new Error("Google Picker initialized without its API.");
  return picker;
}

function textField(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePickedFiles(
  data: unknown,
): PickedGoogleDriveFile[] | null | undefined {
  if (!isRecord(data)) return undefined;
  const record = data;
  const action = textField(record, "action");
  if (action === "cancel") return null;
  if (action !== "picked" || !Array.isArray(record.docs)) return undefined;
  const picked: PickedGoogleDriveFile[] = [];
  for (const candidate of record.docs) {
    if (!isRecord(candidate)) continue;
    const id = textField(candidate, "id");
    const name = textField(candidate, "name");
    const mimeType = textField(candidate, "mimeType");
    if (!id || !name || !mimeType) continue;
    picked.push({ id, name, mimeType, url: textField(candidate, "url") });
  }
  return picked.length > 0 ? picked : undefined;
}

function projectNumber(clientId: string): string {
  const match = /^(\d+)-/.exec(clientId);
  if (!match?.[1]) {
    throw new Error("The Google OAuth client ID has no Cloud project number.");
  }
  return match[1];
}

export async function pickGoogleWorkspaceFile(
  accessToken: string,
  options: GooglePickerOptions = {},
): Promise<PickedGoogleFile | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) {
    throw new Error("Google Picker is not configured on this deployment.");
  }
  const picker = await loadPickerNamespace();
  const view = new picker.DocsView(picker.ViewId.DOCS)
    .setIncludeFolders(false)
    .setSelectFolderEnabled(false)
    .setMode(picker.DocsViewMode.LIST)
    .setMimeTypes(GOOGLE_WORKSPACE_MIME_TYPES.join(","));
  const initialQuery = options.initialQuery?.trim();
  if (initialQuery) view.setQuery(initialQuery);

  return new Promise<PickedGoogleFile | null>((resolve, reject) => {
    const instance = new picker.PickerBuilder()
      .setAppId(projectNumber(clientId))
      .setDeveloperKey(apiKey)
      .setOAuthToken(accessToken)
      .setOrigin(window.location.origin)
      .setTitle(googleWorkspacePickTitle())
      .addView(view)
      .setCallback((data) => {
        try {
          const result = parsePickedFiles(data);
          if (result === null) {
            resolve(null);
            return;
          }
          const first = result?.[0];
          if (!first) return;
          const resourceType = googleWorkspaceTypeForMime(first.mimeType);
          if (!resourceType) {
            throw new Error(
              `Choose one of your Google ${googleWorkspaceFileTypesPhrase()}.`,
            );
          }
          resolve({ ...first, resourceType });
        } catch (error: unknown) {
          reject(
            error instanceof Error
              ? error
              : new Error("File selection failed."),
          );
        }
      })
      .build();
    instance.setVisible(true);
  });
}

/**
 * Let the user explicitly share ordinary Drive files with AI Matrx for import.
 * Folders cannot be selected. Unsupported Google-native types are rejected by
 * the materializer with an actionable explanation after selection.
 */
export async function pickGoogleDriveFiles(
  accessToken: string,
): Promise<PickedGoogleDriveFile[] | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) {
    throw new Error("Google Picker is not configured on this deployment.");
  }
  const picker = await loadPickerNamespace();
  const view = new picker.DocsView(picker.ViewId.DOCS)
    .setIncludeFolders(false)
    .setSelectFolderEnabled(false)
    .setMode(picker.DocsViewMode.LIST);

  return new Promise<PickedGoogleDriveFile[] | null>((resolve, reject) => {
    const instance = new picker.PickerBuilder()
      .setAppId(projectNumber(clientId))
      .setDeveloperKey(apiKey)
      .setOAuthToken(accessToken)
      .setOrigin(window.location.origin)
      .setTitle("Choose files to import")
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .addView(view)
      .setCallback((data) => {
        try {
          const result = parsePickedFiles(data);
          if (result !== undefined) resolve(result);
        } catch (error: unknown) {
          reject(
            error instanceof Error
              ? error
              : new Error("Google Drive selection failed."),
          );
        }
      })
      .build();
    instance.setVisible(true);
  });
}
