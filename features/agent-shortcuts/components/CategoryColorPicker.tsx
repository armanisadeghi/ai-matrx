"use client";

import React, { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { colord } from "colord";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Pipette } from "lucide-react";
import { CATEGORY_PRESET_COLORS } from "../constants";

interface CategoryColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export function CategoryColorPicker({
  value,
  onChange,
  disabled = false,
}: CategoryColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  const handleColorChange = (hex: string) => {
    setInputValue(hex);
    onChange(hex);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    try {
      const color = colord(newValue);
      if (color.isValid()) {
        onChange(color.toHex());
      }
    } catch {
      // silently ignore invalid input; revert onBlur
    }
  };

  const handleInputBlur = () => {
    try {
      const color = colord(inputValue);
      if (!color.isValid()) {
        setInputValue(value);
      }
    } catch {
      setInputValue(value);
    }
  };

  const fallbackColor = value || "#666666";
  const iconColor = colord(fallbackColor).isDark() ? "#ffffff" : "#000000";

  return (
    <div className="flex items-center gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-10 h-10 p-0 border-2 hover:scale-105 transition-transform"
            style={{ backgroundColor: fallbackColor }}
            aria-label="Pick color"
          >
            <Pipette
              className="w-4 h-4 opacity-0 hover:opacity-100 transition-opacity"
              style={{ color: iconColor }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="space-y-3">
            <HexColorPicker
              color={fallbackColor}
              onChange={handleColorChange}
              style={{ width: "200px", height: "150px" }}
            />
            <div>
              <Label className="text-xs font-medium mb-2 block">
                Quick Colors
              </Label>
              <div className="grid grid-cols-10 gap-1.5">
                {CATEGORY_PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleColorChange(color)}
                    className="w-5 h-5 rounded border-2 border-transparent hover:border-foreground transition-all hover:scale-110"
                    style={{ backgroundColor: color }}
                    aria-label={color}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Hex Code</Label>
              <Input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                placeholder="#666666"
                className="h-8 text-[16px] font-mono"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex-1">
        <Input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder="#666666"
          disabled={disabled}
          className="h-10 text-[16px] font-mono"
        />
      </div>
    </div>
  );
}
