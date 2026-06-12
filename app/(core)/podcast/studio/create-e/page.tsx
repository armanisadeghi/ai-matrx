import { CreateConsole } from "./_components/CreateConsole";


// Variation E — the production console.
//
// Server entry. All interactivity lives in <CreateConsole/> (client).
export default function CreateEpisodePageE() {
  return (
    <div className="h-page w-full overflow-hidden bg-textured">
      <CreateConsole />
    </div>
  );
}
