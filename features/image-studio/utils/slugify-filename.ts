/**
 * Longest slug `slugifyFilename` keeps before truncating.
 *
 * Exported because it is also the bound the `filename_base` surface write
 * target enforces on an agent and interpolates into its contract prose: the
 * limit the slugifier applies and the limit the agent is told about are this
 * one constant, so they cannot drift.
 */
export const FILENAME_BASE_MAX_CHARS = 60;

/** Lowercase, dash-separated filename base stripped of the extension. */
export function slugifyFilename(raw: string): string {
    const stripped = raw.replace(/\.[^.]+$/, "");
    return (
        stripped
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, FILENAME_BASE_MAX_CHARS) || "image"
    );
}
