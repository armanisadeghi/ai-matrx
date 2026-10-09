/**
 * The remount-safety harness catches every break it claims to catch.
 *
 * SUT: `runCycle` + `expectRemountSafe` / `expectQuiet`
 * (`remount-safety/harness.tsx`). Each synthetic tile below commits exactly
 * one violation of the law; the law must reject each one, and accept the tile
 * that keeps its work in the saved source and reads nothing twice. If any of
 * these goes green, every per-type case in this suite is fiction.
 */

jest.mock("@/utils/supabase/client", () => {
  const { createFakeSupabase } = jest.requireActual("./remount-safety/fake-backend");
  const client = createFakeSupabase();
  return { createClient: () => client, supabase: client };
});
jest.mock("next/navigation", () => jest.requireActual("./remount-safety/next-navigation"));

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { supabase as typedClient } from "@/utils/supabase/client";

/** The probes call tables and RPCs no real schema has; they only need the client's shape. */
interface LooseQuery extends PromiseLike<unknown> {
  select(columns: string): LooseQuery;
  insert(row: Record<string, unknown>): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
}
const supabase = typedClient as unknown as {
  schema(name: string): { from(table: string): LooseQuery };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<unknown>;
};
import { useRouter } from "next/navigation";
import type { BoardItemType, ItemBodyProps } from "../items/types";
import { expectQuiet, expectRemountSafe, runCycle, typeInto, type CycleResult } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import { seed } from "./remount-safety/fake-backend";

installBrowserGaps();

const LEASE = "Lease for Unit 4B renews on November 30.";
const RECORD = [/^workbench\.notes$/];

function itemType(Body: BoardItemType["Body"]): BoardItemType {
  return {
    key: "harness-probe",
    label: "Probe",
    icon: FileText,
    group: "content",
    section: "notes",
    accent: "slate",
    status: { none: "harness probe" },
    defaultSize: { w: 400, h: 300 },
    matches: () => true,
    Body,
    surface: { none: "harness probe" },
    comments: null,
  };
}

/** Keeps the words in the saved source (the board's record): survives everything. */
function SourceBody({ source, onSource }: ItemBodyProps) {
  const text = source.kind === "label" ? source.text : "";
  return <textarea value={text} onChange={(e) => onSource({ kind: "label", text: e.target.value })} />;
}

/** Keeps the words in mount-local state: a remount loses them. */
function LocalStateBody() {
  const [text, setText] = useState("");
  return <textarea value={text} onChange={(e) => setText(e.target.value)} />;
}

/** Re-reads its record every time it mounts or wakes. */
function RefetchBody(props: ItemBodyProps) {
  useEffect(() => {
    void supabase.schema("workbench").from("notes").select("id, content").eq("id", "n1").then(() => undefined);
  }, []);
  return <SourceBody {...props} />;
}

/** Re-reads something around its record (not the record) on every wake. */
function PeripheralReadBody(props: ItemBodyProps) {
  useEffect(() => {
    void supabase.schema("iam").from("organizations").select("id, name").then(() => undefined);
  }, []);
  return <SourceBody {...props} />;
}

/** Records "opened" on every mount. */
function RecordOpenedBody(props: ItemBodyProps) {
  useEffect(() => {
    void supabase.schema("workbench").from("note_opens").insert({ note_id: "n1" }).then(() => undefined);
  }, []);
  return <SourceBody {...props} />;
}

/** Calls an RPC nobody declared a read: counts as a side effect. */
function UnknownRpcBody(props: ItemBodyProps) {
  useEffect(() => {
    void supabase.rpc("touch_last_opened", { p_id: "n1" }).then(() => undefined);
  }, []);
  return <SourceBody {...props} />;
}

/** Opens a floating window on every mount. */
function OpensWindowBody(props: ItemBodyProps) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(openOverlay({ overlayId: "feedbackDialog", instanceId: "probe" }));
  }, [dispatch]);
  return <SourceBody {...props} />;
}

/** Navigates on every mount. */
function NavigatesBody(props: ItemBodyProps) {
  const router = useRouter();
  useEffect(() => {
    router.push("/notes/n1");
  }, [router]);
  return <SourceBody {...props} />;
}

/** Logs an error on every mount. */
function ErrorBody(props: ItemBodyProps) {
  useEffect(() => {
    console.error("[probe] could not restore the editor");
  }, []);
  return <SourceBody {...props} />;
}

async function cycle(Body: BoardItemType["Body"]): Promise<CycleResult> {
  return runCycle(itemType(Body), { kind: "label", text: "" }, {
    prepare: () => seed("workbench.notes", [{ id: "n1", content: LEASE }]),
    act: async (tile) => {
      await typeInto(tile.container.querySelector("textarea")!, LEASE);
    },
    kept: (tile) => tile.container.querySelector("textarea")?.value,
  });
}

describe("the remount-safety law rejects every break it names", () => {
  it("accepts a tile whose work lives in its saved source and reads nothing twice", async () => {
    const r = await cycle(SourceBody);
    expectRemountSafe(r, LEASE, RECORD);
    expectQuiet(r);
  });

  it.each([
    ["work kept in mount-local state", LocalStateBody],
    ["its own record re-read on wake and remount", RefetchBody],
    ["an 'opened' row written on every mount", RecordOpenedBody],
    ["an undeclared RPC called on every mount", UnknownRpcBody],
    ["a window opened on every mount", OpensWindowBody],
    ["a navigation on every mount", NavigatesBody],
    ["an error logged on every mount", ErrorBody],
  ])("rejects %s", async (_name, Body) => {
    const r = await cycle(Body);
    expect(() => expectRemountSafe(r, LEASE, RECORD)).toThrow();
  });

  it("core allows a peripheral re-read, quiet rejects it", async () => {
    const r = await cycle(PeripheralReadBody);
    expectRemountSafe(r, LEASE, RECORD);
    expect(() => expectQuiet(r)).toThrow();
  });
});
