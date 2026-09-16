/**
 * FIXTURE — not real code. The failure ATTACK-4 named: a campaign code path
 * that imports the campaign store and appears in no register, so it ships to
 * production with the switch bypassed. `--self-test` requires the guard to
 * catch this file.
 */
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";

export async function listCustomRecords(client: {
    from: (t: string) => { select: (c: string) => Promise<unknown> };
}): Promise<unknown> {
    // Reads the campaign store directly, and never asks the switch.
    void UNIFIED_DATA_CAMPAIGN.KEY;
    return client.from("custom_record").select("*");
}
