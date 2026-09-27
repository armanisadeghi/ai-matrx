/** @jest-environment jsdom */

/**
 * THE PICKER OFFERS EVERY FILE TYPE THE BUTTONS NAME.
 *
 * THE DEFECT (Bugbot round 21 on PR 228, review comment 4042124324). Making the
 * pick-button copy derive from the file-type record fixed the words and left the
 * door shut: `lib/googlePicker.ts` held its OWN pair of MIME types, its own
 * title and its own post-pick refusal, so the button said "Choose Docs, Sheets
 * or Slides decks" and opened a Picker that filtered decks out — a screen
 * promising something it then refuses, which is worse than the silence it
 * replaced.
 *
 * This drives the REAL `pickGoogleWorkspaceFile` against a stubbed Google Picker
 * and reads back what it actually asked Google for. It fails if a type in the
 * record is missing from the MIME filter, absent from the Picker's title, absent
 * from the sentence beside the button, or refused after selection.
 */

import {
  GOOGLE_WORKSPACE_FILE_TYPES,
  GOOGLE_WORKSPACE_MIME_TYPES,
  GOOGLE_WORKSPACE_RESOURCE_TYPES,
  googleWorkspacePickLabel,
  googleWorkspacePickScopeSentence,
  googleWorkspacePickTitle,
} from "@/features/google-workspace/resource-types";
import {
  GOOGLE_FORM_MIME_TYPE,
  pickGoogleForm,
  pickGoogleWorkspaceFile,
} from "@/lib/googlePicker";

interface Captured {
  mimeTypes: string | null;
  origin: string | null;
  title: string | null;
  callback: ((data: unknown) => void) | null;
}

const captured: Captured = {
  mimeTypes: null,
  origin: null,
  title: null,
  callback: null,
};

function installPickerStub() {
  const view = {
    setIncludeFolders: () => view,
    setSelectFolderEnabled: () => view,
    setMode: () => view,
    setQuery: () => view,
    setMimeTypes: (value: string) => {
      captured.mimeTypes = value;
      return view;
    },
  };
  const builder = {
    setAppId: () => builder,
    setDeveloperKey: () => builder,
    setOAuthToken: () => builder,
    setOrigin: (value: string) => {
      captured.origin = value;
      return builder;
    },
    setTitle: (value: string) => {
      captured.title = value;
      return builder;
    },
    addView: () => builder,
    enableFeature: () => builder,
    setCallback: (callback: (data: unknown) => void) => {
      captured.callback = callback;
      return builder;
    },
    build: () => ({ setVisible: () => undefined }),
  };
  const stub = {
    gapi: {
      load: (_name: string, config: { callback: () => void }) =>
        config.callback(),
    },
    google: {
      picker: {
        DocsView: function DocsView() {
          return view;
        },
        PickerBuilder: function PickerBuilder() {
          return builder;
        },
        DocsViewMode: { LIST: "LIST" },
        Feature: { MULTISELECT_ENABLED: "MULTISELECT_ENABLED" },
        ViewId: { DOCS: "DOCS" },
      },
    },
  };
  Object.assign(window, stub);
}

beforeEach(() => {
  captured.mimeTypes = null;
  captured.origin = null;
  captured.title = null;
  captured.callback = null;
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "1234567890-abc.apps.google.com";
  installPickerStub();
});

/**
 * Open the Picker and wait until it has handed us its callback. The pending
 * promise is returned WRAPPED: returning it bare from an async function adopts
 * it, so the caller would wait for a selection it has not made yet.
 */
async function openPicker(): Promise<{ pending: Promise<unknown> }> {
  const pending = pickGoogleWorkspaceFile("access-token");
  for (let tick = 0; tick < 50 && !captured.callback; tick += 1) {
    await Promise.resolve();
  }
  expect(captured.callback).not.toBeNull();
  return { pending };
}

async function openFormPicker(): Promise<{ pending: Promise<unknown> }> {
  captured.callback = null;
  const pending = pickGoogleForm("access-token");
  for (let tick = 0; tick < 50 && !captured.callback; tick += 1) {
    await Promise.resolve();
  }
  expect(captured.callback).not.toBeNull();
  return { pending };
}

function finishPicker(data: unknown): void {
  const callback = captured.callback;
  if (!callback) throw new Error("Google Picker callback was not installed.");
  callback(data);
}

