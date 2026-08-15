import { ConnectionsHubHeader } from "@/features/marketing/components/integrations/ConnectionsHubHeader";

export default function MarketingConnectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ConnectionsHubHeader />
      {children}
    </>
  );
}
