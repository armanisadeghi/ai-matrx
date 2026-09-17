/**
 * THE SERVER'S TYPED CODE IS WHAT THE ACCOUNT-FAULT PIPELINE PREFERS.
 *
 * aidream's `credential_failure.py` (lane B-9) declares exactly seven
 * `CredentialFailureCode`s and stamps one beside every `last_error` it writes,
 * in `metadata.credential_failure.code` — a FACT, never prose to parse. Text
 * matching (`classifyGoogleAccountFault`) exists only for a row this account
 * fault pipeline cannot read a typed code from; `googleAccountFault` (which
 * `diagnoseGoogleConnection` and every connector surface call through) reads
 * the typed code FIRST via `serverRecordedAccountFault` and falls back to text
 * only when nothing was stamped.
 *
 * Every one of B-9's seven codes gets its own case below, so a future server
 * code the client does not know FAILS this census exactly the way
 * `admission-codes-are-the-servers-codes.test.ts` and
 * `refusal-codes-are-the-servers-codes.test.ts` already fail for their own
 * vocabularies — never silently falling through to `unknown` unnoticed.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyGoogleAccountFault,
  googleAccountFault,
  serverRecordedAccountFault,
} from "../health";
import type { GoogleConnectionSummary } from "../types";

/** B-9's own seven codes, `credential_failure.py::CredentialFailureCode`. */
const SERVER_CREDENTIAL_FAILURE_CODES = [
  "credential_missing",
  "credential_unreadable",
  "client_configuration_missing",
  "platform_configuration",
  "grant_expired_or_revoked",
  "provider_unavailable",
  "resources_not_saved",
] as const;

function connection(
  overrides: Partial<GoogleConnectionSummary> = {},
): GoogleConnectionSummary {
  return {
    id: "conn-1",
    owner_type: "user",
    owner_user_id: "user-1",
    organization_id: null,
    provider: "google",
    provider_subject: "sub-1",
    account_email: "probe@example.com",
    account_name: null,
    scopes: [],
    status: "needs_attention",
    last_verified_at: "2026-09-17T00:00:00Z",
    // The server's own prose would give a DIFFERENT answer than the typed
    // code below — this is what proves the code is PREFERRED, not merely
    // present.
    last_error: "Some sentence a later server release wrote that matches nothing here.",
    created_at: "2026-09-17T00:00:00Z",
    updated_at: "2026-09-17T00:00:00Z",
    metadata: {},
    credential_present: true,
    credential_stable: true,
    capability_health: { __kind: "google_connection_capability_health" },
    health: "needs_reauth",
    ...overrides,
  };
}

describe.each(SERVER_CREDENTIAL_FAILURE_CODES)(
  "the server code %s",
  (code) => {
    it("is recognized by serverRecordedAccountFault", () => {
      expect(serverRecordedAccountFault({ credential_failure: { code } })).toBe(
        code,
      );
    });

    it("is preferred by googleAccountFault over the row's own prose", () => {
      const row = connection({ metadata: { credential_failure: { code } } });
      expect(googleAccountFault(row)).toBe(code);
      // The text classifier alone would not have found this fault — proving
      // the typed code, not the prose, is what decided it.
      expect(classifyGoogleAccountFault(row.last_error)).not.toBe(code);
    });
  },
);

it("falls back to the text classifier only when the server stamped no code", () => {
  const row = connection({
    metadata: {},
    last_error: "invalid_grant from Google token refresh",
  });
  expect(serverRecordedAccountFault(row.metadata)).toBeNull();
  expect(googleAccountFault(row)).toBe("grant_expired_or_revoked");
});

it("answers a code the server has not declared with 'unknown' via the fault, never a crash", () => {
  expect(serverRecordedAccountFault({ credential_failure: { code: "brand_new_from_the_hub" } })).toBeNull();
});

const AIDREAM_ROOT = process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");
const CREDENTIAL_FAILURE = join(
  AIDREAM_ROOT,
  "aidream",
  "services",
  "google_integrations",
  "credential_failure.py",
);

/** The `CredentialFailureCode = Literal[...]` union, as the server declares it. */
function codesFromServer(): string[] {
  const source = readFileSync(CREDENTIAL_FAILURE, "utf8");
  const union = source.match(/CredentialFailureCode = Literal\[([\s\S]*?)\]/);
  if (!union) {
    throw new Error(
      `${CREDENTIAL_FAILURE} no longer declares 'CredentialFailureCode = Literal[...]'. ` +
        "This census cannot be measured against it — fix this reader rather than deleting the check.",
    );
  }
  return [...union[1]!.matchAll(/"([a-z0-9_]+)"/g)]
    .map((match) => match[1]!)
    .sort();
}

const hasServer = existsSync(CREDENTIAL_FAILURE);

(hasServer ? describe : describe.skip)(
  "the declared codes against the live aidream source",
  () => {
    it("is exactly what credential_failure.py declares", () => {
      expect(codesFromServer()).toEqual(
        [...SERVER_CREDENTIAL_FAILURE_CODES].sort(),
      );
    });

    it("has a client fault for every one of them", () => {
      for (const code of codesFromServer()) {
        expect(
          serverRecordedAccountFault({ credential_failure: { code } }),
        ).toBe(code);
      }
    });
  },
);

it("says out loud when the cross-repo leg could not run", () => {
  if (!hasServer) {
    console.warn(
      `UNMEASURED: the aidream checkout was not found at ${CREDENTIAL_FAILURE}, so the` +
        " credential-failure codes were checked against the client's declared set only." +
        " Set AIDREAM_DIR to the sibling checkout to measure it.",
    );
  }
  expect(true).toBe(true);
});
