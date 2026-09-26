/**
 * The latest code-scan references are read in ONE database call, filtered in
 * the database — never paged through the view (2026-09-26: 13 pages of
 * `mandate.v_reference_latest`, each re-walking 4.27M history rows, timed out
 * and the admin mandate list printed the raw Postgres string).
 */

const rpc = jest.fn();
const categories = [
  { id: "type-bypass", slug: "bypass" },
  { id: "type-unclassified", slug: "unclassified" },
  { id: "type-declaration", slug: "declaration" },
];

function tableRead(rows: unknown[]) {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
  };
  return query;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (name: string) => {
      if (name === "mandate") return { rpc: (...args: unknown[]) => rpc(...args) };
      if (name === "platform") {
        return {
          from: (table: string) =>
            tableRead(table === "categories" ? categories : [{ slug: "aidream", github_full_name: "o/aidream" }]),
        };
      }
      throw new Error(`unexpected schema ${name}`);
    },
    from: () => {
      throw new Error("the view must not be read directly");
    },
  },
}));
jest.mock("@/lib/supabase/authRetry", () => ({
  runWithSessionRetry: (fn: () => unknown) => fn(),
}));

import { fetchMandateSourceFacts, fetchReferenceFindings, fetchUnconvertedCalls } from "../data";
import { plainFailureReason } from "@/lib/entity-list/failure";

const row = (over: Record<string, unknown>) => ({
  identity_hash: "h1",
  mandate_key: "chat.title",
  reference_type_id: "type-declaration",
  repo_slug: "aidream",
  package_name: null,
  language: "python",
  file_path: "a.py",
  symbol: null,
  line: 3,
  revision: "abc1234",
  revision_kind: "candidate",
  presence: "present",
  flag: "ok",
  ...over,
});

beforeEach(() => rpc.mockReset());

describe("readLatestReferences — one call, filtered in the database", () => {
  it("Unconverted asks for bypass rows only, once", async () => {
    rpc.mockResolvedValue({ data: [row({ reference_type_id: "type-bypass", symbol: "import openai" })], error: null });
    const calls = await fetchUnconvertedCalls();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("latest_references", { p_type_ids: ["type-bypass"] });
    expect(calls).toHaveLength(1);
    expect(calls[0].calls).toBe("openai");
  });

  it("Health asks for problems only, once", async () => {
    rpc.mockResolvedValue({ data: [row({ flag: "broken" })], error: null });
    const findings = await fetchReferenceFindings();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("latest_references", { p_problems_only: true });
    expect(findings[0].flag).toBe("broken");
  });

  it("source facts exclude bypass/unclassified and pass the page's keys, once", async () => {
    rpc.mockResolvedValue({ data: [row({})], error: null });
    const facts = await fetchMandateSourceFacts(["chat.title"]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("latest_references", {
      p_exclude_type_ids: ["type-bypass", "type-unclassified"],
      p_keys: ["chat.title"],
    });
    expect(facts.get("chat.title")?.declaredIn).toEqual(["aidream"]);
  });

  it("a database failure keeps its code so the screen can word it", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "canceling statement due to statement timeout", code: "57014", details: null, hint: null },
    });
    const failure = await fetchUnconvertedCalls().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as { code?: string }).code).toBe("57014");
    expect(plainFailureReason(failure)).toBe("took too long to answer");
  });
});

describe("plainFailureReason — words, never the raw string", () => {
  it("names a timeout, a refusal, a network loss and anything else", () => {
    expect(
      plainFailureReason(
        "readAllRows(mandate.v_reference_latest): query failed — canceling statement due to statement timeout",
      ),
    ).toBe("took too long to answer");
    expect(plainFailureReason(Object.assign(new Error("no"), { code: "42501" }))).toBe(
      "is not available to your account",
    );
    expect(plainFailureReason(new TypeError("Failed to fetch"))).toBe("could not be reached");
    expect(plainFailureReason(new Error("relation does not exist"))).toBe("could not be loaded");
  });
});
