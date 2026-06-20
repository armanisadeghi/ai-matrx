"use client";

import { ReactNode, createContext, useContext, useState } from "react";
import { motion } from "motion/react";
import { Checkbox } from "@/components/ui/checkbox";

interface CheckboxContextProps {
  id: string;
  isChecked: boolean;
  setIsChecked: (isChecked: boolean) => void;
  lineThrough: boolean;
}

const CheckboxContext = createContext<CheckboxContextProps>({
  id: "",
  isChecked: false,
  setIsChecked: () => {},
  lineThrough: false,
});

interface CheckboxProps {
  children: ReactNode;
  id: string;
  lineThrough?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export default function MatrxCheckbox({
  children,
  id,
  lineThrough = false,
  checked = false,
  onChange,
}: CheckboxProps) {
  const [isChecked, setIsChecked] = useState(checked);
  const [isHovered, setIsHovered] = useState(false);

  const handleToggle = () => {
    const newChecked = !isChecked;
    setIsChecked(newChecked);
    if (onChange) {
      onChange(newChecked);
    }
  };

  return (
    <CheckboxContext.Provider
      value={{
        id,
        isChecked,
        setIsChecked,
        lineThrough,
      }}
    >
      <motion.div
        className="flex items-center cursor-pointer select-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleToggle}
        animate={{
          scale: isHovered ? 1.05 : 1,
        }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </CheckboxContext.Provider>
  );
}

function CheckboxIndicator() {
  const { id, isChecked } = useContext(CheckboxContext);

  return (
    <Checkbox
      id={id}
      checked={isChecked}
      tabIndex={-1}
      aria-hidden
      className="pointer-events-none"
    />
  );
}

MatrxCheckbox.Indicator = CheckboxIndicator;

interface CheckboxLabelProps {
  children: ReactNode;
}

function CheckboxLabel({ children }: CheckboxLabelProps) {
  const { isChecked, lineThrough } = useContext(CheckboxContext);

  return (
    <motion.span
      className={`ml-2 text-sm ${lineThrough && isChecked ? "line-through" : ""}`}
      animate={{
        x: isChecked ? [0, 8, 4] : 0,
        color: isChecked
          ? "hsl(var(--muted-foreground))"
          : "hsl(var(--foreground))",
      }}
      transition={{
        duration: 0.3,
        ease: "easeOut",
      }}
    >
      {children}
    </motion.span>
  );
}

MatrxCheckbox.Label = CheckboxLabel;
