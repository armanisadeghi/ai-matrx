import { CharacterCounter } from "@/features/text-counter/CharacterCounter";

export default function CharacterCounterPage() {
  return (
    <main className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
        <CharacterCounter />
      </div>
    </main>
  );
}
