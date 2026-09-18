// 🚨 N14 (VERIFY-U-W1-U-W2) — THE CONTROL THAT OPENS THE RECORD WHERE IT LIVES
// NAMES THAT PLACE.
//
// The strip already knows the source: it prints `health.source` two spans to the
// left ("Google Docs, Sheets & Drive files", "Search Console"). The one control
// that actually leaves for it was labelled "Open at source" — a developer's
// phrase, and the only place on the record where the person's own word for where
// their file lives was thrown away.
//
// The rule the label follows, and why it is not simply `health.source`: one
// producer answers for a whole product family (the Docs strip's source covers
// Docs, Sheets AND Slides), so a source naming several things is cut back to the
// provider word — "Open in Google" is true of every file in it, "Open in Google
// Docs" would mislabel a spreadsheet. A short source is a place, and is used
// whole. No source at all keeps the generic phrase, because inventing one would
// be the screen guessing.

import * as React from "react";
import { act } from "react";

import { DetailBody } from "../core/DetailBody";
import { useDetailCore } from "../core/useDetailCore";
import type { DetailRecordType, DetailSourceHealth } from "../types";
import { FILE_TYPE, instance, makePorts, mount } from "./harness";

const ROW = { file_name: "Q3 plan.gdoc", provider: "google" };

function synced(health: DetailSourceHealth): DetailRecordType {
  return { ...FILE_TYPE, load: async () => ({ row: ROW }), health: () => health };
}

function Body() {
  const core = useDetailCore(instance(), "window", { onClose: () => {} });
  return <DetailBody core={core} />;
}

async function labelFor(source: string, openAtSourceLabel?: string): Promise<string> {
  const ports = makePorts({
    resolveType: () =>
      synced({
        source,
        grant: "ok",
        grantDetail: null,
        lastRefreshedAt: null,
        openAtSourceHref: "https://docs.google.com/document/d/abc/edit",
        ...(openAtSourceLabel !== undefined ? { openAtSourceLabel } : {}),
      }),
  });
  const m = mount(<Body />, ports);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const link = m.container.querySelector<HTMLAnchorElement>("[data-detail-health] a");
  const text = link?.textContent?.trim() ?? "";
  m.unmount();
  return text;
}

describe("the open-at-source control", () => {
  it("names the provider when one producer answers for a family of products", async () => {
    expect(await labelFor("Google Docs, Sheets & Drive files")).toBe("Open in Google");
  });

  it("uses a short source whole", async () => {
    expect(await labelFor("Search Console")).toBe("Open in Search Console");
    expect(await labelFor("Google Drive")).toBe("Open in Google Drive");
  });

  it("keeps the generic phrase when the source says nothing", async () => {
    expect(await labelFor("  ")).toBe("Open at source");
  });

  // 🚨 F-66 — a per-kind label wins. `source` for the Docs family answers for
  // three products at once ("Google Docs, Sheets & Drive files"), so the
  // derivation above can only ever say "Open in Google" — a registration that
  // knows the ROW's own kind (a Doc, not a Sheet, not a plain Drive file) sets
  // `openAtSourceLabel` and it must win over the family-wide guess.
  it("prefers the producer's own openAtSourceLabel over the derived family guess", async () => {
    expect(
      await labelFor("Google Docs, Sheets & Drive files", "Open in Google Sheets"),
    ).toBe("Open in Google Sheets");
  });
});
