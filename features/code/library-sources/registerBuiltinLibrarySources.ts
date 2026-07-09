"use client";

import { registerLibrarySource } from "./registry";
import { promptAppsAdapter } from "./adapters/prompt-apps";
import { agaAppsAdapter } from "./adapters/aga-apps";
import { toolUiComponentsAdapter } from "./adapters/tool-ui-components";
import { htmlPagesAdapter } from "./adapters/html-pages";

registerLibrarySource(promptAppsAdapter);
registerLibrarySource(agaAppsAdapter);
registerLibrarySource(toolUiComponentsAdapter);
registerLibrarySource(htmlPagesAdapter);
