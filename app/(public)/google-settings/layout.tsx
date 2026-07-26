import GoogleSettingsLayoutClient from "./GoogleSettingsLayoutClient";

export default function GoogleSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GoogleSettingsLayoutClient>{children}</GoogleSettingsLayoutClient>;
}
