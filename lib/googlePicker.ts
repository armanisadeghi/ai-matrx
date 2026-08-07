/** Minimal typed Google Picker loader for explicit Doc/Sheet selection. */

const PICKER_SCRIPT = "https://apis.google.com/js/api.js";
const DOCUMENT_MIME_TYPE = "application/vnd.google-apps.document";
const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

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

export interface PickedGoogleFile {
  id: string;
  name: string;
  mimeType: typeof DOCUMENT_MIME_TYPE | typeof SPREADSHEET_MIME_TYPE;
  url: string | null;
}

export interface GooglePickerOptions {
  initialQuery?: string;
}

function loadScript(): Promise<void> {
  if (window.gapi) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${PICKER_SCRIPT}"]`,
  );
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google Picker could not be loaded.")),
      { once: true },
    );
    if (!existing) {
      script.src = PICKER_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
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

function parsePickedFile(data: unknown): PickedGoogleFile | null | undefined {
  if (!isRecord(data)) return undefined;
  const record = data;
  const action = textField(record, "action");
  if (action === "cancel") return null;
  if (action !== "picked" || !Array.isArray(record.docs)) return undefined;
  const first = record.docs[0];
  if (!isRecord(first)) return undefined;
  const document = first;
  const id = textField(document, "id");
  const name = textField(document, "name");
  const mimeType = textField(document, "mimeType");
  if (!id || !name) return undefined;
  if (mimeType !== DOCUMENT_MIME_TYPE && mimeType !== SPREADSHEET_MIME_TYPE) {
    throw new Error("Choose a Google Doc or Google Sheet.");
  }
  return { id, name, mimeType, url: textField(document, "url") };
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
    .setMimeTypes(`${DOCUMENT_MIME_TYPE},${SPREADSHEET_MIME_TYPE}`);
  const initialQuery = options.initialQuery?.trim();
  if (initialQuery) view.setQuery(initialQuery);

  return new Promise<PickedGoogleFile | null>((resolve, reject) => {
    const instance = new picker.PickerBuilder()
      .setAppId(projectNumber(clientId))
      .setDeveloperKey(apiKey)
      .setOAuthToken(accessToken)
      .setOrigin(window.location.origin)
      .setTitle("Choose one Google Doc or Sheet")
      .addView(view)
      .setCallback((data) => {
        try {
          const result = parsePickedFile(data);
          if (result !== undefined) resolve(result);
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
