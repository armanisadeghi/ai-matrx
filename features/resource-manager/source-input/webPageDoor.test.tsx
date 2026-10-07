/**
 * verify-5 #3 / #7: the web page door took its own path. The picker scraped
 * the page itself, so with no organization picked the scraper's refusal was
 * painted under the link box ("pick the one you are working in from the avatar
 * menu and try again") and the card was removed — instead of the card waiting
 * for an organization and continuing once one is chosen, like a paste or an
 * upload. And a read page needed a second "Add page" step.
 *
 * Now (1) the Source input's picker hands the link to the intake and never
 * scrapes or previews, and (2) the intake's scrape door lets an organization
 * refusal reach the intake as itself, so the card WAITS (`WAITING_FOR_ORGANIZATION`)
 * — the one ask → hold → continue path — instead of failing as "could not be read".
 *
 * Real: `WebpageResourcePickerCore`, the package intake (`createSourceIntake`
 * through this app's binding). Doubles: the network doors (scraper, keep), the
 * organization funnel, Redux selectors, the knob read.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OrganizationContextError } from "@ai-matrx/agents/matrx";
import { WAITING_FOR_ORGANIZATION, type SourceSetActions } from "@ai-matrx/agents/sources/runtime";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scrapeUrl = jest.fn();
const scrapeUrlSilent = jest.fn();
jest.mock("@/features/scraper/hooks/useScraperApi", () => ({
  useScraperApi: () => ({
    scrapeUrl: (...a: unknown[]) => scrapeUrl(...a),
    scrapeUrlSilent: (...a: unknown[]) => scrapeUrlSilent(...a),
    data: null,
    isLoading: false,
    hasError: false,
    error: null,
    errorDiagnostics: null,
    failure: null,
    reset: jest.fn(),
  }),
}));
const ensureOrgId = jest.fn();
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: (...a: unknown[]) => ensureOrgId(...a) }));
jest.mock("@/lib/organization/organization-gate", () => ({
  holdDeliberateIntent: <T,>(run: () => Promise<T>) => run(),
  isOrganizationSelectionCancelled: () => false,
}));
const keepSource = jest.fn();
jest.mock("@/features/sources/api/sourcesApi", () => ({
  keepSource: (...a: unknown[]) => keepSource(...a),
  landSource: jest.fn(),
  sourceRefusalSentence: (e: unknown) => (e instanceof Error ? e.message : "The server did not say why."),
}));
jest.mock("@/features/sources/api/pastedText", () => ({ buildPastedTextLanding: jest.fn() }));
jest.mock("@/features/audio/services/speechApi", () => ({ transcribeCloudFile: jest.fn() }));
jest.mock("@/features/education/onboard/youtubeTranscript", () => ({ fetchYouTubeTranscript: jest.fn() }));
jest.mock("@/features/scopes/service/associationsService", () => ({ associationsService: { add: jest.fn() } }));
jest.mock("@/hooks/useBackendApi", () => ({ useBackendApi: () => ({ post: jest.fn() }) }));
jest.mock("@/lib/knobs/featureKnobs", () => ({ knobInt: () => Promise.resolve(2_000_000) }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: (sel: () => unknown) => sel() }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user-1" }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  ...jest.requireActual("@/lib/redux/slices/appContextSlice"),
  selectOrganizationId: () => null,
}));
jest.mock("@/components/official/ProTextarea", () => ({ ProTextarea: () => null }));
jest.mock("@/features/resource-manager/webpage/WebpageSnapshotView", () => ({ WebpageSnapshotView: () => null }));

import { WebpageResourcePickerCore } from "@/features/resource-manager/resource-picker/WebpageResourcePicker";
import { renderHook } from "@/test-utils/renderHook";
import { useSourceIntake } from "./useSourceIntake";

const URL_IN = "en.wikipedia.org/wiki/Enzyme";
const URL_OUT = "https://en.wikipedia.org/wiki/Enzyme";
const noOrg = () => new OrganizationContextError("organization_context_required", "Select an organization.");

function fakeSet() {
  return {
    addPending: jest.fn(() => "card-1"),
    fail: jest.fn(),
    settle: jest.fn(),
    restart: jest.fn(() => true),
    updateDraft: jest.fn(),
    setAsking: jest.fn(),
    hasRef: jest.fn(() => false),
    addReady: jest.fn(),
  } as unknown as SourceSetActions & Record<string, jest.Mock>;
}

beforeEach(() => {
  scrapeUrl.mockReset().mockResolvedValue(null);
  scrapeUrlSilent.mockReset();
  ensureOrgId.mockReset();
  keepSource.mockReset().mockResolvedValue({ notices: [] });
});

describe("the picker in read-url mode", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("hands the checked link to the host and never scrapes or previews it", async () => {
    const onReadUrl = jest.fn();
    act(() => root.render(<WebpageResourcePickerCore onSelect={jest.fn()} onReadUrl={onReadUrl} initialUrl={URL_IN} />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(onReadUrl).toHaveBeenCalledWith(URL_OUT);
    expect(scrapeUrl).not.toHaveBeenCalled();
    expect(container.textContent ?? "").not.toContain("Add page");
  });
});

describe("the intake's web page door", () => {
  it("with no organization, the card waits for one — it is not failed with the scraper's sentence", async () => {
    ensureOrgId.mockRejectedValue(noOrg());
    const set = fakeSet();
    const hook = await renderHook(() => useSourceIntake(set, {}));
    await hook.act(() => hook.current.addWebPage(URL_IN));
    expect(set.fail).toHaveBeenCalledWith("card-1", WAITING_FOR_ORGANIZATION);
    expect(scrapeUrlSilent).not.toHaveBeenCalled();
    await hook.unmount();
  });

  it("a scraper refusal for a missing organization also waits (not 'could not be read')", async () => {
    ensureOrgId.mockResolvedValue("org-1");
    scrapeUrlSilent.mockRejectedValue(noOrg());
    const set = fakeSet();
    const hook = await renderHook(() => useSourceIntake(set, {}));
    await hook.act(() => hook.current.addWebPage(URL_IN));
    expect(set.fail).toHaveBeenCalledWith("card-1", WAITING_FOR_ORGANIZATION);
    await hook.unmount();
  });

  it("once an organization is set, resume reads, keeps and settles the card", async () => {
    ensureOrgId.mockResolvedValue("org-1");
    scrapeUrlSilent.mockResolvedValue({ processedDocumentId: "pd-1", sourceNotices: [], overview: { page_title: "Enzyme" } });
    const set = fakeSet();
    const hook = await renderHook(() => useSourceIntake(set, {}));
    const card = {
      id: "card-1",
      draft: { kind: "web" as const, label: "en.wikipedia.org", ref: null, input: { url: URL_OUT } },
      status: "error" as const,
      error: WAITING_FOR_ORGANIZATION,
      manifest: null,
    };
    await hook.act(async () => {
      hook.current.resume(card);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(set.restart).toHaveBeenCalledWith("card-1");
    expect(scrapeUrlSilent).toHaveBeenCalledWith(URL_OUT, expect.objectContaining({ use_cache: true }));
    expect(keepSource).toHaveBeenCalledWith("pd-1", expect.objectContaining({ organizationId: "org-1" }));
    expect(set.settle).toHaveBeenCalledWith("card-1", expect.objectContaining({ processedDocumentId: "pd-1", label: "Enzyme" }));
    expect(set.fail).not.toHaveBeenCalled();
    await hook.unmount();
  });

  it("any other read failure says the scraper's plain words, never an engineer string", async () => {
    ensureOrgId.mockResolvedValue("org-1");
    scrapeUrlSilent.mockRejectedValue(new Error(`${URL_OUT}: bad_status`));
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const set = fakeSet();
    const hook = await renderHook(() => useSourceIntake(set, {}));
    await hook.act(() => hook.current.addWebPage(URL_IN));
    const sentence = (set.fail as jest.Mock).mock.calls[0]?.[1] as string;
    expect(sentence).toBeTruthy();
    expect(sentence).not.toContain("bad_status");
    expect(sentence.toLowerCase()).toContain("paste");
    await hook.unmount();
  });

  it("a read the browser cuts because the page is unloading leaves the card pending (re-read after reload)", async () => {
    ensureOrgId.mockResolvedValue("org-1");
    let cut: (e: unknown) => void = () => undefined;
    scrapeUrlSilent.mockReturnValue(new Promise((_, reject) => (cut = reject)));
    const set = fakeSet();
    const hook = await renderHook(() => useSourceIntake(set, {}));
    await hook.act(async () => {
      void hook.current.addWebPage(URL_IN);
      await new Promise((r) => setTimeout(r, 0));
      window.dispatchEvent(new Event("beforeunload"));
      cut(new TypeError("Failed to fetch"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(set.fail).not.toHaveBeenCalled();
    expect(set.settle).not.toHaveBeenCalled();
    await hook.unmount();
  });
});
