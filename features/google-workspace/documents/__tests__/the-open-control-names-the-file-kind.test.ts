/**
 * 🚨 F-66 — THE OPEN CONTROL NAMES **THIS FILE'S** KIND, NOT A GUESS FROM THE
 * FAMILY. `DetailBody`'s own derivation only ever sees `health.source`, and
 * this record's source answers for a whole family ("Google Docs, Sheets &
 * Drive files"), so its best guess is "Open in Google" — true of every file
 * in the family, but not what a person can tell by looking at the row. This
 * registration reads the row's own `mime_kind` — the same field
 * `googleFileHref` (`GoogleDocumentPanel.tsx`) branches on to pick the URL
 * shape — and answers with the exact kind: a Doc, a Sheet, or a plain Drive
 * file get three different, honest sentences.
 */

import { googleDocumentOpenAtSourceLabel } from "../record";

describe("googleDocumentOpenAtSourceLabel", () => {
  it("names Docs for a document", () => {
    expect(googleDocumentOpenAtSourceLabel("document")).toBe("Open in Google Docs");
  });

  it("names Sheets for a spreadsheet", () => {
    expect(googleDocumentOpenAtSourceLabel("spreadsheet")).toBe("Open in Google Sheets");
  });

  it("names Drive for every other kind (a Slides deck arrives as `other`)", () => {
    expect(googleDocumentOpenAtSourceLabel("other")).toBe("Open in Google Drive");
  });

  it("falls back to Drive for a kind this registration does not recognise", () => {
    expect(googleDocumentOpenAtSourceLabel("some-future-kind")).toBe("Open in Google Drive");
  });
});
