import { fetchDirectiveCatalog } from "@/features/directive-catalog/service";
import {
  DIRECTIVE_VERBS,
  type DirectiveCatalog,
} from "@/features/directive-catalog/types";
import { kindValidator } from "@/features/content-ir/registry/kind-schema-source";
import { alchemyReferencePort } from "./alchemy-references";

jest.mock("@/features/directive-catalog/service", () => ({
  fetchDirectiveCatalog: jest.fn(),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => ({}) }),
}));
jest.mock("@/lib/redux/slices/apiConfigSlice", () => ({
  selectResolvedBaseUrl: () => "https://server.example.test",
}));
jest.mock("@/features/content-ir/registry/kind-schema-source", () => ({
  kindValidator: { validate: jest.fn(), cachedSchema: jest.fn(), invalidate: jest.fn() },
}));

const fetchCatalog = jest.mocked(fetchDirectiveCatalog);
const legacyKindValidation = jest.mocked(kindValidator.validate);

/** Reduced verbatim from the live /directives/catalog capture. Reference uses identity_fields, never schemas. */
const LIVE_REFERENCE_NOUNS = {
  dataset: {
    family: "Other",
    table: "workbench.udt_datasets",
    identity_fields: ["id"],
  },
  table_schema: {
    family: "Derived shapes",
    table: "",
    identity_fields: ["table_id"],
  },
  table_row: {
    family: "Derived shapes",
    table: "",
    identity_fields: ["table_id", "row_id"],
  },
  note: {
    family: "Sources & Outputs",
    table: "workbench.notes",
    identity_fields: ["id"],
  },
  task: {
    family: "Workspaces",
    table: "workspace.tasks",
    identity_fields: ["id"],
  },
} as const;

function liveCatalog(
  ...nouns: (keyof typeof LIVE_REFERENCE_NOUNS)[]
): DirectiveCatalog {
  return {
    directive_version: 1,
    // The class axis the live catalog ships (aidream `NOUN_CLASSES`), mirrored
    // here from the one client-side list rather than re-typed.
    classes: [...DIRECTIVE_VERBS],
    nouns: nouns.map((noun) => {
      const captured = LIVE_REFERENCE_NOUNS[noun];
      return {
        noun,
        family: captured.family,
        table: captured.table,
        reference: "yes",
        view: "yes",
        create: "no",
        update: "no",
        delete: "no",
        identity_fields: [...captured.identity_fields],
      };
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // This is the observed old failure: a directive is not a content-ir kind.
  legacyKindValidation.mockResolvedValue({
    kind: "directive_v1_reference_dataset",
    checked: false,
    ok: false,
    errors: ['kind "directive_v1_reference_dataset" is not registered in content_ir.kind_definition'],
    degradedReason: "kind_not_registered",
  });
});

it.each([
  ["dataset", { id: "table-identity", label: "Table" }],
  ["table_schema", { table_id: "table-identity" }],
  ["table_row", { table_id: "table-identity", row_id: "row-identity" }],
  ["note", { id: "note-identity" }],
  ["task", { id: "task-identity" }],
] as const)("copies %s through its live directive identity contract", async (noun, item) => {
  fetchCatalog.mockResolvedValue(liveCatalog(noun));

  await expect(
    alchemyReferencePort.build({ id: noun, label: noun, noun, items: [item] }),
  ).resolves.toBe(
    `\`\`\`matrx\n{"__kind":"directive_v1_reference_${noun}","items":[${JSON.stringify(item)}]}\n\`\`\``,
  );

  expect(fetchCatalog).toHaveBeenCalledWith("https://server.example.test");
  expect(legacyKindValidation).not.toHaveBeenCalled();
});

it("rejects a table row missing its live row identity", async () => {
  fetchCatalog.mockResolvedValue(liveCatalog("table_row"));

  await expect(
    alchemyReferencePort.build({
      id: "table-row",
      label: "Table row",
      noun: "table_row",
      items: [{ table_id: "table-identity" }],
    }),
  ).rejects.toThrow("reference identity is incomplete");
});

it.each(["", "   "])("rejects an empty dataset identity %p", async (id) => {
  fetchCatalog.mockResolvedValue(liveCatalog("dataset"));

  await expect(
    alchemyReferencePort.build({
      id: "dataset",
      label: "Dataset",
      noun: "dataset",
      items: [{ id }],
    }),
  ).rejects.toThrow("reference identity is incomplete");
});

it("fails closed when the live directive catalog is unavailable", async () => {
  fetchCatalog.mockRejectedValue(new Error("catalog unavailable"));

  await expect(
    alchemyReferencePort.build({
      id: "dataset",
      label: "Dataset",
      noun: "dataset",
      items: [{ id: "table-identity" }],
    }),
  ).rejects.toThrow("could not load the directive catalog (catalog unavailable)");
});

it("rejects a noun absent from the live directive catalog", async () => {
  fetchCatalog.mockResolvedValue(liveCatalog("dataset"));

  await expect(
    alchemyReferencePort.build({
      id: "missing",
      label: "Missing",
      noun: "not_registered",
      items: [{ id: "record-identity" }],
    }),
  ).rejects.toThrow('"not_registered" is not a registered reference noun');
});
