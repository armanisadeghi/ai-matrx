/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SocialImage, imageSettled, youtubeThumbStepDown } from "../components/SocialImage";

let mockOrg = "org-1";
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => mockOrg }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => "org-1" }));
jest.mock("../server", () => ({ fetchPlaybackUrl: jest.fn() }));

describe("imageSettled", () => {
  it("reads an already-finished image", () => {
    expect(imageSettled({ complete: true, naturalWidth: 720 })).toBe("ready");
    expect(imageSettled({ complete: true, naturalWidth: 0 })).toBe("failed");
    expect(imageSettled({ complete: false, naturalWidth: 0 })).toBe("pending");
    expect(imageSettled(null)).toBe("pending");
  });
});

describe("a missing YouTube max-res thumbnail", () => {
  const max = "https://img.youtube.com/vi/jNQXAC9IVRw/maxresdefault.jpg";
  it("steps down to hqdefault when the stub (120px) loads or the load fails", () => {
    expect(youtubeThumbStepDown(max, 120)).toBe("https://img.youtube.com/vi/jNQXAC9IVRw/hqdefault.jpg");
    expect(youtubeThumbStepDown(max, null)).toBe("https://img.youtube.com/vi/jNQXAC9IVRw/hqdefault.jpg");
  });
  it("leaves a real picture, hqdefault and other hosts alone", () => {
    expect(youtubeThumbStepDown(max, 1280)).toBeNull();
    expect(youtubeThumbStepDown("https://img.youtube.com/vi/x/hqdefault.jpg", 120)).toBeNull();
    expect(youtubeThumbStepDown("https://cdn.example.com/maxresdefault.jpg", 120)).toBeNull();
  });
});

describe("an image that finished before React could hear onLoad", () => {
  const proto = HTMLImageElement.prototype;
  const original = { complete: Object.getOwnPropertyDescriptor(proto, "complete"), naturalWidth: Object.getOwnPropertyDescriptor(proto, "naturalWidth") };
  afterEach(() => {
    for (const k of ["complete", "naturalWidth"] as const) {
      if (original[k]) Object.defineProperty(proto, k, original[k]!);
    }
  });

  async function mount(): Promise<HTMLElement> {
    const host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => {
      createRoot(host).render(<SocialImage door={null} url="https://i.ytimg.com/vi/x/hq.jpg" fallback={<span />} />);
    });
    return host;
  }

  it("becomes visible without a load event", async () => {
    Object.defineProperty(proto, "complete", { configurable: true, get: () => true });
    Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => 720 });
    const host = await mount();
    expect(host.querySelector("img")?.className).not.toContain("opacity-0");
  });

  it("becomes visible when the organization arrives after the image already loaded (direct load / refresh)", async () => {
    Object.defineProperty(proto, "complete", { configurable: true, get: () => true });
    Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => 720 });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const el = () => <SocialImage door="stored/door" url="https://i.ytimg.com/vi/x/hq.jpg" fallback={<span />} />;
    mockOrg = "";
    await act(async () => { root.render(el()); });
    mockOrg = "org-1";
    await act(async () => { root.render(el()); });
    expect(host.querySelector("img")?.className ?? "opacity-0").not.toContain("opacity-0");
  });

  it("stays hidden while the image is still loading", async () => {
    Object.defineProperty(proto, "complete", { configurable: true, get: () => false });
    const host = await mount();
    expect(host.querySelector("img")?.className).toContain("opacity-0");
  });
});
