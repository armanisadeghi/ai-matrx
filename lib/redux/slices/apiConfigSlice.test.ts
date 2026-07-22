import reducer, {
  clearServiceOverrides,
  selectApiServiceTargets,
  selectResolvedBaseUrl,
  selectResolvedServiceBaseUrl,
  setActiveServer,
  setServiceOverride,
} from "@/lib/redux/slices/apiConfigSlice";

function rootState(apiConfig: ReturnType<typeof reducer>) {
  return { apiConfig };
}

describe("multi-service API environment selection", () => {
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
