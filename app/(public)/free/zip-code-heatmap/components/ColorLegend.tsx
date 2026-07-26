'use client';

import { getLegendBreaks } from '../utils/colorScaling';
import type { ScalingMethod, ColorScheme } from './ColorScaleSelector';
import { COLOR_SCHEMES } from './ColorScaleSelector';

interface ColorLegendProps {
  minValue: number;
  maxValue: number;
  scalingMethod: ScalingMethod;
  colorScheme: ColorScheme;
}

export default function ColorLegend({ minValue, maxValue, scalingMethod, colorScheme }: ColorLegendProps) {
  // Get legend breaks based on scaling method
  const breaks = getLegendBreaks(minValue, maxValue, scalingMethod, colorScheme, 5);
  const colors = COLOR_SCHEMES[colorScheme].colors;

  return (
    <div className="space-y-3">
      {/* Gradient Bar */}
      <div className="relative h-6 rounded-md overflow-hidden shadow-sm">
        <div
          className="w-full h-full"
          style={{
            background: `linear-gradient(to right, ${colors.join(', ')})`,
          }}
        />
      </div>

      {/* Value Labels */}
      <div className="flex justify-between text-xs text-muted-foreground">
        {breaks.map((brk, idx) => (
          <span key={idx} className="font-medium">
            {brk.label}
          </span>
        ))}
      </div>

      {/* Description */}
      <div className="pt-2 border-t">
        <p className="text-xs text-muted-foreground text-center">
          {scalingMethod === 'logarithmic' && 'Logarithmic scale (better for outliers)'}
          {scalingMethod === 'quantile' && 'Equal distribution across colors'}
          {scalingMethod === 'equalInterval' && 'Equal intervals in data range'}
          {scalingMethod === 'linear' && 'Linear scale (proportional)'}
        </p>
      </div>
    </div>
  );
}

