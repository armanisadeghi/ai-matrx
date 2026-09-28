// Thin route wrapper — implementation lives in features/settings/pages so the
// settings overlay tabs can import it without reaching into a route group
// (cross-group app/(x) imports break parked-profile builds).
export { default } from "@/features/settings/pages/IntegrationsSettingsPage";
