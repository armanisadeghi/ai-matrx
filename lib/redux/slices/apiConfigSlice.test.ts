import reducer, {
  clearServiceOverrides,
  selectApiServiceTargets,
  selectResolvedBaseUrl,
  selectResolvedServiceBaseUrl,
  setActiveServer,
  setCustomUrl,
  setServiceOverride,
} from "@/lib/redux/slices/apiConfigSlice";
import {
  allowsLoopbackApiTargets,
  configuredServiceUrl,
  isLoopbackApiUrl,
} from "@/lib/api/service-routing";

function rootState(apiConfig: ReturnType<typeof reducer>) {
  return { apiConfig };
}

describe("multi-service API environment selection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("allows loopback targets only outside production bundles", () => {
    expect(allowsLoopbackApiTargets("development")).toBe(true);
    expect(allowsLoopbackApiTargets("test")).toBe(true);
    expect(allowsLoopbackApiTargets("production")).toBe(false);
    expect(isLoopbackApiUrl("http://localhost:8000")).toBe(true);
    expect(isLoopbackApiUrl("http://127.0.0.1:8090")).toBe(true);
    expect(isLoopbackApiUrl("https://server.app.matrxserver.com")).toBe(false);
  });

  it("rejects every loopback selection path in a production bundle", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production");
    let state = reducer(undefined, { type: "test/init" });

    state = reducer(state, setActiveServer("localhost"));
    expect(state.activeServer).toBe("production");

    state = reducer(
      state,
      setServiceOverride({
        service: "aidream",
        environment: "localhost",
      }),
    );
    expect(state.serviceOverrides.aidream).toBeUndefined();

    state = reducer(state, setCustomUrl("http://127.0.0.1:8000"));
    expect(state.activeServer).toBe("production");
    expect(state.customUrl).toBeNull();
    expect(configuredServiceUrl("aidream", "localhost")).toBeUndefined();
  });

  it("switches every unpinned service to its loopback origin", () => {
    let state = reducer(undefined, { type: "test/init" });
    state = reducer(state, clearServiceOverrides());
    state = reducer(state, setActiveServer("localhost"));

    const targets = selectApiServiceTargets(rootState(state));
    expect(
      Object.fromEntries(targets.map((target) => [target.service, target.url])),
    ).toEqual({
      aidream: "http://localhost:8000",
      scraper: "http://localhost:8001",
      files: "http://127.0.0.1:8090",
      seo: "http://127.0.0.1:8081",
    });
    expect(selectResolvedBaseUrl(rootState(state))).toBe(
      "http://localhost:8000",
    );
  });

  it("pins one service without changing the global environment", () => {
    let state = reducer(undefined, { type: "test/init" });
    state = reducer(state, clearServiceOverrides());
    state = reducer(state, setActiveServer("localhost"));
    state = reducer(
      state,
      setServiceOverride({ service: "files", environment: "production" }),
    );

    expect(selectResolvedServiceBaseUrl(rootState(state), "files")).toBe(
      "https://files.matrxserver.com",
    );
    expect(selectResolvedServiceBaseUrl(rootState(state), "seo")).toBe(
      "http://127.0.0.1:8081",
    );
  });

  it("returns every service to the global environment when overrides clear", () => {
    let state = reducer(undefined, { type: "test/init" });
    state = reducer(
      state,
      setServiceOverride({ service: "seo", environment: "localhost" }),
    );
    state = reducer(state, clearServiceOverrides());

    expect(
      selectApiServiceTargets(rootState(state)).every(
        (target) => target.override === null,
      ),
    ).toBe(true);
  });
});
