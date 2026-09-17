import { readFileSync } from "fs";
import { join } from "path";
import { mandateColumnsFor } from "../columns";
import { mandateCopyFor } from "../listConfig";
import type { MandateListRow } from "../types";

describe("organization mandate doors", () => {
  it("builds the table Job link from the host's route", () => {
    const columns = mandateColumnsFor(
      (row) => `/organizations/acme/settings/mandates/${row.mandate_key}`,
    );
    const job = columns.find((column) => column.id === "label")?.column;
    const href = job && "href" in job ? job.href : undefined;
    const row = {
      mandate_key: "flashcards.generate_cards",
    } as MandateListRow;

    expect(typeof href).toBe("function");
    expect(typeof href === "function" ? href(row) : null).toBe(
      "/organizations/acme/settings/mandates/flashcards.generate_cards",
    );
  });

  it("the organization host supplies its route to columns as well as row actions", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "app/(core)/organizations/[orgId]/settings/mandates/page.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("columns: mandateColumnsFor");
    expect(source).toContain("copy: mandateCopyFor");
    expect(source).toContain("orgMandateRoute(orgId, row)");
  });

  it("copies the same organization workspace route it displays", () => {
    const copy = mandateCopyFor(
      (row) => `/organizations/acme/settings/mandates/${row.mandate_key}`,
      "/organizations/acme/settings/mandates",
    );
    const row = {
      mandate_key: "flashcards.generate_cards",
      label: "Generate cards",
      resolved_layer: "system",
      resolved_agent_name: "Composer",
    } as MandateListRow;

    expect(copy.agentRow(row).href).toBe(
      "/organizations/acme/settings/mandates/flashcards.generate_cards",
    );
    expect(copy.location).toBe("/organizations/acme/settings/mandates");
  });
});
