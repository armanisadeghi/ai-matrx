/**
 * 🚨 F-74 — A FRESH PICK HANDS ITS RECORD STRAIGHT TO THE OPEN CONTROL.
 *
 * `registerSelectedGoogleFile`'s response now carries the `workbench.google_document`
 * Record the SAME request wrote (aidream F-57, R29): `recordId` / `recordSyncStatus`
 * on `SelectedGoogleFile`. `useOpenGoogleDocumentRecord` (`documents/openRecord.tsx`,
 * F-69) opens that id directly and spends no second read, no refresh call — but only
 * when the caller hands it through. The picked-resource inventory row every list
 * renders from (`GoogleConnectionResource`) has never carried these fields — they
 * exist only on the fresh registration answer — so a caller that renders straight off
 * the inventory after a pick still takes the slower read-then-refresh leg for the file
 * it JUST registered.
 *
 * Asserted statically, over source, the same way `write-gate.test.ts` proves the
 * review workspace's 202 branching: mounting either component needs the whole Google
 * connection inventory, the Drive picker, Redux and the Detail primitive, and a mock
 * deep enough to host either would prove less than the two things this reads — that
 * the fresh registration answer is captured, and that the render passed to
 * `pickedGoogleRecordResource` carries it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(file: string): string {
  return readFileSync(join(__dirname, file), "utf8");
}

describe("GoogleWorkspaceConnectBody", () => {
  const src = source("GoogleWorkspaceConnectBody.tsx");

  it("captures the registration's own recordId/recordSyncStatus, keyed by the picked-resource id", () => {
    const start = src.indexOf("const chooseFile = ()");
    const end = src.indexOf("return (", start);
    expect(start).toBeGreaterThan(0);
    const chooseFileBody = src.slice(start, end);
    expect(chooseFileBody).toContain("setFreshRecords(");
    expect(chooseFileBody).toContain("registered.recordId");
    expect(chooseFileBody).toContain("registered.recordSyncStatus");
    expect(chooseFileBody).toContain("[registered.id]");
  });

  it("merges the captured record onto the file passed to pickedGoogleRecordResource", () => {
    const call = src.match(/pickedGoogleRecordResource\(\{[\s\S]{0,150}?\}\)/)?.[0];
    expect(call).toBeTruthy();
    expect(call).toContain("...file");
    expect(call).toContain("...freshRecords[file.id]");
  });
});

describe("GoogleWorkspaceReviewWorkspace", () => {
  const src = source("GoogleWorkspaceReviewWorkspace.tsx");

  it("captures the registration's own recordId/recordSyncStatus, keyed by the picked-resource id", () => {
    const start = src.indexOf("const chooseFile = ()");
    const end = src.indexOf("recordToast.success", start);
    expect(start).toBeGreaterThan(0);
    const chooseFileBody = src.slice(start, end);
    expect(chooseFileBody).toContain("setFreshRecords(");
    expect(chooseFileBody).toContain("registered.recordId");
    expect(chooseFileBody).toContain("registered.recordSyncStatus");
    expect(chooseFileBody).toContain("[registered.id]");
  });

  it("merges the captured record onto the resource passed to pickedGoogleRecordResource", () => {
    const call = src.match(
      /pickedGoogleRecordResource\(\{[\s\S]{0,150}?\}\)/,
    )?.[0];
    expect(call).toBeTruthy();
    expect(call).toContain("...resource");
    expect(call).toContain("...freshRecords[resource.id]");
  });
});
