"use client";

import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NestedResizableLayout,
  Section,
} from "@/components/matrx/resizable/NestedResizableLayout";

const ResizableLayoutDemo = () => {
  // Initial sections configuration based on the provided interface
  const [sections, setSections] = useState<Section[]>([
    {
      type: "content",
      content: (
        <div className="h-full w-full bg-blue-100 flex items-center justify-center font-medium">
          Left Panel
        </div>
      ),
      defaultSize: 25,
      minSize: 15,
    },
    {
      type: "nested",
      defaultSize: 50,
      sections: [
        {
          type: "content",
          content: (
            <div className="h-full w-full bg-green-100 flex items-center justify-center font-medium">
              Top Middle
            </div>
          ),
          defaultSize: 40,
        },
        {
          type: "content",
          content: (
            <div className="h-full w-full bg-green-200 flex items-center justify-center font-medium">
              Bottom Middle
            </div>
          ),
          defaultSize: 60,
          collapsible: true,
        },
      ],
    },
    {
      type: "nested",
      defaultSize: 25,
      sections: [
        {
          type: "content",
          content: (
            <div className="h-full w-full bg-purple-100 flex items-center justify-center font-medium">
              Top Right
            </div>
          ),
          defaultSize: 30,
        },
        {
          type: "content",
          content: (
            <div className="h-full w-full bg-purple-200 flex items-center justify-center font-medium">
              Middle Right
            </div>
          ),
          defaultSize: 40,
        },
        {
          type: "content",
          content: (
            <div className="h-full w-full bg-purple-300 flex items-center justify-center font-medium">
              Bottom Right
            </div>
          ),
          defaultSize: 30,
        },
      ],
    },
  ]);

  // Function to update a section's properties
  const updateSection = (path: number[], property: string, value: any) => {
    // Create a deep copy without JSON stringify/parse to avoid circular reference issues
    const newSections = structuredClone(sections);

    let targetSection: any = newSections;
    let currentPath: any[] = [...path];

    // Navigate to the target section
    while (currentPath.length > 1) {
      const index = currentPath[0];
      currentPath.shift();

      if (typeof index === "number" && targetSection[index]) {
        // @ts-ignore - Complex nested section navigation, path may include string markers
        if (
          targetSection[index].type === "nested" &&
          currentPath[0] === "sections"
        ) {
          targetSection = targetSection[index].sections;
          currentPath.shift(); // Remove 'sections' from the path
        } else {
          targetSection = targetSection[index];
        }
      }
    }

    if (currentPath.length === 1 && typeof currentPath[0] === "number") {
      const finalIndex = currentPath[0];
      targetSection[finalIndex][property] = value;
      setSections([...newSections]);
    }
  };

  // Function to generate control panels for the sections
  const renderControlPanel = (
    sections: Section[],
    path: (number | string)[] = [],
  ) => {
    return sections.map((section, index) => {
      const currentPath = [...path, index];

      return (
        <div
          key={currentPath.join("-")}
          className="mb-4 p-4 border rounded-lg bg-white shadow-sm"
        >
          <h3 className="font-bold mb-2 text-gray-800">
            {section.type === "content"
              ? `Content Section ${currentPath.join(".")}`
              : `Nested Section ${currentPath.join(".")}`}
          </h3>

          {section.type === "content" && (
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Size (%)
                </label>
                <input
                  type="range"
                  min="5"
                  max={section.maxSize || 90}
                  value={section.defaultSize || 0}
                  onChange={(e) =>
                    updateSection(
                      currentPath.map((p) => Number(p)),
                      "defaultSize",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <div className="text-xs text-right text-gray-600">
                  {section.defaultSize || 0}%
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Min Size (%)
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={section.minSize || 10}
                  onChange={(e) =>
                    updateSection(
                      currentPath.map((p) => Number(p)),
                      "minSize",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <div className="text-xs text-right text-gray-600">
                  {section.minSize || 10}%
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Max Size (%)
                </label>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={section.maxSize || 90}
                  onChange={(e) =>
                    updateSection(
                      currentPath.map((p) => Number(p)),
                      "maxSize",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <div className="text-xs text-right text-gray-600">
                  {section.maxSize || 90}%
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!section.collapsible}
                  onCheckedChange={(v) =>
                    updateSection(
                      currentPath.map((p) => Number(p)),
                      "collapsible",
                      v === true,
                    )
                  }
                  className="shrink-0"
                />
                <span className="text-sm font-medium text-gray-700">
                  Collapsible
                </span>
              </label>
            </div>
          )}

          {section.type === "nested" && (
            <div>
              <div className="mb-2">
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Size (%)
                </label>
                <input
                  type="range"
                  min="5"
                  max="90"
                  value={section.defaultSize || 0}
                  onChange={(e) =>
                    updateSection(
                      currentPath.map((p) => Number(p)),
                      "defaultSize",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <div className="text-xs text-right text-gray-600">
                  {section.defaultSize || 0}%
                </div>
              </div>

              <div className="mb-2">
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Min Size (%)
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={section.minSize || 10}
                  onChange={(e) =>
                    updateSection(
                      currentPath.map((p) => Number(p)),
                      "minSize",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <div className="text-xs text-right text-gray-600">
                  {section.minSize || 10}%
                </div>
              </div>

              <div className="mb-2">
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Max Size (%)
                </label>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={section.maxSize || 90}
                  onChange={(e) =>
                    updateSection(
                      currentPath.map((p) => Number(p)),
                      "maxSize",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <div className="text-xs text-right text-gray-600">
                  {section.maxSize || 90}%
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer mb-4">
                <Checkbox
                  checked={!!section.collapsible}
                  onCheckedChange={(v) =>
                    updateSection(
                      currentPath.map((p) => Number(p)),
                      "collapsible",
                      v === true,
                    )
                  }
                  className="shrink-0"
                />
                <span className="text-sm font-medium text-gray-700">
                  Collapsible
                </span>
              </label>

              <div className="pl-4 border-l-2 border-gray-200">
                <h4 className="font-medium text-sm mb-2 text-gray-700">
                  Nested Sections:
                </h4>
                {renderControlPanel(section.sections, [
                  ...currentPath,
                  "sections",
                ])}
              </div>
            </div>
          )}
        </div>
      );
    });
  };

  // Export configuration as JSON
  const exportConfig = () => {
    try {
      // Use a more resilient approach for serialization
      const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (key: string, value: any) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
              return "[Circular]";
            }
            seen.add(value);
          }
          return value;
        };
      };

      const configString = JSON.stringify(sections, getCircularReplacer(), 2);
      console.log(configString);
      alert("Configuration exported to console");
    } catch (error) {
      console.error("Error exporting configuration:", error);
      alert("Error exporting configuration. See console for details.");
    }
  };

  return (
    <div className="w-full h-full grid grid-cols-12 bg-gray-50">
      {/* Main Layout Demo Area */}
      {/* Control Panel */}
      <div className="col-span-3 bg-gray-100 p-4 overflow-y-auto border-l border-gray-200">
        <h2 className="text-lg font-bold mb-4 text-gray-800">
          Layout Configuration
        </h2>

        <div className="mb-4 flex space-x-2">
          <button
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
            onClick={() => setSections([...sections])}
          >
            Apply Changes
          </button>
          <button
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors"
            onClick={exportConfig}
          >
            Export Config
          </button>
        </div>

        <div className="space-y-2">{renderControlPanel(sections)}</div>
      </div>
      <div className="col-span-9 p-6">
        <div className="w-full h-full border-4 border-gray-300 rounded-lg overflow-hidden shadow-lg bg-white">
          <NestedResizableLayout sections={sections} />
        </div>
      </div>
    </div>
  );
};

export default ResizableLayoutDemo;
