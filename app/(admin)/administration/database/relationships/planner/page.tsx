import { AccessPlanner } from "@/features/admin/relationships/access-planner/AccessPlanner";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "Access Planner | Matrx Admin",
};

export default async function AccessPlannerPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_access_planner_snapshot", {
    p_schema: "web",
  });

  if (error) {
    throw new Error(`Access planner failed to load: ${error.message}`);
  }

  return <AccessPlanner initialSnapshot={data} />;
}
