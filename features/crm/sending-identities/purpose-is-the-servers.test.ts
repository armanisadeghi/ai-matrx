// features/crm/sending-identities/purpose-is-the-servers.test.ts
//
// CENSUS — `purpose` IS THE SERVER'S WORD, AND THE STATES THIS CLIENT RENDERS ARE
// THE STATES THE SERVER DECLARES.
//
// `./purpose.ts` reads five fields lane B-26 added to the read side — `purpose` and
// `purpose_note` on `SendingIdentityView`, `recorded_for_audit` and
// `promotion_note` on `ConnectableMailbox`, and the `purpose` query the listing
// takes — and `pnpm sync-types` cannot run in this container (the two exact
// failures are in `features/crm/gmail/reviewed-send-contract.ts`'s header). So the
// shapes are declared in the feature and measured here, the same way the
// reviewed-send wire contract is.
//
// This is the leg that makes `./purpose.test.ts` worth anything: without it, that
// file would be feeding its author's own guess to its author's own reader.
//
// A missing checkout prints UNMEASURED and passes. A missing FIELD FAILS.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONNECTABLE_PURPOSE_FIELDS,
  CONNECT_CORRESPONDENCE_FALLBACK_SENTENCE,
  DEFAULT_PURPOSE_FILTER,
  SENDING_IDENTITY_PURPOSE_FIELDS,
  SENDING_PURPOSE_CORRESPONDENCE,
  SENDING_PURPOSE_OUTREACH,
  connectableStateOf,
  correspondenceRowSentence,
} from "./purpose";

const AIDREAM_ROOT =
  process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");
const SERVICE_DIR = join(
  AIDREAM_ROOT,
  "aidream",
  "services",
  "sending_identity",
);
const MODELS = join(SERVICE_DIR, "models.py");
const REGISTRATION = join(SERVICE_DIR, "registration.py");
const SERVICE = join(SERVICE_DIR, "service.py");
const ROUTER = join(
  AIDREAM_ROOT,
  "aidream",
  "api",
  "routers",
  "sending_identities.py",
);

const measurable =
  existsSync(MODELS) &&
  existsSync(REGISTRATION) &&
  existsSync(SERVICE) &&
  existsSync(ROUTER);

