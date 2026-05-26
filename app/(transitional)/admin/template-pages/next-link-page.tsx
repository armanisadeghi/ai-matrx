// page.tsx

import NextNavCardFull from "@/components/matrx/navigation/NextNavCardFull";

const pages = [
  {
    title: "Not Implemented",
    path: "link-here",
    relative: true,
    description: "",
  },
  {
    title: "Not Implemented",
    path: "link-here",
    relative: true,
    description: "",
  },
  {
    title: "Not Implemented",
    path: "link-here",
    relative: true,
    description: "",
  },
  {
    title: "Not Implemented",
    path: "link-here",
    relative: true,
    description: "",
  },
  {
    title: "Not Implemented",
    path: "link-here",
    relative: true,
    description: "",
  },
  {
    title: "Not Implemented",
    path: "link-here",
    relative: true,
    description: "",
  },
  {
    title: "Not Implemented",
    path: "link-here",
    relative: true,
    description: "",
  },
];

export default function Page() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Module Pages</h1>
      <NextNavCardFull items={pages} />
    </div>
  );
}
