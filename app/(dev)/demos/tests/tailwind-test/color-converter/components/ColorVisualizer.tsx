"use client";

import React from "react";
import { Colord } from "colord";
import { Card } from "@/components/ui/card";
import { CardContent } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card";
import { CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import TextDivider from "@/components/matrx/TextDivider";

interface ColorVisualizerProps {
  color: Colord;
}

export default function ColorVisualizer({ color }: ColorVisualizerProps) {
  const currentColor = color.toHex();
  const textColor = color.isDark() ? "#ffffff" : "#000000";
  const blackColor = "#000000";
  const whiteColor = "#ffffff";
  const darkColor = "#18181b";
  const lightColor = "#f4f4f5";

  return (
    <Card className="bg-background dark:bg-background">
      <CardHeader>
        <CardTitle className="text-foreground dark:text-foreground">
          Color Visualizer
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div
            className="w-36 h-36 rounded-md"
            style={{ backgroundColor: currentColor }}
          />

          <div className="flex-1 grid grid-cols-2 gap-2">
            <div
              className="p-2 rounded-md bg-background flex flex-col items-center justify-center h-full"
              style={{ border: `2px solid ${currentColor}` }}
            >
              <h3 className="text-center">Border Color</h3>
              <p className="text-sm text-center">2px Border</p>
            </div>

            <div
              className="p-2 rounded-md bg-background flex flex-col items-center justify-center h-full"
              style={{ border: `1px solid ${currentColor}` }}
            >
              <h3 className="text-center">Border Color</h3>
              <p className="text-sm text-center">1px Border</p>
            </div>

            <div
              className="p-2 rounded-md bg-background flex flex-col items-center justify-center h-full"
              style={{ backgroundColor: currentColor, color: blackColor }}
            >
              <h3 className="text-center">Background Color</h3>
              <p className="text-sm text-center">Dark Text</p>
            </div>
            <div
              className="p-2 rounded-md bg-background flex flex-col items-center justify-center h-full"
              style={{ backgroundColor: currentColor, color: whiteColor }}
            >
              <h3 className="text-center">Background Color</h3>
              <p className="text-sm text-center">Light Text</p>
            </div>
          </div>
        </div>

        <TextDivider text="Text Color" />

        <div className="h-12 flex-1 grid grid-cols-3 gap-2">
          <div
            className="p-2 rounded-md bg-background border flex flex-col items-center justify-center h-full"
            style={{ color: currentColor }}
          >
            <h3 className="text-center">Text Color</h3>
            <p className="text-sm text-center">System Background</p>
          </div>

          <div
            className="p-2 rounded-md bg-background border flex flex-col items-center justify-center h-full"
            style={{ backgroundColor: blackColor, color: currentColor }}
          >
            <h3 className="text-center">Text Color</h3>
            <p className="text-sm text-center">Dark Background</p>
          </div>
          <div
            className="p-2 rounded-md bg-background border flex flex-col items-center justify-center h-full"
            style={{ backgroundColor: whiteColor, color: currentColor }}
          >
            <h3 className="text-center">Text Color</h3>
            <p className="text-sm text-center">Light Background</p>
          </div>
        </div>

        <TextDivider text="Button Colors" />

        <div className="h-12 flex-1 grid grid-cols-3 gap-2">
          <Button style={{ backgroundColor: currentColor }}>
            Button Color, System Text Color
          </Button>
          <Button style={{ backgroundColor: currentColor, color: blackColor }}>
            Button Color, Dark Text Color
          </Button>
          <Button style={{ backgroundColor: currentColor, color: whiteColor }}>
            Button Color, Light Text Color
          </Button>
        </div>

        <TextDivider text="Input Colors" />

        <div className="h-12 flex-1 grid grid-cols-3 gap-2">
          <input
            className="p-2 rounded-md bg-background border w-full"
            defaultValue="Text Color, System Background"
            style={{ color: currentColor }}
          />

          <input
            className="p-2 rounded-md border w-full"
            defaultValue="Text Color, Dark Background"
            style={{ backgroundColor: blackColor, color: currentColor }}
          />

          <input
            className="p-2 rounded-md border w-full"
            defaultValue="Text Color, Light Background"
            style={{ backgroundColor: whiteColor, color: currentColor }}
          />
        </div>

        <div className="h-12 flex-1 grid grid-cols-3 gap-2 mt-2">
          <input
            className="p-2 rounded-md border w-full"
            defaultValue="Component Color, System Text"
            style={{ backgroundColor: currentColor }}
          />

          <input
            className="p-2 rounded-md border w-full"
            defaultValue="Component Color, Dark Text"
            style={{ backgroundColor: currentColor, color: blackColor }}
          />

          <input
            className="p-2 rounded-md border w-full"
            defaultValue="Component Color, Light Text"
            style={{ backgroundColor: currentColor, color: whiteColor }}
          />
        </div>

        <TextDivider text="Text Area Colors" />

        <div className="h-24 flex-1 grid grid-cols-3 gap-2">
          <textarea
            className="p-2 rounded-md bg-background border w-full resize-none"
            defaultValue="Text Color, System Background"
            style={{ color: currentColor }}
          />

          <textarea
            className="p-2 rounded-md border w-full resize-none"
            defaultValue="Text Color, Dark Background"
            style={{ backgroundColor: blackColor, color: currentColor }}
          />

          <textarea
            className="p-2 rounded-md border w-full resize-none"
            defaultValue="Text Color, Light Background"
            style={{ backgroundColor: whiteColor, color: currentColor }}
          />
        </div>

        <div className="h-24 flex-1 grid grid-cols-3 gap-2 mt-2">
          <textarea
            className="p-2 rounded-md border w-full resize-none"
            defaultValue="Component Color, System Text"
            style={{ backgroundColor: currentColor }}
          />

          <textarea
            className="p-2 rounded-md border w-full resize-none"
            defaultValue="Component Color, Dark Text"
            style={{ backgroundColor: currentColor, color: blackColor }}
          />

          <textarea
            className="p-2 rounded-md border w-full resize-none"
            defaultValue="Component Color, Light Text"
            style={{ backgroundColor: currentColor, color: whiteColor }}
          />
        </div>

        <TextDivider text="Select Colors" />

        <div className="h-12 flex-1 grid grid-cols-3 gap-2">
          <select
            className="p-2 rounded-md bg-background border w-full"
            defaultValue="text-color-system-bg"
            style={{ color: currentColor }}
          >
            <option value="text-color-system-bg">
              Text Color, System Background
            </option>
            <option value="option2">Option 2</option>
            <option value="option3">Option 3</option>
          </select>

          <select
            className="p-2 rounded-md border w-full"
            defaultValue="text-color-dark-bg"
            style={{ backgroundColor: blackColor, color: currentColor }}
          >
            <option value="text-color-dark-bg">
              Text Color, Dark Background
            </option>
            <option value="option2">Option 2</option>
            <option value="option3">Option 3</option>
          </select>

          <select
            className="p-2 rounded-md border w-full"
            defaultValue="text-color-light-bg"
            style={{ backgroundColor: whiteColor, color: currentColor }}
          >
            <option value="text-color-light-bg">
              Text Color, Light Background
            </option>
            <option value="option2">Option 2</option>
            <option value="option3">Option 3</option>
          </select>
        </div>

        <div className="h-12 flex-1 grid grid-cols-3 gap-2 mt-2">
          <select
            className="p-2 rounded-md border w-full"
            defaultValue="component-color-system-text"
            style={{ backgroundColor: currentColor }}
          >
            <option value="component-color-system-text">
              Component Color, System Text
            </option>
            <option value="option2">Option 2</option>
            <option value="option3">Option 3</option>
          </select>

          <select
            className="p-2 rounded-md border w-full"
            defaultValue="component-color-dark-text"
            style={{ backgroundColor: currentColor, color: blackColor }}
          >
            <option value="component-color-dark-text">
              Component Color, Dark Text
            </option>
            <option value="option2">Option 2</option>
            <option value="option3">Option 3</option>
          </select>

          <select
            className="p-2 rounded-md border w-full"
            defaultValue="component-color-light-text"
            style={{ backgroundColor: currentColor, color: whiteColor }}
          >
            <option value="component-color-light-text">
              Component Color, Light Text
            </option>
            <option value="option2">Option 2</option>
            <option value="option3">Option 3</option>
          </select>
        </div>

        <TextDivider text="Checkbox Colors" />

        <div className="h-12 flex-1 grid grid-cols-3 gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox defaultChecked className="shrink-0" />
            <span style={{ color: currentColor }}>Label Color Only</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              defaultChecked
              className="shrink-0 border-2 data-[state=unchecked]:bg-transparent"
              style={{ borderColor: currentColor }}
            />
            <span>Label & Border Color</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              defaultChecked
              className="shrink-0 border-2 data-[state=unchecked]:bg-transparent"
              style={{ borderColor: currentColor, color: currentColor }}
            />
            <span style={{ color: currentColor }}>
              Label, Border & Fill Color
            </span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
