/**
 * Pins THE RULE that a link chip's label must tell two links apart.
 *
 * A broken-image audit returned three evidence rows whose `src` values all
 * lived on one host. `UrlChip` labelled each with the bare domain, so the
 * table rendered three visually IDENTICAL chips reading "example.com" and the
 * reader could not tell which row was which — the path WAS the row's identity.
 * The label now carries the path's identifying tail everywhere a chip renders.
 */

import { urlChipLabel } from "../UrlChips";

describe("urlChipLabel", () => {
    it("gives same-host URLs distinct labels (the audit-evidence case)", () => {
        const labels = [
            "https://example.com/img/hero-old.png",
            "https://example.com/img/team-2019.jpg",
            "https://example.com/img/logo-alt.svg",
        ].map(urlChipLabel);

        expect(labels).toEqual([
            "example.com/…/hero-old.png",
            "example.com/…/team-2019.jpg",
            "example.com/…/logo-alt.svg",
        ]);
        expect(new Set(labels).size).toBe(3);
    });

    it("falls back to the bare domain when there is no path", () => {
        expect(urlChipLabel("https://example.com")).toBe("example.com");
        expect(urlChipLabel("https://www.example.com/")).toBe("example.com");
    });

    it("omits the ellipsis for a single-segment path", () => {
        expect(urlChipLabel("https://example.com/pricing")).toBe("example.com/pricing");
    });

    it("ignores a trailing slash when finding the identifying segment", () => {
        expect(urlChipLabel("https://example.com/docs/getting-started/")).toBe(
            "example.com/…/getting-started",
        );
    });

    it("lets the query stand in when the identity lives there", () => {
        expect(urlChipLabel("https://example.com/?page_id=42")).toBe("example.com/?page_id=42");
    });

    it("percent-decodes the segment for display", () => {
        expect(urlChipLabel("https://example.com/files/Q3%20report.pdf")).toBe(
            "example.com/…/Q3 report.pdf",
        );
    });

    it("shows junk that is not a URL as-is", () => {
        expect(urlChipLabel("  not a url  ")).toBe("not a url");
    });
});
