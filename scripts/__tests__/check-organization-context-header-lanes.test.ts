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

  it("fires for a module-level stream origin constant", () => {
    const findings = findOrganizationHeaderViolations(`
      const streamOrigin = "https://stream.aimatrx.com";
      async function claim(token: string) {
        return fetch(\`\${streamOrigin}/claim\`, { headers: { Authorization: \`Bearer \${token}\` } });
      }
    `);
    expect(findings).toHaveLength(1);
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
