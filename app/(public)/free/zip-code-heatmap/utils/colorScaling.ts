import chroma from 'chroma-js';
import { ScalingMethod, ColorScheme, COLOR_SCHEMES } from '../components/ColorScaleSelector';

export interface ScaledValue {
  originalValue: number;
  scaledValue: number; // 0 to 1
  color: string;
}

/**
 * Apply different scaling methods to normalize values
 */
export function applyScaling(
  value: number,
  min: number,
  max: number,
  method: ScalingMethod
): number {
  if (min === max) return 0.5;

  switch (method) {
    case 'linear':
      return (value - min) / (max - min);

    case 'logarithmic':
      // Add 1 to handle zeros, then apply log
      const logMin = Math.log(min + 1);
      const logMax = Math.log(max + 1);
      const logValue = Math.log(value + 1);
      return (logValue - logMin) / (logMax - logMin);

    case 'quantile':
      // This needs all values to compute quantiles properly
      // For now, we'll use a simplified version
      // The proper implementation is in scaleValues function
      return (value - min) / (max - min);

    case 'equalInterval':
      // Divide the range into equal intervals
      const intervals = 5;
      const intervalSize = (max - min) / intervals;
      const intervalIndex = Math.min(
        Math.floor((value - min) / intervalSize),
        intervals - 1
      );
      return intervalIndex / (intervals - 1);

    default:
      return (value - min) / (max - min);
  }
}

/**
 * Scale an array of values using quantile method
 */
function quantileScale(values: number[]): Map<number, number> {
  const sorted = [...values].sort((a, b) => a - b);
  const result = new Map<number, number>();

  values.forEach((value) => {
    const rank = sorted.filter((v) => v <= value).length;
    const scaled = (rank - 1) / (sorted.length - 1);
    result.set(value, scaled);
  });

  return result;
}

/**
 * Get color for a scaled value (0 to 1) using the specified color scheme
 */
export function getColorForValue(
  scaledValue: number,
  colorScheme: ColorScheme
): string {
  const colors = COLOR_SCHEMES[colorScheme].colors;
  const scale = chroma.scale(colors).domain([0, 1]);
  return scale(scaledValue).hex();
}

/**
 * Scale all values and assign colors
 */
export function scaleValues(
  values: number[],
  scalingMethod: ScalingMethod,
  colorScheme: ColorScheme
): Map<number, ScaledValue> {
  if (values.length === 0) return new Map();

  const min = Math.min(...values);
  const max = Math.max(...values);
  const result = new Map<number, ScaledValue>();

  // Special handling for quantile method
  if (scalingMethod === 'quantile') {
    const quantileMap = quantileScale(values);
    values.forEach((value) => {
      const scaledValue = quantileMap.get(value) || 0;
      const color = getColorForValue(scaledValue, colorScheme);
      result.set(value, { originalValue: value, scaledValue, color });
    });
    return result;
  }

  // For other methods
  values.forEach((value) => {
    const scaledValue = applyScaling(value, min, max, scalingMethod);
    const color = getColorForValue(scaledValue, colorScheme);
    result.set(value, { originalValue: value, scaledValue, color });
  });

  return result;
}

/**
 * Get legend breaks for display
 */
export function getLegendBreaks(
  min: number,
  max: number,
  scalingMethod: ScalingMethod,
  colorScheme: ColorScheme,
  numBreaks: number = 5
): Array<{ value: number; color: string; label: string }> {
  const breaks: Array<{ value: number; color: string; label: string }> = [];

  for (let i = 0; i < numBreaks; i++) {
    const position = i / (numBreaks - 1);

    let value: number;
    switch (scalingMethod) {
      case 'logarithmic':
        const logMin = Math.log(min + 1);
        const logMax = Math.log(max + 1);
        value = Math.exp(logMin + position * (logMax - logMin)) - 1;
        break;

      case 'equalInterval':
        const intervalSize = (max - min) / (numBreaks - 1);
        value = min + i * intervalSize;
        break;

      case 'quantile':
      case 'linear':
      default:
        value = min + position * (max - min);
        break;
    }

    const color = getColorForValue(position, colorScheme);
    const label = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value).toString();

    breaks.push({ value, color, label });
  }

  return breaks;
}

