/**
 * FIXTURE — not real code. A `runtime` entry that someone remembered to
 * REGISTER and forgot to GATE: the register says the switch covers it and the
 * switch does not. The guard must catch this file.
 */
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";

export async function loadCustomFields(): Promise<string[]> {
    void UNIFIED_DATA_CAMPAIGN.FEATURE;
    return ["reads platform.custom_field_definition with no gate"];
}
