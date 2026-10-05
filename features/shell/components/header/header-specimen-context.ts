// header-specimen-context — lets a page-top TEMPLATE render in place, inside a
// specimen frame, instead of moving into the shell header.
//
// Why: the system page (/demos/ui-unification/system) must show the REAL
// templates, never a hand-drawn mock of them — a mock drifts (2026-10-05: the
// internal-page mock drew two lines of text under a back chevron while the
// real header is one line). Every template ends in PageHeaderPortal; inside a
// <HeaderSpecimen> that portal renders its row where it stands, and the phone
// ⋮ sheet host reads as absent so nothing leaks into the real shell's sheet.
//
// Only `HeaderSpecimen` (templates/HeaderSpecimen.tsx) provides it.

import { createContext, useContext } from "react";

export const HeaderSpecimenContext = createContext(false);

export function useInHeaderSpecimen(): boolean {
  return useContext(HeaderSpecimenContext);
}
