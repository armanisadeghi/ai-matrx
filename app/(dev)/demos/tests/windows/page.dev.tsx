"use client";

import WindowManager from "@/components/matrx/windows";
import CameraPage from "@/components/matrx/camera";

function RemovedDemoPanel({ title }: { title: string }) {
  return (
    <div className="p-6 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-2">
        This demo panel referenced removed legacy modules (registered-function,
        playground). The window shell remains for layout testing.
      </p>
    </div>
  );
}

export default function Page() {
  const windows = [
    {
      id: 1,
      title: "Registered Function List",
      content: "Legacy module removed",
      CustomComponent: () => (
        <RemovedDemoPanel title="Registered Function List" />
      ),
    },
    {
      id: 2,
      title: "AI Playground",
      content: "Legacy module removed",
      CustomComponent: () => <RemovedDemoPanel title="AI Playground" />,
    },
    {
      id: 3,
      title: "Function Management",
      content: "Legacy module removed",
      CustomComponent: () => <RemovedDemoPanel title="Function Management" />,
    },
    {
      id: 4,
      title: "Camera page",
      content: "Take Photos With Your Webcam",
      CustomComponent: CameraPage,
    },
  ];

  return (
    <div className="app">
      <WindowManager windows={windows} />
    </div>
  );
}
