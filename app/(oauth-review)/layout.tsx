import { ReactQueryProvider } from "@/providers/ReactQueryProvider";

export default function OAuthReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReactQueryProvider>{children}</ReactQueryProvider>;
}
