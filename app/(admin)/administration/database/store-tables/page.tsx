import { StoreTablesAdmin } from "@/features/administration/store-tables/StoreTablesAdmin";

export const metadata = {
  title: "Store Tables",
  description: "Every organization's tables; archive many at once",
};

export default function StoreTablesPage() {
  return <StoreTablesAdmin />;
}
