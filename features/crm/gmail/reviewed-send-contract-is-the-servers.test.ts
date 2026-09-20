// features/crm/gmail/reviewed-send-contract-is-the-servers.test.ts
//
// CENSUS — THE REVIEWED-SEND WIRE CONTRACT IS THE SERVER'S, MEASURED.
//
// `./reviewed-send-contract.ts` exists because the generated contract
// (`types/python-generated/api-types.ts`) is stale for this endpoint and a
// generated file is never hand-edited (the module header carries the two exact
// failures that blocked `pnpm sync-types` in this container). A hand-written
// contract with nothing diffing it against the server is the failure that
// `features/approvals/__tests__/receipt-states-are-the-servers-states.test.ts`
// was written for: a union that LOOKED like a forcing function and was a copy.
//
// So this reads the Pydantic models out of the sibling aidream checkout and
// asserts three things:
//   1. every field this client SENDS exists on `ReviewedGmailRequest`;
//   2. every field this client READS exists on `ReviewedGmailResponse`;
//   3. `approved_by` is STILL not accepted — the approver is the authenticated
//      caller, and a client that started sending it would be asserting who
//      approved a send.
// Plus the `GmailCcAttribution` entry shape, because the Cc attribution is the
// one part of the row the server takes on the client's word and stores verbatim.
//
// It prints UNMEASURED and passes ONLY when the checkout is absent; when the
// checkout is there and a field is missing, it FAILS.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REVIEWED_SEND_REQUEST_FIELDS,
  REVIEWED_SEND_REQUEST_FORBIDDEN_FIELDS,
  REVIEWED_SEND_RESPONSE_FIELDS,
  reviewedSendRequestBody,
} from "./reviewed-send-contract";

const AIDREAM_ROOT =
  process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");

/** Where the models live, newest home first — a later extraction keeps measuring. */
const MODEL_SOURCES = [
  join(AIDREAM_ROOT, "aidream", "api", "routers", "google_workspace_models.py"),
  join(AIDREAM_ROOT, "aidream", "api", "routers", "google_workspace.py"),
] as const;

function sourceFileFor(className: string): string | null {
  return (
    MODEL_SOURCES.find(
      (path) =>
        existsSync(path) &&
        new RegExp(`^class ${className}\\(`, "m").test(readFileSync(path, "utf8")),
    ) ?? null
  );
}

/**
 * The field names one Pydantic model declares.
 *
 * The block runs from `class <Name>(` to the next top-level `class`/`@`/`def`,
 * and a field is an indented `name: <annotation>`. Comment lines (`#:`) and
 * continuation lines are not fields, so both are excluded by the anchor.
 */
