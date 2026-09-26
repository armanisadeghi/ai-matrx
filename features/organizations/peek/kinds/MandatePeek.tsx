"use client";

/**
 * MandatePeek — adapter from the uniform PeekProps onto the mandate peek
 * (`features/mandates/peek/MandatePeek.tsx`), the same bridge `AgentPeek` is.
 * `id` is the mandate definition id (the `mandate` entity token) or its key.
 */

import React from "react";
import { MandatePeekModal } from "@/features/mandates/peek/MandatePeek";
import type { PeekProps } from "../types";

export default function MandatePeek({ id, open, onClose }: PeekProps) {
  return <MandatePeekModal mandate={id} isOpen={open} onClose={onClose} />;
}
