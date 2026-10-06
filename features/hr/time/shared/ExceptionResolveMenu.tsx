"use client";

import { useRef, useState } from "react";
import { ListChecks, Info } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@ai-matrx/design-system";
import { TableIconActions } from "@ai-matrx/design-system/data-table";
import type { AttendanceExceptionRow } from "../api/types";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { ExceptionResolveControls } from "./ExceptionsStrip";

/** The desktop action cell opens the same domain controls used by mobile and the strip. */
export function ExceptionResolveMenu({
  exception,
  readOnly,
  mockCase,
  onResolved,
}: {
  exception: AttendanceExceptionRow;
  readOnly: boolean;
  mockCase?: HrFixtureCase;
  onResolved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className="inline-flex">
          <TableIconActions
            actions={[
              {
                id: "exception-decide",
                label: readOnly
                  ? "About exception decisions"
                  : "Decide exception",
                icon: readOnly ? Info : ListChecks,
                onClick: (event) => {
                  anchor.current = event.currentTarget;
                  setOpen(true);
                },
              },
            ]}
          />
        </span>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        width="lg"
        aria-label="Exception decisions"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          anchor.current?.focus();
        }}
      >
        {readOnly ? (
          <p className="type-body text-muted-foreground">
            Your manager decides this. You can add a comment from your HR tasks.
          </p>
        ) : (
          <ExceptionResolveControls
            exception={exception}
            mockCase={mockCase}
            onResolved={() => {
              setOpen(false);
              onResolved();
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