/** The field names one Pydantic model declares — same reader as the wire census. */
function fieldsOf(className: string, path: string): string[] {
  const source = readFileSync(path, "utf8");
  const start = source.search(new RegExp(`^class ${className}\\(`, "m"));
  if (start < 0) {
    throw new Error(`${path} no longer declares class ${className}.`);
  }
  const rest = source.slice(start);
  const end = rest.slice(1).search(/^(class |@|def |# ─)/m);
  const block = end < 0 ? rest : rest.slice(0, end + 1);
  const fields = [...block.matchAll(/^ {4}([a-z_][a-z0-9_]*)\s*:\s*\S/gm)].map(
    (match) => match[1]!,
  );
  if (fields.length === 0) {
    throw new Error(
      `${path} class ${className} parsed to ZERO fields. Fix this reader rather ` +
        "than deleting the check — a census that measures nothing is worse than none.",
    );
  }
  return fields;
}

/** `PURPOSE_CORRESPONDENCE = "correspondence"` → the string the server uses. */
function constantValue(name: string, source: string): string | null {
  const match = new RegExp(`^${name}\\s*=\\s*["']([^"']+)["']`, "m").exec(source);
  return match ? match[1]! : null;
}

(measurable ? describe : describe.skip)(
  "purpose against the live aidream sending-identity service",
  () => {
    it("compares against the server's own purpose values", () => {
      const source = readFileSync(REGISTRATION, "utf8");
      expect(constantValue("PURPOSE_CORRESPONDENCE", source)).toBe(
        SENDING_PURPOSE_CORRESPONDENCE,
      );
      expect(constantValue("PURPOSE_OUTREACH", source)).toBe(
        SENDING_PURPOSE_OUTREACH,
      );
    });

    it("can fail: a constant the server does not declare is detected", () => {
      // FALSIFIABILITY — the assertions above are worth nothing if the reader
      // cannot come back empty.
      const source = readFileSync(REGISTRATION, "utf8");
      expect(constantValue("PURPOSE_TRANSACTIONAL", source)).toBeNull();
    });

    it("reads the purpose fields SendingIdentityView declares", () => {
      const server = fieldsOf("SendingIdentityView", MODELS);
      for (const field of SENDING_IDENTITY_PURPOSE_FIELDS) {
        expect(server).toContain(field);
      }
      // FALSIFIABILITY: the reader can come back missing.
      expect(server).not.toContain("purpose_label");
    });

    it("reads the connectable fields ConnectableMailbox declares", () => {
      const server = fieldsOf("ConnectableMailbox", MODELS);
      for (const field of CONNECTABLE_PURPOSE_FIELDS) {
        expect(server).toContain(field);
      }
      // `already_used` still exists and still means something — the client's
      // blocked branch prints its sentence.
      expect(server).toContain("already_used");
    });

    it("asks for the purpose the listing route accepts, and its default", () => {
      const router = readFileSync(ROUTER, "utf8");
      // The query parameter exists, and `outreach` is the default the page relies
      // on. A rename here would otherwise silently list audit rows again (W1).
      expect(router).toMatch(
        /purpose: IdentityPurposeFilter = Query\(\s*\n\s*default="outreach"/,
      );
      expect(DEFAULT_PURPOSE_FILTER).toBe("outreach");
      // And every value this client can send is one the service accepts.
      const service = readFileSync(SERVICE, "utf8");
      expect(service).toMatch(
        /if purpose not in \(PURPOSE_OUTREACH, PURPOSE_CORRESPONDENCE, "all"\)/,
      );
    });

    it("renders the server's own purpose sentence, not a re-worded one", () => {
      // `PURPOSE_NOTES` is the ONE copy; the client prints what the row carries.
      const models = readFileSync(MODELS, "utf8");
      const notes = models.slice(models.indexOf("PURPOSE_NOTES"));
      const correspondence = /"correspondence": \(\s*\n\s*"([^"]+)"\s*\n\s*"([^"]+)"/.exec(
        notes,
      );
      expect(correspondence).not.toBeNull();
      const serverSentence = `${correspondence![1]}${correspondence![2]}`;
      expect(
        correspondenceRowSentence({
          from_address: "ada@gmail.com",
          purpose_note: serverSentence,
        }),
      ).toBe(`ada@gmail.com — ${serverSentence}`);
      // And the client's fallback — used only for a row with no note — says the
      // same thing rather than reading as a broken outreach mailbox.
      const fallback = correspondenceRowSentence({
        from_address: "ada@gmail.com",
      });
      expect(fallback).toContain("Recorded for audit");
      // "not set up to run campaigns" is a FACT about the mailbox; what must never
      // appear is the outreach setup demand nobody can perform on gmail.com.
      expect(fallback).not.toMatch(/prove you own|publish|DNS|TXT record/i);
    });

    it("uses the server's promotion note for a mailbox recorded for audit", () => {
      const service = readFileSync(SERVICE, "utf8");
      const promotion = /promotion_note=\(\s*\n\s*"([^"]+)"\s*\n\s*"([^"]+)"\s*\n\s*"([^"]+)"/.exec(
        service,
      );
      expect(promotion).not.toBeNull();
      const serverSentence = `${promotion![1]}${promotion![2]}${promotion![3]}`;
      // The client's fallback is the same sentence, so a row from a server that
      // has not shipped the note reads identically instead of saying nothing.
      expect(CONNECT_CORRESPONDENCE_FALLBACK_SENTENCE).toBe(serverSentence);
      expect(
        connectableStateOf({
          can_send: true,
          recorded_for_audit: true,
          promotion_note: serverSentence,
        }),
      ).toEqual({ kind: "recorded_for_audit", sentence: serverSentence });
    });

    it("never calls an audit row 'already used' — the server no longer does", () => {
      const service = readFileSync(SERVICE, "utf8");
      // `used` excludes correspondence rows, which is what makes the promotion
      // reachable at all (W1). A regression here brings the false sentence back.
      expect(service).toMatch(
        /used = \{[\s\S]{0,400}!= PURPOSE_CORRESPONDENCE/,
      );
    });
  },
);

it("says out loud when the cross-repo leg could not run", () => {
  if (!measurable) {
    console.warn(
      `UNMEASURED: the sending-identity service was not found under ${AIDREAM_ROOT}, ` +
        "so features/crm/sending-identities/purpose.ts was NOT compared against the " +
        "server. Set AIDREAM_DIR to the sibling checkout.",
    );
  }
  expect(true).toBe(true);
});
