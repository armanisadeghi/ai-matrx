"use client";

// components/diff/heavy-renderer-setup.ts
//
// Host wiring for @ai-matrx/diff's ONE injection seam. The package owns the
// entire diff product — views, folding, word-level highlighting, the merge
// tool, the structured entity viewer — and deliberately carries no code-editor
// dependency. This module hands it ours.
//
// Side-effect import from `app/DeferredSingletonWrapper.tsx` (the same pattern
// as the icons and tap-target link registries): that shell is statically
// imported into every route's client boot bundle, so this runs at client
// bundle evaluation, before hydration and before any DiffViewer renders.
//
// Without it nothing breaks — the package's light engine renders a complete
// diff and an explicit `engine="monaco"` says so in its toolbar. Registering
// CodeDiff simply upgrades source-code and very large diffs to Monaco.

import { setHeavyDiffRenderer } from "@ai-matrx/diff/react";
import { CodeDiff } from "./code/CodeDiff";

setHeavyDiffRenderer(CodeDiff);
