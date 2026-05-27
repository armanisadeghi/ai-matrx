"use client";

/**
 * Isolated test page for react-resizable-panels v4
 * URL: /layout-tests/resizable-test
 *
 * KEY LESSON from README:
 *   "Numeric values are assumed to be PIXELS.
 *    Strings without explicit units are assumed to be percentages."
 *
 * defaultSize={30}   → 30 pixels
 * defaultSize="30"   → 30% (string without unit = percentage)
 * defaultSize="30%"  → 30% (explicit %)
 */

import React, { useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

function Box({ label, bg = "bg-blue-100" }: { label: string; bg?: string }) {
  return (
    <div
      className={`${bg} flex items-center justify-center h-full w-full text-xs font-mono border border-dashed border-gray-400 p-2 text-center`}
    >
      {label}
    </div>
  );
}

function Handle({ vertical = false }: { vertical?: boolean }) {
  return (
    <Separator
      style={{
        background: "#888",
        cursor: vertical ? "row-resize" : "col-resize",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...(vertical
          ? { height: 6, width: "100%" }
          : { width: 6, height: "100%" }),
      }}
    />
  );
}

/** Test 1 — Numbers = PIXELS (broken proportions) */
function Test1_NumbersArePx() {
  return (
    <div style={{ width: "100%", height: 160, border: "3px solid red" }}>
      <Group orientation="horizontal">
        <Panel defaultSize={30}>
          <Box
            label={"defaultSize={30}\n= 30 PIXELS\n(not 30%!)"}
            bg="bg-red-100"
          />
        </Panel>
        <Handle />
        <Panel defaultSize={70}>
          <Box label={"defaultSize={70}\n= 70 PIXELS"} bg="bg-red-50" />
        </Panel>
      </Group>
    </div>
  );
}

/** Test 2 — Strings without unit = percentage (correct) */
function Test2_StringsArePercent() {
  return (
    <div style={{ width: "100%", height: 160, border: "3px solid green" }}>
      <Group orientation="horizontal">
        <Panel defaultSize="30">
          <Box label={'defaultSize="30"\n= 30% ✓'} bg="bg-green-100" />
        </Panel>
        <Handle />
        <Panel defaultSize="70">
          <Box label={'defaultSize="70"\n= 70% ✓'} bg="bg-green-50" />
        </Panel>
      </Group>
    </div>
  );
}

/** Test 3 — Explicit % strings (also correct, most readable) */
function Test3_ExplicitPercent() {
  return (
    <div style={{ width: "100%", height: 160, border: "3px solid blue" }}>
      <Group orientation="horizontal">
        <Panel defaultSize="30%" minSize="10%" maxSize="50%">
          <Box
            label={'defaultSize="30%"\nminSize="10%"\nmaxSize="50%" ✓'}
            bg="bg-blue-100"
          />
        </Panel>
        <Handle />
        <Panel defaultSize="70%" minSize="50%">
          <Box label={'defaultSize="70%"\nminSize="50%" ✓'} bg="bg-blue-50" />
        </Panel>
      </Group>
    </div>
  );
}

/** Test 4 — Full height via explicit style on Group (correct pattern for app layouts) */
function Test4_ExplicitHeightOnGroup() {
  return (
    <Group
      orientation="horizontal"
      style={{ height: "calc(100vh - 600px)", border: "3px solid purple" }}
    >
      <Panel defaultSize="22%" minSize="14%" maxSize="40%">
        <div
          style={{ height: "100%", overflow: "hidden", background: "#e0d0ff" }}
        >
          <p style={{ padding: 8, fontSize: 11 }}>
            SIDEBAR 22%
            <br />
            min 14% max 40%
            <br />
            ← height set on Group
            <br />
            Drag handle →
          </p>
        </div>
      </Panel>
      <Handle />
      <Panel defaultSize="78%" minSize="60%">
        <div
          style={{ height: "100%", overflow: "hidden", background: "#f0e8ff" }}
        >
          <p style={{ padding: 8, fontSize: 11 }}>
            MAIN 78%
            <br />
            min 60%
            <br />← Drag handle
          </p>
        </div>
      </Panel>
    </Group>
  );
}

/** Test 5 — Vertical split with explicit height on Group */
function Test5_Vertical() {
  return (
    <Group
      orientation="vertical"
      style={{ height: 300, border: "3px solid orange" }}
    >
      <Panel defaultSize="40%" minSize="20%">
        <Box label={"TOP 40%\nvertical split ✓"} bg="bg-orange-100" />
      </Panel>
      <Handle vertical />
      <Panel defaultSize="60%" minSize="20%">
        <Box label={"BOTTOM 60%"} bg="bg-amber-50" />
      </Panel>
    </Group>
  );
}

export default function ResizableTestPage() {
  const [log, setLog] = useState<string[]>([]);

  return (
    <div className="p-4 space-y-8 overflow-y-auto font-mono text-sm">
      <div className="text-lg font-bold">
        react-resizable-panels v4 — Correct Usage
      </div>

      <div className="bg-yellow-50 border border-yellow-300 rounded p-3 text-xs space-y-1">
        <div className="font-bold text-yellow-800">
          ⚠️ Critical: Number vs String sizes
        </div>
        <div>
          <code>defaultSize={"{30}"}</code> → <strong>30 pixels</strong>
        </div>
        <div>
          <code>defaultSize="30"</code> → <strong>30%</strong> (string without
          unit = %)
        </div>
        <div>
          <code>defaultSize="30%"</code> → <strong>30%</strong> (explicit)
        </div>
        <div className="pt-1 text-yellow-700">
          Also: Group height must be explicit (not just h-full) when parent has
          no height set
        </div>
      </div>

      <section>
        <div className="text-sm font-semibold mb-1 text-red-600">
          Test 1 — WRONG: numeric defaultSize = pixels not %
        </div>
        <Test1_NumbersArePx />
      </section>

      <section>
        <div className="text-sm font-semibold mb-1 text-green-700">
          Test 2 — CORRECT: string defaultSize (no unit) = percentage
        </div>
        <Test2_StringsArePercent />
      </section>

      <section>
        <div className="text-sm font-semibold mb-1 text-blue-700">
          Test 3 — CORRECT: explicit % strings with min/max
        </div>
        <Test3_ExplicitPercent />
      </section>

      <section>
        <div className="text-sm font-semibold mb-1 text-purple-700">
          Test 4 — Real layout pattern: explicit height on Group + % sizes
        </div>
        <Test4_ExplicitHeightOnGroup />
      </section>

      <section>
        <div className="text-sm font-semibold mb-1 text-orange-700">
          Test 5 — Vertical split with explicit height on Group
        </div>
        <Test5_Vertical />
      </section>

      <section>
        <div className="text-sm font-semibold mb-1">
          Interactive — drag and see layout events
        </div>
        <Group
          orientation="horizontal"
          style={{ height: 200, border: "2px solid #999" }}
          onLayoutChanged={(layout) =>
            setLog((prev) => [
              `layout: ${JSON.stringify(layout)}`,
              ...prev.slice(0, 9),
            ])
          }
        >
          <Panel
            id="left"
            defaultSize="30%"
            minSize="10%"
            onResize={(size) =>
              setLog((prev) => [
                `left: ${JSON.stringify(size)}`,
                ...prev.slice(0, 9),
              ])
            }
          >
            <Box label="LEFT 30% — drag me" bg="bg-violet-100" />
          </Panel>
          <Handle />
          <Panel id="right" defaultSize="70%" minSize="20%">
            <Box label="RIGHT 70%" bg="bg-amber-100" />
          </Panel>
        </Group>
        <div className="mt-2 bg-gray-900 text-green-400 p-2 rounded h-24 overflow-y-auto text-xs">
          {log.length === 0
            ? "Drag the handle..."
            : log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </section>
    </div>
  );
}
