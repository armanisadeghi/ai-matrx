import { redirect } from "next/navigation";

export default function MarketingPage() {
  // Brands are the anchor entity; a proper overview page replaces this later.
  redirect("/marketing/brands");
}
