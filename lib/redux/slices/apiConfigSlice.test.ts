import reducer, {
  clearServiceOverrides,
  selectApiServiceTargets,
  selectResolvedBaseUrl,
  selectResolvedServiceBaseUrl,
  setActiveServer,
  setCustomUrl,
  setLoopbackAccess,
  setServiceOverride,
} from "@/lib/redux/slices/apiConfigSlice";
import {
  allowsLoopbackApiTargets,
  configuredServiceUrl,
  isLoopbackApiUrl,
  setLoopbackApiTargetsAdminUnlock,
} from "@/lib/api/service-routing";

function rootState(apiConfig: ReturnType<typeof reducer>) {
  return { apiConfig };
}

describe("multi-service API environment selection", () => {
  afterEach(() => {
    setLoopbackApiTargetsAdminUnlock(false);
    jest.restoreAllMocks();
  });

  it("allows loopback targets outside production bundles", () => {
    expect(allowsLoopbackApiTargets("development")).toBe(true);
    expect(allowsLoopbackApiTargets("test")).toBe(true);
    expect(allowsLoopbackApiTargets("production")).toBe(false);
    expect(isLoopbackApiUrl("http://localhost:8000")).toBe(true);
    expect(isLoopbackApiUrl("http://127.0.0.1:8090")).toBe(true);
    expect(isLoopbackApiUrl("https://server.app.matrxserver.com")).toBe(false);
  });

  it("allows loopback targets in a production bundle once an admin unlocks", () => {
    expect(allowsLoopbackApiTargets("production")).toBe(false);
    setLoopbackApiTargetsAdminUnlock(true);
    expect(allowsLoopbackApiTargets("production")).toBe(true);
    expect(configuredServiceUrl("aidream", "localhost")).toBe(
      "http://localhost:8000",
    );
  });

  it("restores a persisted localhost choice when an admin unlocks, and drops it again on lock", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production");
    window.localStorage.setItem(
      "matrx.apiConfig.v1",
      JSON.stringify({
        activeServer: "localhost",
        customUrl: null,
        serviceOverrides: { scraper: "localhost" },
        apiVersion: null,
        pathOverrides: {},
        aiApiVersionOverride: null,
      }),
    );

    // Boot with admin status unknown: sanitized in memory.
    let state = reducer(undefined, { type: "test/init" });
    state = reducer(state, setLoopbackAccess());
    expect(state.activeServer).toBe("production");
    expect(state.loopbackUnlocked).toBe(false);

    // Admin signs in: the stored choice comes back.
    setLoopbackApiTargetsAdminUnlock(true);
    state = reducer(state, setLoopbackAccess());
    expect(state.activeServer).toBe("localhost");
    expect(state.serviceOverrides.scraper).toBe("localhost");
    expect(state.loopbackUnlocked).toBe(true);

    // Sign-out re-locks in memory WITHOUT erasing the stored choice.
    setLoopbackApiTargetsAdminUnlock(false);
    state = reducer(state, setLoopbackAccess());
    expect(state.activeServer).toBe("production");
    expect(state.serviceOverrides.scraper).toBeUndefined();
    expect(
      JSON.parse(window.localStorage.getItem("matrx.apiConfig.v1") ?? "{}")
        .activeServer,
    ).toBe("localhost");

    window.localStorage.removeItem("matrx.apiConfig.v1");
  });

  it("rejects every loopback selection path in a production bundle with no admin", () => {
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
