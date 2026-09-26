/**
 * THE EXISTING-FILE LAW for the Education front door ("My files").
 *
 * A learner who picks a file they already own must get a kit anchored on THAT
 * file: nothing uploaded, no new file row, and every artifact's `source` edge
 * pointing at the picked id. This suite drives the real `useIngest` stored
 * branch, then feeds its `ref` through the real `recordSourceLineage` writer,
 * so it goes red if the path re-uploads, re-anchors on a different file, or
 * loses the association.
 */
import { renderHook } from "@/test-utils/renderHook";

const upload = jest.fn();
const associationsAdd = jest.fn();
const resolveCanonicalProcessedDocumentId = jest.fn();
const processedDocRow = jest.fn();
const fileHandlerUse = jest.fn();
const streamPdfExtractTextRemote = jest.fn();
const streamPdfExtractText = jest.fn();

jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload }),
}));
jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { use: (...a: unknown[]) => fileHandlerUse(...a) },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { add: (...a: unknown[]) => associationsAdd(...a) },
}));
jest.mock("@/features/files/api/document-lookup", () => ({
  resolveCanonicalProcessedDocumentId: (...a: unknown[]) =>
    resolveCanonicalProcessedDocumentId(...a),
}));
jest.mock("@/utils/supabase/docprocDb", () => ({
  docprocDb: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () => processedDocRow(),
      };
      return chain;
    },
  }),
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));
jest.mock("@/features/scraper/hooks/useScraperApi", () => ({
  useScraperApi: () => ({ scrapeUrl: jest.fn() }),
}));
jest.mock("@/hooks/useBackendApi", () => ({
  useBackendApi: () => ({ post: jest.fn() }),
}));
jest.mock("@/features/pdf/api/client", () => ({
  usePdfClient: () => ({ backendUrl: "http://x", authHeaders: async () => ({}) }),
}));
jest.mock("@/features/pdf-extractor/service/streamPdf", () => ({
  streamPdfExtractText: (...a: unknown[]) => streamPdfExtractText(...a),
  streamPdfExtractTextRemote: (...a: unknown[]) =>
    streamPdfExtractTextRemote(...a),
}));
jest.mock("@/features/pdf/utils/source", () => ({
  buildPdfSourceFromFileId: (id: string) => ({ file_id: id }),
}));
jest.mock("@/features/audio/services/speechApi", () => ({
  transcribeCloudFile: jest.fn(),
}));
jest.mock("../youtubeTranscript", () => ({ fetchYouTubeTranscript: jest.fn() }));
jest.mock("../officeExtract", () => ({ extractOfficeText: jest.fn() }));
jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: async () => 400_000,
}));
jest.mock("@/features/education/convert/coverage", () => ({
  KIT_KNOB_FEATURE: "education.study_kit",
}));

import { useIngest } from "../useIngest";
import { recordSourceLineage } from "@/features/education/convert/recordSourceLineage";

// jsdom's Blob/File predate `.text()`; browsers have it.
if (!Blob.prototype.text) {
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

const PICKED = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  jest.clearAllMocks();
  associationsAdd.mockResolvedValue({ ok: true });
  upload.mockResolvedValue({ fileId: "NEW-UPLOAD-SHOULD-NEVER-HAPPEN" });
});

async function ingestStored(fileName: string, mimeType: string) {
  const hook = await renderHook(() => useIngest());
  let out: Awaited<ReturnType<ReturnType<typeof useIngest>["normalize"]>> | undefined;
  await hook.act(async () => {
    out = await hook.current.normalize({
      kind: "stored",
      stored: { fileId: PICKED, fileName, mimeType },
    });
  });
  await hook.unmount();
  return out!;
}

async function lineageOf(ref: Awaited<ReturnType<typeof ingestStored>>["ref"]) {
  await recordSourceLineage(
    {
      targetKind: "deck",
      artifactId: "deck-1",
      resourceType: "fc_set",
      href: "/education/flashcards/deck-1",
      title: "Deck",
    },
    { text: "x", title: "Kit", ref },
    "org-1",
  );
}

describe("Education 'My files' — a picked file is anchored on, never re-uploaded", () => {
  it("reuses an existing Knowledge Source: no upload, no extraction, edge to the picked file", async () => {
    resolveCanonicalProcessedDocumentId.mockResolvedValue("pd-1");
    processedDocRow.mockResolvedValue({
      data: { content: "raw", clean_content: "Clean chapter text.", total_pages: 3 },
      error: null,
    });

    const normalized = await ingestStored("Atoms.pdf", "application/pdf");

    expect(upload).not.toHaveBeenCalled();
    expect(streamPdfExtractTextRemote).not.toHaveBeenCalled();
    expect(normalized.text).toBe("Clean chapter text.");
    expect(normalized.ref).toEqual({
      kind: "file",
      fileId: PICKED,
      processedDocumentId: "pd-1",
    });

    await lineageOf(normalized.ref);
    expect(associationsAdd).toHaveBeenCalledTimes(1);
    expect(associationsAdd.mock.calls[0][0]).toMatchObject({
      sourceType: "fc_set",
      sourceId: "deck-1",
      targetType: "file",
      targetId: PICKED,
      role: "source",
    });
  });

  it("reads a file with NO Source by its id — bytes fetched, never uploaded", async () => {
    resolveCanonicalProcessedDocumentId.mockResolvedValue(null);
    fileHandlerUse.mockReturnValue({
      as: async () => new Blob(["Photosynthesis notes from my files."], { type: "text/plain" }),
    });

    const normalized = await ingestStored("notes.txt", "text/plain");

    expect(upload).not.toHaveBeenCalled();
    expect(fileHandlerUse).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "file_id", fileId: PICKED }),
    );
    expect(normalized.text).toBe("Photosynthesis notes from my files.");
    expect(normalized.ref.fileId).toBe(PICKED);

    await lineageOf(normalized.ref);
    expect(associationsAdd.mock.calls[0][0]).toMatchObject({
      targetType: "file",
      targetId: PICKED,
    });
  });
});
