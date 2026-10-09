import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server.node";
import IframeArtifact from "@/features/canvas/artifact-types/renderers/IframeArtifact";
import { SpaceEmbedFrame } from "@/features/spaces/editor/SpaceEmbedFrame";
import { embedTarget } from "@/features/spaces/editor/embed-providers";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const base =
  "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation";
const opaque = "allow-scripts allow-popups allow-forms allow-presentation";
async function hydratedFrame(element: React.ReactElement, external: boolean) {
  const host = document.createElement("div");
  host.innerHTML = renderToString(element);
  const serverFrame = host.querySelector("iframe");
  expect(serverFrame?.getAttribute("sandbox")).toBe(opaque);
  document.body.appendChild(host);
  const errors = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(host, element);
    });
    const current = host.querySelector("iframe");
    expect(current?.getAttribute("sandbox")).toBe(external ? base : opaque);
    // Changing the attribute alone does not change a loaded document's flags.
    if (external) expect(current).not.toBe(serverFrame);
    else expect(current).toBe(serverFrame);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    if (root) act(() => root!.unmount());
    errors.mockRestore();
    host.remove();
  }
}
it.each([
  "/p/agenda",
  window.location.origin + "/p/agenda",
  "https://www.youtube.com/embed/M7lc1UVf-VE",
])(
  "generic renderer reloads only when restoring separate-origin permissions: %s",
  async (url) => {
    await hydratedFrame(
      <IframeArtifact mode="canvas" data={url} />,
      url.startsWith("https://www.youtube.com"),
    );
  },
);
it.each([
  "https://gist.github.com/octocat/9257657",
  "https://www.youtube.com/watch?v=M7lc1UVf-VE",
  window.location.origin + "/p/agenda",
])(
  "Spaces Gist stays opaque and external player reloads with its permissions: %s",
  async (url) => {
    const target = embedTarget(url);
    if (!target) throw new Error("Valid fixture URL required");
    await hydratedFrame(
      <SpaceEmbedFrame target={target} title="Workshop reference" />,
      target.provider === "youtube",
    );
  },
);
it("routes prose followed by markup to an opaque inline document and disables public execution", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const html =
    'Workshop <button>Open agenda</button><script>console.log("agenda")</script>';
  try {
    act(() => root.render(<IframeArtifact mode="canvas" data={html} />));
    const privateFrame = host.querySelector("iframe");
    expect(privateFrame?.getAttribute("src")).toBeNull();
    expect(privateFrame?.getAttribute("srcdoc")).toBe(html);
    expect(privateFrame?.getAttribute("sandbox")).toBe(
      "allow-scripts allow-forms",
    );
    act(() =>
      root.render(<IframeArtifact mode="canvas" data={html} isPublic />),
    );
    expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("");
    expect(host.querySelector("iframe")).not.toBe(privateFrame);
  } finally {
    act(() => root.unmount());
  }
});
