/**
 * EVERY SENTENCE A PERSON READS ON A CONNECTOR CARD COMES FROM THE DECLARED
 * VOCABULARY — on every branch, not only the one the last round named.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R4, V13-1). Round 3's N9 closed the path it
 * was reported on: `users.integration_connections.last_error` is classified into
 * a typed fault and never printed. It left `diagnoseGoogleConnection`'s OWN
 * sentences, written in the same operator register and reaching the same places.
 * With `credential_present = false` and `last_error: null` — a credential that
 * is simply GONE, the single most likely broken state, and one the column is not
 * involved in at all — the card rendered, ten times over:
 *
 *   "probe@example.com has no vault credential on file (no credential item and
 *    no legacy vault key), so the server cannot mint a Google access token.
 *    Every sync and collection using it fails. Reconnect probe@example.com to
 *    mint a new refresh-token credential."
 *
 * "vault" 20×, "mint" 20×, "legacy vault key" 10×, "credential item" 10× on ONE
 * card (the account line plus all nine product rows, which repeat the account's
 * reason through `health.ts`'s `account_unusable` branch).
 *
 * WHY THE FIX'S OWN TEST MISSED IT: `the-account-fault-is-a-sentence-not-a-stack`
 * feeds `last_error` strings, so it drives the CLASSIFIER and never the branches
 * that fire when there is nothing to classify. This suite enumerates the
 * BRANCHES of `diagnoseGoogleConnection` instead, and then censuses every string
 * literal under `features/connectors/**` and the Google account vocabulary, so a
 * new operator sentence anywhere fails by file and line rather than by review.
 *
 * A REVOKED ACCOUNT'S SENTENCE IS ALSO PINNED HERE (V13-5): it used to say
 * "Nothing can read Search Console or Analytics with it", printed ten times on
 * one card including on the Gmail, Calendar, Contacts, Tasks and YouTube rows,
 * where it is simply false. What stops working per product is the provider
 * config's `stopsOnRevoke`, which the revoke consequence already reads; a
 * generic account sentence may never name a product.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => null,
}));

jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));

import {
  GOOGLE_ACCOUNT_FAULT_CODES,
  diagnoseGoogleConnection,
  googleAccountFaultLanguage,
} from "@/features/marketing/google/health";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { googleAccount } from "../google-adapter";
import { ConnectedAccountHealth } from "../ConnectedAccountHealth";
import { MANAGEMENT_ALLOWED } from "../shared-account-level";
import { accountHealth, type ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;

const LIVE: ConnectorCapabilityRollout[] = [
  ...new Set(provider.products.flatMap((product) => product.capabilityKeys)),
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));

/**
 * THE OPERATOR WORDS. Every one of them is a real thing in our own machinery — a
 * vault item, a minted access token, a legacy key, an exception class, a row id
 * — and not one of them is a thing the person whose Google account this is has
 * ever heard of (D6, law 10).
 */