it("asks Google for every MIME type the record declares", async () => {
  const { pending } = await openPicker();
  const offered = (captured.mimeTypes ?? "").split(",");
  for (const type of GOOGLE_WORKSPACE_RESOURCE_TYPES) {
    expect(offered).toContain(GOOGLE_WORKSPACE_FILE_TYPES[type].mimeType);
  }
  expect(offered.sort()).toEqual([...GOOGLE_WORKSPACE_MIME_TYPES].sort());
  finishPicker({ action: "cancel" });
  await expect(pending).resolves.toBeNull();
});

it("names every file type in the Picker's own title", async () => {
  const { pending } = await openPicker();
  for (const type of GOOGLE_WORKSPACE_RESOURCE_TYPES) {
    expect(captured.title).toContain(GOOGLE_WORKSPACE_FILE_TYPES[type].plural);
  }
  finishPicker({ action: "cancel" });
  await expect(pending).resolves.toBeNull();
});

it("names every file type in the button and the sentence beside it", () => {
  for (const type of GOOGLE_WORKSPACE_RESOURCE_TYPES) {
    const plural = GOOGLE_WORKSPACE_FILE_TYPES[type].plural;
    expect(googleWorkspacePickLabel()).toContain(plural);
    expect(googleWorkspacePickScopeSentence()).toContain(plural);
    expect(googleWorkspacePickTitle()).toContain(plural);
  }
});

it.each(GOOGLE_WORKSPACE_RESOURCE_TYPES)(
  "accepts a picked %s and says which type it is",
  async (resourceType) => {
    const { pending } = await openPicker();
    finishPicker({
      action: "picked",
      docs: [
        {
          id: "file-1",
          name: "A chosen file",
          mimeType: GOOGLE_WORKSPACE_FILE_TYPES[resourceType].mimeType,
          url: null,
        },
      ],
    });
    await expect(pending).resolves.toMatchObject({
      id: "file-1",
      resourceType,
    });
  },
);

it("still refuses a file type the record does not carry, by name", async () => {
  const { pending } = await openPicker();
  finishPicker({
    action: "picked",
    docs: [
      {
        id: "form-1",
        name: "A Google Form",
        mimeType: "application/vnd.google-apps.form",
        url: null,
      },
    ],
  });
  await expect(pending).rejects.toThrow(/Slides decks/);
});

it("offers only Forms in the separate Form mode and returns a selected Form", async () => {
  const { pending } = await openFormPicker();
  expect(captured.mimeTypes).toBe(GOOGLE_FORM_MIME_TYPE);
  expect(captured.origin).toBe(window.location.origin);
  expect(captured.title).toBe("Choose a Google Form");
  finishPicker({
    action: "picked",
    docs: [
      {
        id: "form-1",
        name: "Customer survey",
        mimeType: GOOGLE_FORM_MIME_TYPE,
        url: null,
      },
    ],
  });
  await expect(pending).resolves.toEqual({
    id: "form-1",
    name: "Customer survey",
    mimeType: GOOGLE_FORM_MIME_TYPE,
    url: null,
  });
});

it("cancels or refuses an error/non-Form result in Form mode", async () => {
  const cancelled = await openFormPicker();
  finishPicker({ action: "cancel" });
  await expect(cancelled.pending).resolves.toBeNull();

  const failed = await openFormPicker();
  finishPicker({ action: "error", message: "Picker unavailable" });
  await expect(failed.pending).rejects.toThrow("Google Form selection failed.");

  const nonForm = await openFormPicker();
  finishPicker({
    action: "picked",
    docs: [
      {
        id: "sheet-1",
        name: "Not a Form",
        mimeType: "application/vnd.google-apps.spreadsheet",
      },
    ],
  });
  await expect(nonForm.pending).rejects.toThrow("Choose a Google Form.");
});

it("refuses malformed or multiple Form selections instead of leaving the caller pending", async () => {
  const malformed = await openFormPicker();
  finishPicker({ action: "picked", docs: [{ id: "form-1" }] });
  await expect(malformed.pending).rejects.toThrow(
    "Google Form selection returned an invalid result.",
  );

  const multiple = await openFormPicker();
  finishPicker({
    action: "picked",
    docs: [
      {
        id: "form-1",
        name: "Harbor Dental intake",
        mimeType: GOOGLE_FORM_MIME_TYPE,
      },
      {
        id: "form-2",
        name: "Harbor Dental follow-up",
        mimeType: GOOGLE_FORM_MIME_TYPE,
      },
    ],
  });
  await expect(multiple.pending).rejects.toThrow(
    "Google Form selection returned an invalid result.",
  );
});
