import { redirect } from "next/navigation";

/**
 * Workflow Battle remains integrated but is deliberately unroutable until its
 * live database relation and generated API paths exist. Rendering the setup
 * against absent contracts would send users into a paid flow that cannot
 * persist or, worse, route its requests through an unrelated endpoint cast.
 */
export default async function WorkflowBattleRoute() {
  redirect("/workflows");
}
