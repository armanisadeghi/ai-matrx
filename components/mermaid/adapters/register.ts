/**
 * Adapter registration — import this module once (the workbench does) to make
 * all structural-editing adapters available via getAdapter()/getAdapterForType().
 * Import from source per house rule; this is a registration side-effect module,
 * not a barrel re-export.
 */

import { registerAdapter } from "../model/adapter";
import { erAdapter } from "./er";
import { flowchartAdapter } from "./flowchart";
import { journeyAdapter } from "./journey";
import { mindmapAdapter } from "./mindmap";
import { pieAdapter } from "./pie";
import { quadrantAdapter } from "./quadrant";
import { sequenceAdapter } from "./sequence";
import { stateAdapter } from "./state";
import { timelineAdapter } from "./timeline";

registerAdapter(flowchartAdapter);
registerAdapter(mindmapAdapter);
registerAdapter(sequenceAdapter);
registerAdapter(pieAdapter);
registerAdapter(timelineAdapter);
registerAdapter(journeyAdapter);
registerAdapter(quadrantAdapter);
registerAdapter(stateAdapter);
registerAdapter(erAdapter);

export {};
