/**
 * The paste-text landing (SOURCE-CONVERGENCE §8.1 "Add → Paste text").
 *
 * What the door requires, pinned: one `section` portion whose ordinal starts
 * at 1 (a 0 was refused live with 422 on 2026-09-26), `origin_client='web'`,
 * `capture_method='native'`, kind `inline` with NO source id (the door mints
 * it), and an identity that is the text itself — so pasting the same text
 * twice names the same Source.
 */
import { webcrypto } from "node:crypto";
import {
  PASTED_TEXT_SOURCE_KIND,
  buildPastedTextLanding,
  pastedTextName,
} from "@/features/sources/api/pastedText";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  }
});

const base = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  now: new Date("2026-09-26T00:00:00Z"),
};

describe("buildPastedTextLanding", () => {
  it("lands one section portion, ordinal 1, as web/native inline text with no source id", async () => {
    const body = await buildPastedTextLanding({ ...base, text: "# Title\nBody text here." });
    expect(body.source_kind).toBe(PASTED_TEXT_SOURCE_KIND);
    expect(body.source_kind).toBe("inline");
    expect(body.source_id).toBeNull();
    expect(body.portions).toHaveLength(1);
    expect(body.portions[0]).toMatchObject({ ordinal: 1, kind: "section", method: "native" });
    expect(body.portions[0].text).toBe("# Title\nBody text here.");
    expect(body.provenance).toMatchObject({ origin_client: "web", capture_method: "native", user_id: base.userId });
    expect(body.organization_id).toBe(base.organizationId);
    // Arman 2026-09-26: a Source is organization data — no per-Source privacy choice.
    expect(body.visibility).toBe("internal");
    expect(body.keep).toBe(false);
    expect(body.mime_type).toBe("text/plain");
  });

  it("names the same Source for the same text (identity is the text's hash)", async () => {
    const a = await buildPastedTextLanding({ ...base, text: "Same words.\n" });
    const b = await buildPastedTextLanding({ ...base, text: "  Same words.  " });
    const c = await buildPastedTextLanding({ ...base, text: "Different words." });
    expect(a.canonical_identity).toMatch(/^pasted-text:[0-9a-f]{64}$/);
    expect(a.canonical_identity).toBe(b.canonical_identity);
    expect(a.canonical_identity).not.toBe(c.canonical_identity);
  });

  it("refuses empty text in words, before any request", async () => {
    await expect(buildPastedTextLanding({ ...base, text: "   \n " })).rejects.toThrow(
      "There is no text to save. Paste something first.",
    );
  });
});

describe("pastedTextName", () => {
  it("uses the given name, else the first non-empty line without a heading marker", () => {
    expect(pastedTextName("x", "  My note ")).toBe("My note");
    expect(pastedTextName("\n\n## Heading line\nmore")).toBe("Heading line");
    expect(pastedTextName("   ")).toBe("Pasted text");
  });

  it("shortens a long first line to 80 characters with an ellipsis", () => {
    const name = pastedTextName("a".repeat(200));
    expect(name).toHaveLength(80);
    expect(name.endsWith("…")).toBe(true);
  });
});
