"use client";

export default function AppletTestsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full bg-textured transition-colors">
      <main className="flex-1">{children}</main>
    </div>
  );
}
