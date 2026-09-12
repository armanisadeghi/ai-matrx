/**
 * THE ONE CONFIRMATION BADGE (DD-131 slice residue).
 *
 * `RecordConfirmationBadge.tsx` (chat block chrome) and
 * `studio/records/ConfirmationBadge.tsx` (the datasets grid) used to be two
 * separate drawings of `content_ir.kind_instance.confirmation`, each file's
 * own docstring claiming to be "the one drawing". This pins that there is now
 * exactly one component, rendered by both surfaces through a `variant` prop,
 * not two components that happen to agree today.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConfirmationBadge,
  type RecordConfirmation,
} from "../records/ConfirmationBadge";

// The chat block chrome's own usage (`KindRecordChrome.tsx`): no variant, no
// archive prop — the neutral pill for running text.
function ChatChromeBadge({ confirmation }: { confirmation: RecordConfirmation }) {
  return <ConfirmationBadge confirmation={confirmation} />;
}

// The datasets grid's own usage (`studio/records/buildRecordColumns.tsx`):
// `variant="grid"` plus the separate archive axis.
function DatasetsGridBadge({
  confirmation,
  archivedAt,
}: {
  confirmation: RecordConfirmation;
  archivedAt: string | null;
}) {
  return (
    <ConfirmationBadge confirmation={confirmation} archivedAt={archivedAt} variant="grid" />
  );
}

describe("the confirmation badge is drawn once, not twice", () => {
  it("the chat chrome renders the shared component, neutral pill, no uppercase", () => {
    const html = renderToStaticMarkup(<ChatChromeBadge confirmation="unconfirmed" />);
    expect(html).toContain("Unconfirmed");
    // The grid's loud chip uses `uppercase`; the chrome pill never does.
    expect(html).not.toContain("uppercase");
  });

  it("the datasets grid renders the SAME shared component, loud chip + archive axis", () => {
    const html = renderToStaticMarkup(
      <DatasetsGridBadge confirmation="unconfirmed" archivedAt="2026-09-12T00:00:00Z" />,
    );
    expect(html).toContain("Unconfirmed");
    expect(html).toContain("uppercase");
    expect(html).toContain("Archived");
  });

  it("both surfaces agree on the confirmed state through the one component", () => {
    const chrome = renderToStaticMarkup(<ChatChromeBadge confirmation="confirmed" />);
    const grid = renderToStaticMarkup(
      <DatasetsGridBadge confirmation="confirmed" archivedAt={null} />,
    );
    expect(chrome).toContain("Confirmed");
    expect(grid).toContain("Confirmed");
    // Neither the chrome usage nor the grid usage renders the archive chip
    // when there is nothing archived.
    expect(grid).not.toContain("Archived");
  });

  it("there is exactly one confirmation-badge module left in the repo", () => {
    // Guards against a second drawing reappearing beside this one — the exact
    // defect this test file exists to close.
    const fs = require("fs");
    const path = require("path");
    const repoRoot = path.resolve(__dirname, "../../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/ConfirmationBadge\.tsx$/.test(entry.name)) {
          hits.push(path.relative(repoRoot, full));
        }
      }
    };
    walk(path.join(repoRoot, "features", "content-ir"));
    expect(hits).toEqual(["features/content-ir/records/ConfirmationBadge.tsx"]);
  });
});
