"use client";

// Proof harness for rendered-output P2 WP1 (svg · image · chart · diagram · presentation).
// Runs the message print (printMessage) and the live-graph capture against real samples.
import { useCallback, useState } from "react";
import { printMessage } from "@ai-matrx/rich-content/copy/print-message";
import InteractiveDiagramBlock from "@ai-matrx/rich-content/display/blocks/diagram/InteractiveDiagramBlock";
import { materializeDiagramDefaults, parseDiagramJSON } from "@ai-matrx/rich-content/display/blocks/diagram/parseDiagramJSON";
import "@/features/canvas/output/pictureKindPrinters";
import { captureFlowGraph } from "@/features/canvas/output/pictureEngine";

const SVG = `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="100" fill="#fde68a"/><circle cx="60" cy="50" r="30" fill="#2563eb"/><text x="110" y="55" font-size="18">SVG OK</text></svg>`;
const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `Step ${i + 1}`, position: { x: (i % 4) * 520, y: Math.floor(i / 4) * 420 } }));
const DIAGRAM = JSON.stringify({ title: "Wide flow", type: "flowchart", nodes, edges: nodes.slice(1).map((n, i) => ({ source: `n${i}`, target: n.id })) });
const CHART = JSON.stringify({ type: "bar", title: "Quarterly", data: [{ q: "Q1", v: 12 }, { q: "Q2", v: 19 }, { q: "Q3", v: 7 }, { q: "Q4", v: 25 }], xKey: "q", series: [{ key: "v", label: "Sales" }] });
const DECK = JSON.stringify({ presentation: { slides: [{ title: "Slide One", subtitle: "Intro" }, { title: "Slide Two", bullets: ["alpha", "beta"] }, { title: "Slide Three", bullets: ["gamma"] }, { title: "Slide Four" }], theme: { primaryColor: "#2563eb" } } });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FABJADq2Zx4aOAAAAAElFTkSuQmCC";

const MESSAGE = [
  "Here are the things.",
  `<artifact type="svg" title="Logo">\n${SVG}\n</artifact>`,
  `<artifact type="diagram" title="Wide flow">\n${DIAGRAM}\n</artifact>`,
  `<artifact type="chart" title="Quarterly">\n${CHART}\n</artifact>`,
  `<artifact type="presentation" title="Deck">\n${DECK}\n</artifact>`,
  `<artifact type="image" title="Tiny">\n${PNG}\n</artifact>`,
  `<artifact type="mermaid" title="Flow">\nflowchart LR\n  A[Start] --> B[Done]\n</artifact>`,
].join("\n\n");

export default function Page() {
  const [doc, setDoc] = useState("");
  const [live, setLive] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const diagram = materializeDiagramDefaults(parseDiagramJSON(DIAGRAM)!);

  const runMessage = useCallback(async () => {
    const original = window.open;
    let written = "";
    window.open = (() => ({
      closed: false,
      document: { open() {}, write(h: string) { written += h; }, close() {} },
      focus() {}, print() {}, addEventListener() {},
    })) as unknown as typeof window.open;
    try {
      await printMessage(MESSAGE, { onNotice: (l, m) => setLog((p) => [...p, `${l}: ${m}`]) });
    } catch (e) {
      setLog((p) => [...p, `ERR ${String(e)}`]);
    } finally {
      window.open = original;
    }
    setDoc(written);
  }, []);

  const runLive = useCallback(async () => {
    try {
      const pane = document.getElementById("live-diagram");
      const blob = await captureFlowGraph(pane);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => setLive(`${img.naturalWidth}x${img.naturalHeight} ${url}`);
      img.src = url;
    } catch (e) {
      setLive(`ERR ${String(e)}`);
    }
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <button id="run-message" onClick={runMessage}>Print message</button>{" "}
      <button id="run-live" onClick={runLive}>Capture live diagram</button>
      <pre id="log">{log.join("\n")}</pre>
      <pre id="live">{live}</pre>
      <div id="live-diagram" style={{ width: 640, height: 320, border: "1px solid #999" }}>
        <InteractiveDiagramBlock diagram={diagram} presentation="workspace" />
      </div>
      <iframe id="doc" title="doc" srcDoc={doc} style={{ width: "100%", height: 900, border: "1px solid #999" }} />
    </div>
  );
}
