import CaptureInspectorClient from "./CaptureInspectorClient";

export const metadata = {
  title: "Capture Inspector",
};

/**
 * Every HTTP exchange the browser made — request and response, streams and
 * plain bodies alike. Sourced from the `fetch` tap, so coverage does not
 * depend on which client or feature made the call.
 */
export default function CaptureInspectorPage() {
  return <CaptureInspectorClient />;
}