const OPERATOR_WORDS: Array<{ label: string; re: RegExp }> = [
  { label: "vault", re: /\bvaults?\b/i },
  { label: "mint", re: /\bmint(?:s|ed|ing)?\b/i },
  { label: "credential item", re: /credential item/i },
  { label: "legacy", re: /\blegac(?:y|ies)\b/i },
  { label: "refresh token", re: /refresh[- ]token/i },
  { label: "a UUID", re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i },
  { label: "an exception class", re: /\b[A-Z][A-Za-z]*(?:Error|Exception|Violation)\b/ },
  { label: "a machine token", re: /[a-z0-9]_[a-z0-9]/i },
  { label: "a URL", re: /https?:\/\//i },
];

function offences(text: string): string[] {
  return OPERATOR_WORDS.filter((word) => word.re.test(text)).map((w) => w.label);
}

function row(
  overrides: Partial<GoogleConnectionSummary> = {},
): GoogleConnectionSummary {
  return {
    id: "7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f",
    owner_type: "user",
    owner_user_id: "4cf62e4e-2679-484f-b652-034e697418df",
    organization_id: null,
    provider: "google",
    provider_subject: "10293847",
    account_email: "probe@example.com",
    account_name: null,
    scopes: [
      ...new Set([
        ...provider.identityScopes,
        ...provider.products.flatMap((product) => product.scopes),
      ]),
    ],
    status: "connected",
    status_as_read: "connected",
    last_verified_at: "2026-09-17T12:00:00Z",
    // 🚨 NOTHING TO CLASSIFY. Every branch below fires with the column empty,
    // which is what no existing suite did.
    last_error: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-17T12:00:00Z",
    metadata: {},
    credential_present: true,
    credential_stable: true,
    capability_health: { __kind: "google_connection_capability_health" },
    health: "connected",
    ...overrides,
  };
}

/**
 * EVERY BRANCH of `diagnoseGoogleConnection`, by the condition that selects it
 * — not by the values of one column. A branch added without a case here is
 * caught by the exhaustiveness check below.
 */
const BRANCHES: Array<{ name: string; row: GoogleConnectionSummary }> = [
  {
    name: "the account was revoked at Google",
    row: row({ health: "revoked", status: "revoked" }),
  },
  {
    // The third terminal status (R22 / V17-1): blocked with nothing to press.
    name: "our own app configuration is what Google rejected",
    row: row({
      health: "unavailable",
      metadata: { credential_failure: { code: "platform_configuration" } },
    }),
  },
  {
    name: "the server marked it blocked and recorded nothing to explain it",
    row: row({ health: "unavailable", status: "unavailable" }),
  },
  {
    name: "the row carries a status word this build has never heard of",
    row: row({
      health: "unrecognized",
      status: "unrecognized",
      status_as_read: "suspended_by_provider",
    }),
  },
  {
    name: "the credential is simply GONE (V13-1's own case)",
    row: row({
      credential_present: false,
      credential_stable: false,
      health: "needs_reauth",
    }),
  },
  {
    name: "needs_attention with no recorded reason at all",
    row: row({ status: "needs_attention", health: "needs_reauth" }),
  },
  ...GOOGLE_ACCOUNT_FAULT_CODES.map((code) => ({
    name: `needs_attention with the server's own typed code ${code}`,
    row: row({
      status: "needs_attention",
      health: "needs_reauth",
      metadata: { credential_failure: { code } },
    }),
  })),
  {
    name: "the credential still resolves the old way",
    row: row({ credential_stable: false }),
  },
  { name: "connected and working", row: row() },
];

describe("every branch of the account diagnosis", () => {
  it.each(BRANCHES.map((b) => [b.name, b.row] as const))(
    "speaks the declared vocabulary: %s",
    (_name, connection) => {
      const diagnosis = diagnoseGoogleConnection(connection);
      for (const part of [diagnosis.label, diagnosis.reason, diagnosis.remedy ?? ""]) {
        expect({ part, offends: offences(part) }).toEqual({ part, offends: [] });
      }
      expect(diagnosis.reason).toMatch(/[.!?]$/);
    },
  );

  it("names no product in a sentence about the whole account (V13-5)", () => {
    const names = provider.products.map((product) => product.name);
    for (const branch of BRANCHES) {
      const diagnosis = diagnoseGoogleConnection(branch.row);
      const spoken = `${diagnosis.reason} ${diagnosis.remedy ?? ""}`;
      for (const name of names) {
        expect(`${branch.name}: ${spoken}`).not.toContain(name);
      }
      // The two the revoked sentence used to name, spelled out: they are
      // product names AND marketing surfaces, and a generic account sentence
      // may name neither.
      expect(spoken).not.toContain("Search Console");
      expect(spoken).not.toContain("Analytics");
    }
  });

  it("has a case here for every fault the vocabulary declares", () => {
    const covered = BRANCHES.map((b) => b.name).join(" ");
    for (const code of GOOGLE_ACCOUNT_FAULT_CODES) {
      expect(covered).toContain(code);
      const language = googleAccountFaultLanguage(code, "probe@example.com");
      expect(offences(`${language.label} ${language.reason} ${language.remedy ?? ""}`)).toEqual([]);
    }
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(connection: GoogleConnectionSummary): string {
  const account = googleAccount(connection);
  container = document.createElement("div");
  document.body.appendChild(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() =>
    mounted.render(
      <ConnectedAccountHealth
        management={MANAGEMENT_ALLOWED}
        provider={provider}
        account={account}
        health={accountHealth({ provider, account, rollout: LIVE })}
        onReconnect={() => {}}
        onReconnectAccount={() => {}}
        onRevoke={() => {}}
        busy={[]}
      />,
    ),
  );
  return container.textContent ?? "";
}

describe("the rendered card", () => {
  it.each(BRANCHES.map((b) => [b.name, b.row] as const))(
    "carries no operator word anywhere: %s",
    (_name, connection) => {
      const shown = render(connection);
      expect(offences(shown)).toEqual([]);
      expect(shown).toContain("probe@example.com");
    },
  );

  it("never repeats a marketing claim on a product it is not about (V13-5)", () => {
    const shown = render(row({ health: "revoked", status: "revoked" }));
    // The sentence used to land on all nine rows and the account line.
    expect(shown).not.toContain("Nothing can read Search Console or Analytics");
  });
});

/**
 * THE CENSUS. Every string literal a person can read under
 * `features/connectors/**` (plus the Google account vocabulary, which is where
 * the primitive's account sentences are written) is graded for operator words.
 * A sentence added tomorrow in the old register fails here by file and line.
 *
 * What is deliberately NOT graded: comments and code identifiers (a file's
 * header must be free to say "vault"), the machine keys a config declares
 * (scope URLs, capability keys, resource types), and the tests themselves,
 * which have to name the leak to forbid it.
 */
const ROOT = join(__dirname, "..", "..", "..");
const CENSUS_ROOTS = [
  join(ROOT, "features", "connectors"),
  join(ROOT, "features", "marketing", "google", "health.ts"),
];

function sourceFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) {
      // `import/` is the per-provider import panels, not the account card, and
      // it is another lane's tree; the account sentences live here.
      if (entry === "__tests__" || entry === "node_modules" || entry === "import") continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** Strip comments, then read every string/template literal of two words or more. */
function spokenLiterals(text: string): Array<{ line: number; value: string }> {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
  const out: Array<{ line: number; value: string }> = [];
  // Single-line literals only: a multi-line template in JSX is markup, and
  // pretending to parse it is how a census invents findings (my first run
  // reported forty of them).
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`\n$]*)`/g;
  for (let m = re.exec(stripped); m; m = re.exec(stripped)) {
    const value = m[1] ?? m[2] ?? m[3] ?? "";
    // Only PROSE is graded: two words of letters and a closing full stop. A
    // Tailwind class list, an aria id, a scope URL and a capability key are
    // machine addresses, and a census that grades them reports noise instead of
    // the one sentence that matters.
    const prose = value.trim();
    if (!/[A-Za-z]{3}\s+[A-Za-z]/.test(prose)) continue;
    if (!/[.!?]$/.test(prose)) continue;
    out.push({ line: stripped.slice(0, m.index).split("\n").length, value });
  }
  return out;
}

/**
 * The words graded STATICALLY. `a machine token` and `a URL` are deliberately
 * left to the branch and render legs above: a prose literal in a component
 * legitimately carries an interpolated key, and grading those here would bury
 * the finding that matters under class names.
 */
const STATIC_WORDS = new Set([
  "vault",
  "mint",
  "credential item",
  "legacy",
  "refresh token",
  "a UUID",
  "an exception class",
]);

/**
 * THE PRODUCT NAMES, which belong to the PROVIDER CONFIG and nowhere else
 * (PLAN §5.2: "No provider-specific component outside the provider's config and
 * its Plane A panels"). What stops working when an account is disconnected is
 * `stopsOnRevoke`, declared per product beside the product; a sentence written
 * in the generic primitive that names one product is a second, wrong copy of
 * that fact — which is exactly how "Nothing can read Search Console or
 * Analytics with it" ended up on the Gmail row (V13-5).
 */
const PRODUCT_WORDS = [
  ...new Set([
    ...GOOGLE_CONNECTOR_PROVIDER.products.map((product) => product.name),
    "Search Console",
    "Analytics",
    "Gmail",
    "Tag Manager",
    "YouTube",
  ]),
];

/**
 * The two files a product name legitimately lives in, and why:
 *   • `provider-config.ts` — the declaration itself, including `stopsOnRevoke`;
 *   • `google-adapter.ts` — the ONE file allowed to name Google, whose
 *     product-named sentences are keyed by the SERVER's own product-specific
 *     admission codes (`google_analytics_internal_test_required`), so each one
 *     is about that product and renders nowhere else.
 * The ACCOUNT vocabulary in `features/marketing/google/health.ts` is graded
 * dynamically instead, over every branch, by "names no product in a sentence
 * about the whole account" above — a static pass there would also grade the
 * Plane A resource-binding diagnoses, where "Analytics" is the subject.
 */
const PRODUCT_NAME_HOMES = /(provider-config\.ts|google-adapter\.ts|gmail-read-disclosure\.tsx|marketing\/google\/health\.ts)$/;

describe("the connector primitive's own words", () => {
  const files = CENSUS_ROOTS.flatMap(sourceFiles);

  it("scans the files it claims to scan", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it("contains no operator word in any sentence a person can read", () => {
    const found: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const { line, value } of spokenLiterals(text)) {
        const bad = offences(value).filter((word) => STATIC_WORDS.has(word));
        if (bad.length > 0) {
          found.push(
            `${relative(ROOT, file)}:${line} — ${bad.join(", ")} — ${value.slice(0, 120)}`,
          );
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("names a provider product only where the provider declares it", () => {
    const found: string[] = [];
    for (const file of files) {
      // The config IS where a product is named, and the marketing module's own
      // resource-binding diagnoses are Plane A (a GA4 property picker legitimately
      // says Analytics). What is graded is the ACCOUNT vocabulary and every
      // generic component: they render on every product's row.
      if (PRODUCT_NAME_HOMES.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const { line, value } of spokenLiterals(text)) {
        for (const word of PRODUCT_WORDS) {
          if (!value.includes(word)) continue;
          found.push(`${relative(ROOT, file)}:${line} — names ${word} — ${value.slice(0, 120)}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
