// ShellIcon.tsx — Server component icon renderer
// Icon name strings are resolved via `features/shell/shellIconMap.ts`.

import type { LucideProps } from "lucide-react";
import {
  resolveShellIconName,
  shellIconComponents,
} from "../shellIconMap";

interface ShellIconProps extends LucideProps {
  name: string;
}

export default function ShellIcon({ name, ...props }: ShellIconProps) {
  const Icon = shellIconComponents[resolveShellIconName(name)];
  return <Icon {...props} />;
}
