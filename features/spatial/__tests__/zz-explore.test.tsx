jest.mock("@/utils/supabase/client", () => {
  const { createFakeSupabase } = jest.requireActual("./remount-safety/fake-backend");
  const client = createFakeSupabase();
  return { createClient: () => client, supabase: client };
});
jest.mock("next/navigation", () => jest.requireActual("./remount-safety/next-navigation"));
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { mountTile, describeCalls } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import { backendCalls } from "./remount-safety/fake-backend";
import { seedPlatform } from "./remount-safety/platform-fixtures";
installBrowserGaps();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fx = require(process.env.FX!);
it("explore", async () => {
  const type = BOARD_ITEM_TYPES.find((t) => t.key === process.env.KEY)!;
  const errs: string[] = [];
  const spy = jest.spyOn(console, "error").mockImplementation((...a: unknown[]) => { errs.push(a.map(String).join(" ").slice(0, 300)); });
  const tile = await mountTile(type, fx.source, { prepareStore: (s) => { seedPlatform(); fx.seed?.(s); }, loadMs: 1500 });
  if (fx.act) { await fx.act(tile); }
  spy.mockRestore();
  console.log("ERRORS\n" + errs.join("\n---\n"));
  console.log("CALLS\n" + describeCalls(backendCalls()).join("\n"));
  console.log("DOM\n" + (tile.container.textContent ?? "").slice(0, 1500));
  fx.inspect?.(tile);
  tile.unmount();
});
