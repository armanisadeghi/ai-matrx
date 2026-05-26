"use client";

import TailwindDemo from "../components/TailwindDemo";
import LightDarkDemo from "../components/LightDarkDemo";
import CssVariablesDemo from "../components/CssVariablesDemo";
import ButtonTest from "../components/ButtonTest";
import Animation3dDemo from "../components/Animation3dDemo";
import StandardAnimatedRevealCard from "@/components/matrx/AnimatedRevealCard/StandardAnimatedRevealCard";

const DemoPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <StandardAnimatedRevealCard
          title="Tailwind Demo"
          icon="Palette"
          style="emerald"
          variant={"square"}
          component={TailwindDemo}
        />
        <StandardAnimatedRevealCard
          title="Light/Dark Demo"
          icon="Sun"
          style="fuchsia"
          variant={"square"}
          component={LightDarkDemo}
        />
        <StandardAnimatedRevealCard
          title="CSS Variables Demo"
          icon="Code"
          style="sky"
          variant={"square"}
          component={CssVariablesDemo}
        />
        <StandardAnimatedRevealCard
          title="Button Test"
          icon="MousePointer"
          style="amber"
          variant={"square"}
          component={ButtonTest}
        />
        <StandardAnimatedRevealCard
          title="3D Animation"
          icon="Box"
          style="rose"
          variant={"square"}
          component={Animation3dDemo}
        />

        <StandardAnimatedRevealCard
          title="External Link"
          icon="ExternalLink"
          style="indigo"
          variant={"square"}
          link="/tests/tailwind-test/animations"
        />
      </div>
    </div>
  );
};

export default DemoPage;
