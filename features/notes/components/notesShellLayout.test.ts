/**
 * A PHONE NEVER DECIDES THE DESKTOP'S SIDEBAR (page-pass /notes 2026-09-28).
 * Breaks: a phone width gets a bucket (it would persist its squeezed,
 * collapsed split) → "phone" red; laptop and desktop share one cookie →
 * "per breakpoint" red; a damaged cookie throws on the server → "parse" red.
 */
import { NOTES_SHELL_LAYOUT_COOKIE, notesShellBucket, parseNotesShellLayout } from "./notesShellLayout";

describe("notes sidebar split per breakpoint", () => {
  it("phone: a phone width never persists", () => {
    expect(notesShellBucket(375)).toBeNull();
    expect(notesShellBucket(767)).toBeNull();
  });
  it("per breakpoint: laptop and desktop keep their own cookie", () => {
    expect(notesShellBucket(1024)).toBe("md");
    expect(notesShellBucket(1280)).toBe("wide");
    expect(NOTES_SHELL_LAYOUT_COOKIE.md).not.toBe(NOTES_SHELL_LAYOUT_COOKIE.wide);
    // The old shared cookie (poisoned by phones) is never read again.
    expect(Object.values(NOTES_SHELL_LAYOUT_COOKIE)).not.toContain("panels:notes-shell");
  });
  it("parse: a damaged cookie is ignored, a good one round-trips", () => {
    expect(parseNotesShellLayout("%7Bnot-json")).toBeUndefined();
    expect(parseNotesShellLayout(encodeURIComponent(JSON.stringify({ "notes-sidebar": 22, "notes-main": 78 })))).toEqual({ "notes-sidebar": 22, "notes-main": 78 });
  });
});
