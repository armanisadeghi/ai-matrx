/**
 * @jest-environment jsdom
 */
/**
 * A failed call to our own Next.js API routes reaches the Error Inspector, so
 * an error box's Copy-for-AI can name the request behind it (RC-B12 round 2:
 * the settings profile's failing /api call was never captured).
 */
import { clearCapturedErrors, getSnapshot } from "@/lib/diagnostics/errorCaptureStore";
import { installAppApiFetchCapture } from "@/lib/diagnostics/captureAppApiFetch";

it("captures a non-2xx response from an /api route with its method, path, status and message", async () => {
  clearCapturedErrors();
  const body = JSON.stringify({ error: "Couldn't load profile" });
  const fakeResponse = () => ({
    ok: false,
    status: 500,
    clone: () => ({ text: async () => body }),
  });
  const original = jest.fn(async () => fakeResponse());
  window.fetch = original as unknown as typeof window.fetch;
  installAppApiFetchCapture();
  const res = await window.fetch("/api/user/profile?x=1", { method: "GET" });
  expect(res.status).toBe(500);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const hit = getSnapshot().find((c) => c.source === "app-api-http");
  expect(hit).toMatchObject({ relation: "/api/user/profile", status: 500 });
  expect(hit?.message).toContain("Couldn't load profile");
});

it("leaves other origins and successful calls alone", async () => {
  clearCapturedErrors();
  await window.fetch("https://example.com/api/x");
  expect(getSnapshot().filter((c) => c.source === "app-api-http")).toHaveLength(0);
});
