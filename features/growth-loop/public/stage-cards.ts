import {
    publicCapabilities,
    publicStages,
    type PublicCapability,
    type PublicStage,
} from "../map/loop-map";
import { stageIcon } from "./stage-icons";

/**
 * The resolved public stage model — shared by every customer-facing surface so
 * the ring and the cards can never disagree about step order, wording, or which
 * capabilities are real.
 *
 * Resolved ONCE at module scope, not per render: the map is static data, and
 * resolving an icon component inside a render body trips the React Compiler's
 * static-components rule. Pure data + component references, no JSX — so a server
 * component and a client island can both import it.
 */
export const STAGE_CARDS = publicStages().map((stage, index) => ({
    stage,
    step: index + 1,
    Icon: stageIcon(stage.publicInfo.icon),
    capabilities: publicCapabilities(stage),
}));

export type StageCardModel = {
    stage: PublicStage;
    step: number;
    Icon: ReturnType<typeof stageIcon>;
    capabilities: PublicCapability[];
};
