// features/rich-document/actions/handlers/index.ts
//
// Side-effect imports — each handler module registers its actions with
// `registerAction(...)` at module load. Importing this index once
// guarantees the action registry is populated before any RichDocument
// calls `resolveActions()`.
//
// RichDocument.tsx imports this at the top of the file; consumers don't
// need to touch it directly.

import "./copy";
import "./save";
import "./export";
import "./print";
import "./edit";
import "./compare";
import "./creator";
import "./feedback";
import "./fullscreen-editor";
import "./stubs";
import "./app";
import "./server-api";
