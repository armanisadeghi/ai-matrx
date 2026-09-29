/**
 * The enum route defaults to the public schema. Its first paint must honor that
 * default rather than briefly rendering every schema until an effect runs.
 */
import React from "react";
import { renderToString } from "react-dom/server";
import type { DatabaseEnum } from "@/types/enum-types";
import { useEnums } from "./useEnums";

jest.mock("@/actions/admin/enum-functions", () => ({
  getDatabaseEnums: jest.fn(),
  searchEnums: jest.fn(),
  createEnum: jest.fn(),
  updateEnum: jest.fn(),
  deleteEnum: jest.fn(),
  getEnumUsage: jest.fn(),
}));

const INITIAL_ENUMS: DatabaseEnum[] = [
  { name: "zebra_status", schema: "public", values: ["active"] },
  { name: "audit_action", schema: "audit", values: ["created"] },
  { name: "alpha_status", schema: "public", values: ["draft"] },
];

function FirstPaint() {
  const { enums } = useEnums({
    initialData: INITIAL_ENUMS,
    defaultFilter: { schema: "public" },
    defaultSort: { field: "name", direction: "asc" },
  });
  return <output>{enums.map((enumType) => enumType.name).join(",")}</output>;
}

it("filters and sorts initial enum data before effects can run", () => {
  // Server rendering does not execute effects, which makes this the actual
  // first-render contract rather than a post-effect assertion.
  const html = renderToString(<FirstPaint />);

  expect(html).toContain("alpha_status,zebra_status");
  expect(html).not.toContain("audit_action");
});
