import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type LayoutIconType =
  // Single window
  | "left-half"
  | "right-half"
  | "top-half"
  | "bottom-half"
  | "centre"
  | "full"
  // Multi window
  | "grid4"
  | "grid6"
  | "grid8"
  | "grid9"
  | "grid12"
  | "stackLeft2"
  | "stackLeft3"
  | "stackLeft4"
  | "stackLeft5"
  | "stackRight2"
  | "stackRight3"
  | "stackRight4"
  | "stackRight5";

export function LayoutIcon({
  type,
  className,
}: {
  type: LayoutIconType;
  className?: string;
}) {
  const baseBox =
    "w-[18px] h-[18px] border-[1.5px] border-current rounded-sm shrink-0 flex items-center justify-center p-[1px] gap-[1px] overflow-hidden";
  const filled = "bg-current rounded-[1px]";
  const flexRow = "flex flex-row w-full h-full gap-[1px]";
  const flexCol = "flex flex-col w-full h-full gap-[1px]";

  let content: ReactNode = null;

  switch (type) {
    case "left-half":
      content = (
        <div className={flexRow}>
          <div className={cn("w-1/2 h-full", filled)} />
          <div className="w-1/2 h-full" />
        </div>
      );
      break;
    case "right-half":
      content = (
        <div className={flexRow}>
          <div className="w-1/2 h-full" />
          <div className={cn("w-1/2 h-full", filled)} />
        </div>
      );
      break;
    case "top-half":
      content = (
        <div className={flexCol}>
          <div className={cn("w-full h-1/2", filled)} />
          <div className="w-full h-1/2" />
        </div>
      );
      break;
    case "bottom-half":
      content = (
        <div className={flexCol}>
          <div className="w-full h-1/2" />
          <div className={cn("w-full h-1/2", filled)} />
        </div>
      );
      break;
    case "centre":
      content = <div className={cn("w-1/2 h-1/2", filled)} />;
      break;
    case "full":
      content = <div className={cn("w-full h-full", filled)} />;
      break;

    // Grid variants
    case "grid4":
      content = (
        <div className="grid grid-cols-2 grid-rows-2 gap-[1px] w-full h-full">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={filled} />
          ))}
        </div>
      );
      break;
    case "grid6":
      content = (
        <div className="grid grid-cols-3 grid-rows-2 gap-[1px] w-full h-full">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={filled} />
          ))}
        </div>
      );
      break;
    case "grid8":
      content = (
        <div className="grid grid-cols-4 grid-rows-2 gap-[1px] w-full h-full">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className={filled} />
          ))}
        </div>
      );
      break;
    case "grid9":
      content = (
        <div className="grid grid-cols-3 grid-rows-3 gap-[1px] w-full h-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div key={i} className={filled} />
          ))}
        </div>
      );
      break;
    case "grid12":
      content = (
        <div className="grid grid-cols-4 grid-rows-3 gap-[1px] w-full h-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div key={i} className={filled} />
          ))}
        </div>
      );
      break;

    // Stack variants
    case "stackRight2":
      content = (
        <div className={flexRow}>
          <div className="w-1/2 h-full" />
          <div className="w-1/2 h-full flex flex-col gap-[1px]">
            <div className={cn("w-full h-1/2", filled)} />
            <div className={cn("w-full h-1/2", filled)} />
          </div>
        </div>
      );
      break;
    case "stackRight3":
      content = (
        <div className={flexRow}>
          <div className="w-2/3 h-full" />
          <div className="w-1/3 h-full flex flex-col gap-[1px]">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn("w-full flex-1", filled)} />
            ))}
          </div>
        </div>
      );
      break;
    case "stackRight4":
      content = (
        <div className={flexRow}>
          <div className="w-3/4 h-full" />
          <div className="w-1/4 h-full flex flex-col gap-[1px]">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={cn("w-full flex-1", filled)} />
            ))}
          </div>
        </div>
      );
      break;
    case "stackRight5":
      content = (
        <div className={flexRow}>
          <div className="w-4/5 h-full" />
          <div className="w-1/5 h-full flex flex-col gap-[1px]">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={cn("w-full flex-1", filled)} />
            ))}
          </div>
        </div>
      );
      break;
    case "stackLeft2":
      content = (
        <div className={flexRow}>
          <div className="w-1/2 h-full flex flex-col gap-[1px]">
            <div className={cn("w-full h-1/2", filled)} />
            <div className={cn("w-full h-1/2", filled)} />
          </div>
          <div className="w-1/2 h-full" />
        </div>
      );
      break;
    case "stackLeft3":
      content = (
        <div className={flexRow}>
          <div className="w-1/3 h-full flex flex-col gap-[1px]">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn("w-full flex-1", filled)} />
            ))}
          </div>
          <div className="w-2/3 h-full" />
        </div>
      );
      break;
    case "stackLeft4":
      content = (
        <div className={flexRow}>
          <div className="w-1/4 h-full flex flex-col gap-[1px]">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={cn("w-full flex-1", filled)} />
            ))}
          </div>
          <div className="w-3/4 h-full" />
        </div>
      );
      break;
    case "stackLeft5":
      content = (
        <div className={flexRow}>
          <div className="w-1/5 h-full flex flex-col gap-[1px]">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={cn("w-full flex-1", filled)} />
            ))}
          </div>
          <div className="w-4/5 h-full" />
        </div>
      );
      break;
  }

  return <div className={cn(baseBox, className)}>{content}</div>;
}

export function LayoutIconButton({
  onClick,
  type,
  className,
}: {
  onClick: () => void;
  type: LayoutIconType;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center justify-center flex-1 h-8 rounded-md transition-colors",
        "hover:bg-accent/80 text-foreground/50 hover:text-foreground",
        className
      )}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      title={type}
    >
      <LayoutIcon type={type} />
    </button>
  );
}
