// /dashboard — the user's personalized hub. Lives in (core) so it shares the
// slim modern shell (sidebar + header) with the rest of the product. The page
// body is a client component; this server wrapper just keeps the route a Server
// Component by default. Guests are redirected off /dashboard by the proxy, and
// new users are funneled to /welcome by the sibling layout.
import { DashboardClient } from "@/features/dashboard/components/DashboardClient";

export default function DashboardPage() {
  return <DashboardClient />;
}
