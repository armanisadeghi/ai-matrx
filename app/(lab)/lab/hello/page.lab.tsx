import { Button } from "@/components/ui/button";

export const metadata = { title: "Hello" };

export default function LabHelloPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Lab smoke page</h1>
      <p className="text-sm text-muted-foreground">Build check v2</p>
      <Button type="submit" variant="primary">Real component</Button>
    </main>
  );
}
