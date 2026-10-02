/**
 * The publish feature's "active page" lives in the HOST's `htmlPages` slice
 * (P22). The package names the action by its type instead of importing the
 * host slice; a host without that slice ignores it (no reducer answers), and
 * matrx-frontend's reducer answers it exactly as before.
 *
 * Guard: lib/redux/slices/__tests__/html-pages-answers-the-chat-package-action.test.ts
 * fails if the slice is renamed or the reducer stops answering this type.
 */

import { createAction } from "@reduxjs/toolkit";

export const setActivePageId = createAction<string | null>(
  "htmlPages/setActivePageId",
);
