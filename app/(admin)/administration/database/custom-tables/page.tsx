// record-view: none — an admin list of custom tables
import { CustomTablesAdmin } from "@/features/administration/custom-tables/CustomTablesAdmin";

export const metadata = {
  title: "Custom Tables",
  description: "Every organization's tables; archive many at once",
};

export default function StoreTablesPage() {
  return <CustomTablesAdmin />;
}
