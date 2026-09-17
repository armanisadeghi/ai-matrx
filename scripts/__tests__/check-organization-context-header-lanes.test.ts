/**
 * The Cloud Browser regression was a raw authenticated fetch beside a canonical
 * `postJson` call. The guard must judge that fetch itself, not imports/comments
 * elsewhere in its file.
 */
import { findOrganizationHeaderViolations } from "@/scripts/check-org-header-lanes";

describe("organization-context header lanes", () => {
  it("fires for the Cloud Browser-shaped stream host omission", () => {
    const findings = findOrganizationHeaderViolations(`
      async function claim(token: string) {
        const endpoint = new URL("claim", "https://stream.aimatrx.com/session/");
        return fetch(endpoint, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 4, reason: expect.stringContaining("no organization admission") });
  });

  it("fires when a compliant canonical call sits beside a raw omitted call", () => {
    const findings = findOrganizationHeaderViolations(`
      import { postJson } from "@/lib/python-client";
      async function ticketAndClaim(token: string) {
        await postJson("/browser-manager/runs/r/stream-ticket", {});
        return fetch("https://stream.aimatrx.com/claim", { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("fires for a raw canary backend URL beside a canonical request", () => {
    const findings = findOrganizationHeaderViolations(`
      import { postJson } from "@/lib/python-client";
      const canaryBase = process.env.NEXT_PUBLIC_BACKEND_URL_CANARY;
      async function ticketAndClaim(token: string) {
        await postJson("/browser-manager/runs/r/stream-ticket", {});
        return fetch(\`\${canaryBase}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("fires for a computed process.env backend URL", () => {
    const findings = findOrganizationHeaderViolations(`
      async function request(token: string) {
        return fetch(\`\${process.env["NEXT_PUBLIC_BACKEND_URL_CANARY"]}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("fires for a no-substitution template process.env backend key", () => {
    const findings = findOrganizationHeaderViolations(`
      async function request(token: string) {
        return fetch(\`\${process.env[\`NEXT_PUBLIC_BACKEND_URL_CANARY\`]}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("fires for a destructured process.env backend alias", () => {
    const findings = findOrganizationHeaderViolations(`
      const { NEXT_PUBLIC_BACKEND_URL_CANARY: canaryBase } = process.env;
      async function request(token: string) {
        return fetch(\`\${canaryBase}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("fires for a destructured backend key through a process.env alias", () => {
    const findings = findOrganizationHeaderViolations(`
      const env = process.env;
      const { NEXT_PUBLIC_BACKEND_URL_CANARY: endpoint } = env;
      async function request(token: string) {
        return fetch(\`\${endpoint}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("does not treat an arbitrary object alias as process.env", () => {
    const findings = findOrganizationHeaderViolations(`
      const env = { NEXT_PUBLIC_BACKEND_URL_CANARY: "https://vendor.example" };
      const { NEXT_PUBLIC_BACKEND_URL_CANARY: endpoint } = env;
      async function request(token: string) {
        return fetch(\`\${endpoint}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toEqual([]);
  });

  it("fires for an imported alias of a backend URL symbol", () => {
    const findings = findOrganizationHeaderViolations(`
      import { NEXT_PUBLIC_BACKEND_URL as canaryBase } from "@/config";
      async function request(token: string) {
        return fetch(\`\${canaryBase}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("fires for lowercase authorization", () => {
    const findings = findOrganizationHeaderViolations(`
      async function request(token: string) {
        return fetch("https://stream.aimatrx.com/claim", { headers: { authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("fires for a module-level stream origin constant", () => {
    const findings = findOrganizationHeaderViolations(`
      const streamOrigin = "https://stream.aimatrx.com";
      async function claim(token: string) {
        return fetch(\`\${streamOrigin}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("resolves an outer backend alias captured by an inner request function", () => {
    const findings = findOrganizationHeaderViolations(`
      const endpoint = "https://stream.aimatrx.com";
      async function outer() {
        async function request(token: string) {
          return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
        }
        return request("token");
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("does not let a sibling vendor binding hide a module stream endpoint", () => {
    const findings = findOrganizationHeaderViolations(`
      const endpoint = "https://stream.aimatrx.com";
      async function request(token: string, enabled: boolean) {
        if (enabled) { const endpoint = "https://vendor.example"; void endpoint; }
        return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("does not let a sibling stream binding mark a module vendor endpoint internal", () => {
    const findings = findOrganizationHeaderViolations(`
      const endpoint = "https://vendor.example";
      async function request(token: string, enabled: boolean) {
        if (enabled) { const endpoint = "https://stream.aimatrx.com"; void endpoint; }
        return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toEqual([]);
  });

  it("does not let a sibling catch binding hide a module stream endpoint", () => {
    const findings = findOrganizationHeaderViolations(`
      const endpoint = "https://stream.aimatrx.com";
      async function request(token: string) {
        try { throw new Error("unused"); } catch (endpoint) { void endpoint; }
        return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("does not let a sibling loop endpoint mark a later vendor request internal", () => {
    const findings = findOrganizationHeaderViolations(`
      const endpoint = "https://vendor.example";
      async function request(token: string) {
        for (let endpoint = "https://stream.aimatrx.com"; endpoint; endpoint = "") { void endpoint; }
        return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toEqual([]);
  });

  it("does not let a sibling loop vendor endpoint hide a later module stream request", () => {
    const findings = findOrganizationHeaderViolations(`
      const endpoint = "https://stream.aimatrx.com";
      async function request(token: string) {
        for (let endpoint = "https://vendor.example"; endpoint; endpoint = "") { void endpoint; }
        return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("resolves an internal endpoint declared in the enclosing loop", () => {
    const findings = findOrganizationHeaderViolations(`
      const endpoint = "https://vendor.example";
      async function request(token: string) {
        for (let endpoint = "https://stream.aimatrx.com"; endpoint; endpoint = "") {
          return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
        }
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("keeps a catch parameter scoped to its own handler", () => {
    const findings = findOrganizationHeaderViolations(`
      const endpoint = "https://stream.aimatrx.com";
      async function request(token: string) {
        try { throw new Error("unused"); } catch (endpoint) {
          return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
        }
      }
    `);
    expect(findings).toEqual([]);
  });

  it("keeps a switch binding inside the switch", () => {
    const findings = findOrganizationHeaderViolations(`
      const endpoint = "https://vendor.example";
      async function request(token: string, value: string) {
        switch (value) { case "internal": { const endpoint = "https://stream.aimatrx.com"; void endpoint; } }
        return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toEqual([]);
  });

  it("resolves a switch binding across case clauses", () => {
    const findings = findOrganizationHeaderViolations(`
      async function request(token: string, value: string) {
        switch (value) {
          case "setup": const endpoint = "https://stream.aimatrx.com";
          case "request": return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
        }
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("does not resolve a module endpoint through a shadowing local binding", () => {
    const findings = findOrganizationHeaderViolations(`
      const AIDREAM_PRODUCTION_URL = "https://server.app.matrxserver.com";
      async function request(token: string, AIDREAM_PRODUCTION_URL: string) {
        return fetch(\`\${AIDREAM_PRODUCTION_URL}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toEqual([]);
  });

  it("does not resolve a module endpoint through a shadowing local declaration", () => {
    const findings = findOrganizationHeaderViolations(`
      const AIDREAM_PRODUCTION_URL = "https://server.app.matrxserver.com";
      async function request(token: string) {
        const AIDREAM_PRODUCTION_URL = "https://vendor.example";
        return fetch(\`\${AIDREAM_PRODUCTION_URL}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toEqual([]);
  });

  it("does not resolve a binding declared inside a nested function", () => {
    const findings = findOrganizationHeaderViolations(`
      async function request(token: string) {
        function unrelated() { const endpoint = "https://stream.aimatrx.com"; return endpoint; }
        return fetch(\`\${endpoint}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toEqual([]);
  });

  it("accepts a raw internal fetch whose own headers use the shared builder", () => {
    const findings = findOrganizationHeaderViolations(`
      async function claim(token: string) {
        const headers = await buildHeaders({}, true);
        return fetch("https://stream.aimatrx.com/claim", { headers: { ...headers.headers, Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toEqual([]);
  });

  it("accepts lowercase X-Organization-Id on its own request", () => {
    const findings = findOrganizationHeaderViolations(`
      async function request(token: string, organizationId: string) {
        return fetch("https://stream.aimatrx.com/claim", { headers: { authorization: \`Bearer \${token}\`, "x-organization-id": organizationId } });
      }
    `);
    expect(findings).toEqual([]);
  });

  it("does not let a compliant sibling header bless a second raw request", () => {
    const findings = findOrganizationHeaderViolations(`
      async function twoRequests(token: string) {
        await fetch("https://stream.aimatrx.com/first", { headers: await buildHeaders({}, true) });
        await fetch("https://stream.aimatrx.com/second", { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(4);
  });

  it("recognizes configured backend origins as internal targets", () => {
    const findings = findOrganizationHeaderViolations(`
      async function request(token: string) {
        return fetch(\`\${NEXT_PUBLIC_EC2_SANDBOX_SERVER_URL}/ai/run\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
  });

  it("retains the legacy census for a non-fetch Bearer backend lane", () => {
    const findings = findOrganizationHeaderViolations(`
      const headers = { Authorization: \`Bearer \${token}\` };
      const destination = AIDREAM_PRODUCTION_URL;
      sendWithXmlHttpRequest(destination, headers);
    `);
    expect(findings).toEqual([
      expect.objectContaining({ reason: expect.stringContaining("legacy Bearer backend lane") }),
    ]);
  });

  it("excludes vendor and Supabase hosts from the internal admission rule", () => {
    const source = `
      async function vendor(token: string) {
        await fetch("https://api.vendor.example/v1", { headers: { Authorization: \`Bearer \${token}\` } });
        await fetch("https://db.matrxserver.com/rest/v1/items", { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `;
    expect(findOrganizationHeaderViolations(source)).toEqual([]);
  });
});
