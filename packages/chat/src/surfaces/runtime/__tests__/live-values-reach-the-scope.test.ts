/**
 * ALC-18: the page's LIVE values (alchemy `liveValues`, published by `usePageCapture`) reach what an
 * agent receives. Every send path reads the mounted runtime's `getScope()` (launch-agent-execution,
 * refresh-surface-scope → the request's context entries → aidream `apply_surface_context`), and the
 * registry wraps every runtime's `getScope`. A DECLARED value the page left unset is answered from the
 * live capture of THIS surface; a supplied value wins; an undeclared live name never rides along; a
 * capture published for ANOTHER surface answers nothing.
 */
import { liveValues, type LiveCapture } from "@ai-matrx/alchemy/surface";
import { getSurfaceRuntime, registerSurfaceRuntime } from "../SurfaceRuntimeContext";
import { registerSurfaceManifests } from "../registry";

const SURFACE = "test-live/post";
const manifest = {
  surfaceName: SURFACE,
  values: [{ name: "post_body" }, { name: "post" }, { name: "status" }, { name: "title_text" }],
} as unknown as NonNullable<ReturnType<typeof import("../registry").getManifest>>;

const capture = (surfaceName: string): LiveCapture => ({
  surfaceName,
  kind: "record",
  title: "Post",
  route: "/posts/7",
  identity: { post: { id: "p7", name: "Spring launch" } },
  selection: { status: "draft" },
  sections: [
    { id: "post_body", title: "Body", role: "data", value: { text: "Hello" } },
    { id: "undeclared_section", title: "Other", role: "data", value: 1 },
  ],
  errors: [],
  requests: [{ method: "GET", path: "/secret", status: "ok", timestamp: 1 }],
});

describe("live values reach the surface scope an agent receives", () => {
  let offManifests: () => void;
  beforeEach(() => {
    offManifests = registerSurfaceManifests({
      getManifest: (name) => (name === SURFACE ? manifest : undefined),
      getAllManifests: () => [manifest],
      getRawManifest: () => undefined,
      getSurfaceAncestry: () => [],
      getSurfaceChildren: () => [],
    });
  });
  afterEach(() => offManifests());

  it("fills declared, unset values from the live capture of THIS surface; the page's own value wins", async () => {
    const offRuntime = registerSurfaceRuntime({ surfaceName: SURFACE, getScope: () => ({ title_text: "own" , status: "page-said" }) });
    const offLive = liveValues.publish(() => capture(SURFACE));
    const scope = await getSurfaceRuntime()!.getScope();
    expect(scope).toEqual({
      title_text: "own",
      status: "page-said", // supplied by the page: never replaced by the live selection
      post_body: { text: "Hello" },
      post: { id: "p7", name: "Spring launch" },
    });
    expect(scope).not.toHaveProperty("undeclared_section");
    expect(scope).not.toHaveProperty("requests");
    offLive();
    offRuntime();
  });

  it("answers nothing from a capture another surface published", async () => {
    const offRuntime = registerSurfaceRuntime({ surfaceName: SURFACE, getScope: () => ({}) });
    const offLive = liveValues.publish(() => capture("test-live/other"));
    expect(await getSurfaceRuntime()!.getScope()).toEqual({});
    offLive();
    expect(await getSurfaceRuntime()!.getScope()).toEqual({});
    offRuntime();
  });
});
