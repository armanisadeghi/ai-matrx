/**
 * Announcements never rendered because the provider gated on a flag
 * (`shellDataLoaded`) that nothing dispatches. The gate must follow facts the
 * live boot actually produces.
 */
import fs from "node:fs";
import path from "node:path";
import { configureStore } from "@reduxjs/toolkit";
import userAuthReducer from "@/lib/redux/slices/userAuthSlice";
import userPreferencesReducer from "@/lib/redux/preferences/userPreferencesSlice";
import { selectAnnouncementsReady } from "./announcementGate";
import type { RootState } from "@/lib/redux/store";

function stateFor(opts: { id: string | null; loadStatus: "loading" | "loaded" | "failed" }) {
  const base = configureStore({
    reducer: { userAuth: userAuthReducer, userPreferences: userPreferencesReducer },
  }).getState();
  return {
    ...base,
    userAuth: { ...base.userAuth, id: opts.id },
    userPreferences: {
      ...base.userPreferences,
      _meta: { ...base.userPreferences._meta, loadStatus: opts.loadStatus },
    },
  } as unknown as RootState;
}

describe("announcement gate", () => {
  it("opens for a signed-in person once preferences loaded", () => {
    expect(selectAnnouncementsReady(stateFor({ id: "u1", loadStatus: "loaded" }))).toBe(true);
  });
  it("opens when the preferences load failed (never hide an alarm)", () => {
    expect(selectAnnouncementsReady(stateFor({ id: "u1", loadStatus: "failed" }))).toBe(true);
  });
  it("stays closed while preferences load (no flash of acknowledged alarms)", () => {
    expect(selectAnnouncementsReady(stateFor({ id: "u1", loadStatus: "loading" }))).toBe(false);
  });
  it("stays closed for a guest", () => {
    expect(selectAnnouncementsReady(stateFor({ id: null, loadStatus: "loaded" }))).toBe(false);
  });
  it("the provider does not gate on a flag with no dispatcher", () => {
    const src = fs.readFileSync(path.join(__dirname, "AnnouncementProvider.tsx"), "utf8");
    expect(src).not.toMatch(/ShellDataLoaded/);
    expect(src).toMatch(/selectAnnouncementsReady/);
  });
});