function blockOf(className: string, path: string): string {
  const source = readFileSync(path, "utf8");
  const start = source.search(new RegExp(`^class ${className}\\(`, "m"));
  if (start < 0) {
    throw new Error(`${path} no longer declares class ${className}.`);
  }
  const rest = source.slice(start);
  const end = rest.slice(1).search(/^(class |@|def |# ─)/m);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

function fieldsOf(className: string, path: string): string[] {
  const block = blockOf(className, path);
  const fields = [
    ...block.matchAll(/^ {4}([a-z_][a-z0-9_]*)\s*:\s*\S/gm),
  ].map((match) => match[1]!);
  if (fields.length === 0) {
    throw new Error(
      `${path} class ${className} parsed to ZERO fields. Fix this reader (or ` +
        "point MODEL_SOURCES at the module that now declares the models) rather " +
        "than deleting the check — a census that measures nothing is worse than none.",
    );
  }
  return fields;
}

const requestFile = sourceFileFor("ReviewedGmailRequest");
const responseFile = sourceFileFor("ReviewedGmailResponse");
const ccFile = sourceFileFor("GmailCcAttribution");
const measurable = Boolean(requestFile && responseFile && ccFile);

(measurable ? describe : describe.skip)(
  "the reviewed-send contract against the live aidream models",
  () => {
    it("sends only fields ReviewedGmailRequest accepts", () => {
      const server = fieldsOf("ReviewedGmailRequest", requestFile!);
      for (const field of REVIEWED_SEND_REQUEST_FIELDS) {
        expect(server).toContain(field);
      }
    });

    it("sends organization_id, which the server now REQUIRES", () => {
      // Required means: declared with no default. `organization_id: str = Field(
      // min_length=1)` has no `default=`, unlike every optional field below it.
      // Read the DECLARATION OUT OF THIS CLASS'S BLOCK, never out of the whole
      // module: aidream's `_ORGANIZATION_FIELD` (an optional `organization_id`
      // shared by RegisterSelectedFileRequest / CreateDocumentRequest /
      // CreateSheetRequest) is declared ~85 lines ABOVE ReviewedGmailRequest, so
      // a whole-file `.exec` matched THAT line — `str | None = _ORGANIZATION_FIELD`
      // — and reported the reviewed-send field as optional while the server has
      // required it all along. A census that reads the wrong class is worse than
      // none.
      const block = blockOf("ReviewedGmailRequest", requestFile!);
      const declaration = /^ {4}organization_id\s*:\s*(.+)$/m.exec(block);
      expect(declaration).not.toBeNull();
      expect(declaration![1]).not.toMatch(/default|\|\s*None/);
      // And the client always puts it on the wire.
      const body = reviewedSendRequestBody({
        connectionId: "conn-1",
        to: "ada@example.com",
        cc: [],
        subject: "Hi",
        body: "Hello",
        context: { organizationId: "org-1" },
      });
      expect(body.organization_id).toBe("org-1");
    });

    it("never sends a field the server refuses to be told", () => {
      const server = fieldsOf("ReviewedGmailRequest", requestFile!);
      for (const field of REVIEWED_SEND_REQUEST_FORBIDDEN_FIELDS) {
        expect(server).not.toContain(field);
        expect(REVIEWED_SEND_REQUEST_FIELDS as readonly string[]).not.toContain(
          field,
        );
      }
    });

    it("reads only fields ReviewedGmailResponse answers with", () => {
      const server = fieldsOf("ReviewedGmailResponse", responseFile!);
      for (const field of REVIEWED_SEND_RESPONSE_FIELDS) {
        expect(server).toContain(field);
      }
    });

    it("reads the compliance keys the spine's own report writes", () => {
      // `compliance` is a free-form dict on the wire, so the sub-keys are measured
      // against `compliance_report`, which is the ONE builder of that dict. A
      // renamed key there would otherwise silently stop the footer disclosure (W4).
      const reviewedSend = join(
        AIDREAM_ROOT,
        "aidream",
        "services",
        "outreach_single_send",
        "reviewed_send.py",
      );
      if (!existsSync(reviewedSend)) {
        console.warn(
          `UNMEASURED: ${reviewedSend} not found, so the compliance sub-keys were ` +
            "not compared against `compliance_report`.",
        );
        return;
      }
      const source = readFileSync(reviewedSend, "utf8");
      const start = source.indexOf("def compliance_report(");
      expect(start).toBeGreaterThan(0);
      const report = source.slice(start, start + 2000);
      for (const key of [
        "compliance_class",
        "envelope",
        "footer_appended",
        "footer_text",
        "reason",
      ]) {
        expect(report).toContain(`"${key}"`);
      }
      // FALSIFIABILITY: a key the builder does not write is detected.
      expect(report).not.toContain('"footer_html"');
    });

    it("spells a Cc attribution entry the way the server stores it", () => {
      const server = fieldsOf("GmailCcAttribution", ccFile!);
      const body = reviewedSendRequestBody({
        connectionId: "conn-1",
        to: "ada@example.com",
        cc: ["bo@example.com"],
        subject: "Hi",
        body: "Hello",
        context: {
          organizationId: "org-1",
          ccAttribution: [
            {
              address: "bo@example.com",
              contactPointId: null,
              mediumId: null,
              heldByThisRecord: false,
            },
          ],
        },
      });
      const entry = (body.cc_attribution as Record<string, unknown>[])[0]!;
      for (const key of Object.keys(entry)) expect(server).toContain(key);
      // And every field the server declares is one the client fills — an entry
      // missing `held_by_this_record` would store a Cc with no attribution.
      for (const field of server) expect(Object.keys(entry)).toContain(field);
    });

    it("can fail: a field the server does not declare is detected", () => {
      // FALSIFIABILITY. The four assertions above are only worth anything if the
      // reader can come back "missing" — a parse that silently returned every
      // name would pass them all.
      const server = fieldsOf("ReviewedGmailRequest", requestFile!);
      expect(server).not.toContain("recipient_organization_id");
    });
  },
);

it("says out loud when the cross-repo leg could not run", () => {
  if (!measurable) {
    console.warn(
      "UNMEASURED: the reviewed-send Pydantic models were not found at any of " +
        `${MODEL_SOURCES.join(", ")}, so features/crm/gmail/reviewed-send-contract.ts ` +
        "was NOT compared against the server. Set AIDREAM_DIR to the sibling checkout.",
    );
  }
  expect(true).toBe(true);
});
