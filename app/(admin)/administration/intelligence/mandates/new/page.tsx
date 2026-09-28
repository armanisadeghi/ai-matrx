import { NewMandatePage } from "@/features/mandates/authoring/NewMandatePage";

/**
 * /administration/intelligence/mandates/new — create a mandate before its
 * intelligence exists (origin='user'): descriptive inputs, the goal, the
 * output shape. Creating a mandate declares a job for the whole platform, so
 * it is admin work. Auth + admin gating is the `(admin)` layout's job;
 * POST /mandates is `require_super_admin` server-side.
 */
export const metadata = {
  title: "New mandate",
  description: "Declare a job before its intelligence exists",
};

export default function NewMandateRoute() {
  return <NewMandatePage />;
}
