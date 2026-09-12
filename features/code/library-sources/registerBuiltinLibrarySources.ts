"use client";

import { registerLibrarySource } from "./registry";
import { agaAppsAdapter } from "./adapters/aga-apps";
import { toolUiComponentsAdapter } from "./adapters/tool-ui-components";
import { htmlPagesAdapter } from "./adapters/html-pages";

registerLibrarySource(agaAppsAdapter);
registerLibrarySource(toolUiComponentsAdapter);
registerLibrarySource(htmlPagesAdapter);
