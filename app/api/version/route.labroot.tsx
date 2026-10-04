// labroot is admitted only by the lab production build. Using lab.ts here
// would also register a second /api/version route in the shared dev preview.
// Keep the release identity response identical across all four deployments.
export { GET } from "./route";

export const dynamic = "force-dynamic";
