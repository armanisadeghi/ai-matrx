"use client";

import { useId } from "react";
import { ContentTransferMenu } from "@ai-matrx/design-system/content-transfer";
import { directSource } from "@ai-matrx/kit/content-transfer";
import { useAlchemyDisclosure } from "@/components/agent-copy/useAlchemyDisclosure";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  content: string;
  label?: string;
  tooltip?: string;
  className?: string;
  size?:
    "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "icon" | "roundIcon";
}

/** Plain content uses the same Alchemy gateway as documents and tables. */
export function CopyButton({
  content,
  label,
  tooltip,
  className,
  size = "sm",
}: CopyButtonProps) {
  useAlchemyDisclosure();
  const instanceId = useId();
  const id = `plain-copy:${instanceId}`;
  const title = tooltip || label || "Content";
  return (
    <ContentTransferMenu
      label={title}
      className={cn(
        size === "xs" ? "matrx-alchemy-xs" : "matrx-alchemy-sm",
        className,
      )}
      source={{
        id,
        label: title,
        capture: async () =>
          directSource(
            { kind: "text", text: content },
            {
              id,
              sourceId: id,
              revision: content,
              label: title,
            },
          ),
      }}
    />
  );
}

export default CopyButton;
