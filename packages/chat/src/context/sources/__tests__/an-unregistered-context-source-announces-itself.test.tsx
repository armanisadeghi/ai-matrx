/**
 * P21 guard: the chat package reads scopes (a context source) and compute targets only
 * through a host registration. A host that registered none must NOT get silence: the
 * generic default runs AND says so through the host diagnostics port, a write with no
 * honest default throws naming itself, and a registered host is used as-is (no report).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Scopes = typeof import("../scopes");
type Compute = typeof import("../../../compute/targets");

const reported: Array<[string, string]> = [];
let scopes: Scopes;
let compute: Compute;

// jest.setup.ts loads the seams (it registers the app's lazily), so each test takes a FRESH
// copy wired to a recording diagnostics port, and starts with nothing registered.
beforeEach(() => {
  reported.length = 0;
  jest.resetModules();
  jest.doMock("../../../host/diagnostics", () => ({
    reportUnregisteredHostSlot: (name: string, degraded: string) => reported.push([name, degraded]),
  }));
  scopes = require("../scopes") as Scopes;
  compute = require("../../../compute/targets") as Compute;
});

describe("an unregistered context source announces itself", () => {
  it("a scope selection read falls back to 'nothing selected' and reports the missing registration", () => {
    expect(scopes.selectScopeSelectionsContext({})).toEqual({});
    expect(reported.map(([name]) => name)).toContain("scopes.selectScopeSelectionsContext");
  });

  it("a compute-target read falls back to the platform server and reports it", () => {
    expect(compute.resolveAgentSandboxRef({}, "conv-1")).toBeNull();
    expect(reported.map(([name]) => name)).toContain("computeTargets.resolveAgentSandboxRef");
  });

  it("scope UI renders nothing and reports it", () => {
    expect(renderToStaticMarkup(createElement(scopes.ActiveContextTree, {}))).toBe("");
    expect(reported.map(([name]) => name)).toContain("scopes.ActiveContextTree");
  });

  it("a write with no honest default throws, naming itself and the register call", () => {
    expect(() => scopes.setScopeContextValue({})).toThrow(/"scopes\.setScopeContextValue".*registerChatScopes/);
    expect(() => scopes.scopesService.listScopeTypes).toThrow(/"scopes\.scopesService"/);
  });

  it("a registered source is used as-is and reports nothing", () => {
    const selections = { client: "scope-1" };
    scopes.registerChatScopes({ selectScopeSelectionsContext: () => selections });
    expect(scopes.selectScopeSelectionsContext({})).toBe(selections);
    expect(reported).toEqual([]);
  });
});
