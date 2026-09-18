"use client";

import * as React from "react";

import { cn } from "@/styles/themes/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface BaseProps {
  children: React.ReactNode;
}

interface RootCredenzaProps extends BaseProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface CredenzaProps extends BaseProps {
  className?: string;
  asChild?: true;
}

const desktop = "(min-width: 768px)";

type CredenzaMode = "dialog" | "drawer";

const CredenzaModeContext = React.createContext<CredenzaMode | null>(null);

function useCredenzaMode(): CredenzaMode {
  const mode = React.useContext(CredenzaModeContext);
  if (mode === null) {
    throw new Error("Credenza parts must be used within Credenza");
  }
  return mode;
}

const Credenza = ({ children, ...props }: RootCredenzaProps) => {
  const isDesktop = useMediaQuery(desktop);
  const mode: CredenzaMode = isDesktop ? "dialog" : "drawer";
  const CredenzaRoot = mode === "dialog" ? Dialog : Drawer;

  return (
    <CredenzaModeContext.Provider value={mode}>
      <CredenzaRoot {...props}>{children}</CredenzaRoot>
    </CredenzaModeContext.Provider>
  );
};

const CredenzaTrigger = ({ className, children, ...props }: CredenzaProps) => {
  const mode = useCredenzaMode();
  const Trigger = mode === "dialog" ? DialogTrigger : DrawerTrigger;

  return (
    <Trigger className={className} {...props}>
      {children}
    </Trigger>
  );
};

const CredenzaClose = ({ className, children, ...props }: CredenzaProps) => {
  const mode = useCredenzaMode();
  const Close = mode === "dialog" ? DialogClose : DrawerClose;

  return (
    <Close className={className} {...props}>
      {children}
    </Close>
  );
};

const CredenzaContent = ({ className, children, ...props }: CredenzaProps) => {
  const mode = useCredenzaMode();
  const isDesktop = mode === "dialog";
  const Content = isDesktop ? DialogContent : DrawerContent;

  return (
    <Content
      className={cn(
        !isDesktop &&
          "h-[92dvh] max-h-[92dvh] overflow-hidden [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_[role=combobox]]:min-h-11 [&_[role=combobox]]:text-base",
        className,
      )}
      {...props}
    >
      {lowerCredenzaContent(children, mode)}
    </Content>
  );
};

const CredenzaDescription = ({
  className,
  children,
  ...props
}: CredenzaProps) => {
  const mode = useCredenzaMode();
  const Description =
    mode === "dialog" ? DialogDescription : DrawerDescription;

  return (
    <Description className={className} {...props}>
      {children}
    </Description>
  );
};

const CredenzaHeader = ({ className, children, ...props }: CredenzaProps) => {
  const mode = useCredenzaMode();
  const Header = mode === "dialog" ? DialogHeader : DrawerHeader;

  return (
    <Header className={className} {...props}>
      {children}
    </Header>
  );
};

const CredenzaTitle = ({ className, children, ...props }: CredenzaProps) => {
  const mode = useCredenzaMode();
  const Title = mode === "dialog" ? DialogTitle : DrawerTitle;

  return (
    <Title className={className} {...props}>
      {children}
    </Title>
  );
};

const CredenzaBody = ({ className, children, ...props }: CredenzaProps) => {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:px-0",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

const CredenzaFooter = ({ className, children, ...props }: CredenzaProps) => {
  const mode = useCredenzaMode();
  const Footer = mode === "dialog" ? DialogFooter : DrawerFooter;

  return (
    <Footer className={className} {...props}>
      {children}
    </Footer>
  );
};

/** Lower known Credenza wrappers before DialogContent inspects its children for
 * Radix title/description primitives. Do not execute arbitrary child components. */
function lowerCredenzaContent(
  children: React.ReactNode,
  mode: CredenzaMode,
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    const props = child.props as CredenzaProps;
    if (child.type === CredenzaTitle) {
      const Title = mode === "dialog" ? DialogTitle : DrawerTitle;
      return <Title {...props} />;
    }
    if (child.type === CredenzaDescription) {
      const Description = mode === "dialog" ? DialogDescription : DrawerDescription;
      return <Description {...props} />;
    }
    if (child.type === CredenzaHeader) {
      const Header = mode === "dialog" ? DialogHeader : DrawerHeader;
      return <Header {...props}>{lowerCredenzaContent(props.children, mode)}</Header>;
    }
    return React.cloneElement(child, undefined, lowerCredenzaContent(props.children, mode));
  });
}

export {
  Credenza,
  CredenzaTrigger,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaBody,
  CredenzaFooter,
};
