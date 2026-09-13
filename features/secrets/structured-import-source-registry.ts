export type StructuredImportSource = {
  id: "bitwarden_json" | "1password_1pux" | "proton_pass";
  accept: string;
  supportsDeleted: boolean;
  supportsArchived: boolean;
  parseError: string;
  timeoutError: string;
  loadWorker: () => Promise<{
    create: () => Worker;
    cancel: (worker: Worker, requestId: string) => void;
  }>;
};

const sources: Record<StructuredImportSource["id"], StructuredImportSource> = {
  bitwarden_json: {
    id: "bitwarden_json",
    accept: ".json,application/json",
    supportsDeleted: true,
    supportsArchived: false,
    parseError: "The JSON export could not be read.",
    timeoutError:
      "The JSON export took too long to parse. Choose a smaller export and try again.",
    loadWorker: async () => {
      const client = await import("./bitwarden-json-worker-client");
      return {
        create: client.createBitwardenJsonWorker,
        cancel: client.cancelBitwardenJsonWorker,
      };
    },
  },
  "1password_1pux": {
    id: "1password_1pux",
    accept: ".1pux,application/zip",
    supportsDeleted: true,
    supportsArchived: true,
    parseError: "The 1Password archive could not be read.",
    timeoutError:
      "The 1Password archive took too long to parse. Choose a smaller export and try again.",
    loadWorker: async () => {
      const client = await import("./onepux-worker-client");
      return {
        create: client.createOnePuxWorker,
        cancel: client.cancelOnePuxWorker,
      };
    },
  },
  proton_pass: {
    id: "proton_pass",
    accept: ".json,.zip,application/json,application/zip",
    supportsDeleted: true,
    supportsArchived: false,
    parseError: "The Proton Pass export could not be read.",
    timeoutError:
      "The Proton Pass export took too long to parse. Choose a smaller export and try again.",
    loadWorker: async () => {
      const client = await import("./proton-pass-worker-client");
      return {
        create: client.createProtonPassWorker,
        cancel: client.cancelProtonPassWorker,
      };
    },
  },
};

export function structuredImportSource(
  source: string,
): StructuredImportSource | undefined {
  return source === "bitwarden_json" ||
    source === "1password_1pux" ||
    source === "proton_pass"
    ? sources[source]
    : undefined;
}
