/**
 * PROTEXTAREA'S CONTROLS NEVER COVER TEXT (the class of the ProInput fix,
 * page-pass 2026-09-27). With a submit button the mic + "…" cluster sat at the
 * top, where a desktop field reserves no space, and covered the first line on
 * hover. It now shares the reserved submit row.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clusterPlacementProblems,
  proTextareaClusterPlacement,
} from "@/components/official/proTextareaControlPlacement";

describe("ProTextarea's control cluster sits in a reserved row", () => {
  it.each([true, false])("with submit=%s it covers neither text nor the submit button", (hasSubmit) => {
    expect(clusterPlacementProblems(proTextareaClusterPlacement(hasSubmit))).toEqual([]);
  });

  it("names the old defect: a top cluster over an unreserved first line", () => {
    expect(
      clusterPlacementProblems({
        row: "top",
        rightPx: 0,
        reserved: { fine: ["bottom"], coarse: ["top", "bottom"] },
        submit: { row: "bottom", widthPx: 44 },
        className: "",
      }),
    ).toEqual(["on a fine pointer the top row is not reserved, so the cluster covers text on hover"]);
  });

  it("the component draws its cluster from this placement", () => {
    const source = readFileSync(path.join(__dirname, "..", "ProTextarea.tsx"), "utf8");
    expect(source).toContain("proTextareaClusterPlacement(!!onSubmit).className");
  });

  it("the reserved row is merged AFTER the caller's className, so a caller's padding cannot erase it", () => {
    // Feedback window (page-pass 2026-09-27): className "py-2" came last and
    // tailwind-merge dropped pb-10 — the cluster sat on the last line again.
    const source = readFileSync(path.join(__dirname, "..", "ProTextarea.tsx"), "utf8");
    const reserve = source.indexOf('"pb-11"');
    const callerClass = source.lastIndexOf("      className,\n", reserve);
    expect(reserve).toBeGreaterThan(0);
    expect(callerClass).toBeGreaterThan(0);
    expect(source.slice(callerClass, reserve)).not.toContain(");");
  });
});
