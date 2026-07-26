import { createRouteMetadata } from "@/utils/route-metadata";
import FieldDemoLayoutClient from "./FieldDemoLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "Field Demo",
  title: "Apps",
  description: "Redux-powered field builder module demo.",
  letter: "Fd", // Field demo (builder)
});

export default FieldDemoLayoutClient;
