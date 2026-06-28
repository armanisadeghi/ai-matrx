import { Slider } from "@/components/ui/slider";

interface InputProps {
  children: string;
  value: number;
  set: (newValue: number) => void;
  min?: number;
  max?: number;
}

export function Input({
  value,
  children,
  set,
  min = -200,
  max = 200,
}: InputProps) {
  return (
    <label>
      <code>{children}</code>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([v]) => set(v)}
      />
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => set(parseFloat(e.target.value))}
      />
    </label>
  );
}
