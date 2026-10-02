"use client";

import { useIsMobile } from "@ai-matrx/kit/media-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Construction } from "lucide-react";

interface ComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
}

function Body({
  featureName,
  onClose,
}: {
  featureName: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center space-y-4 py-4 px-2">
      <div className="p-3 bg-primary/10 rounded-full">
        <Construction className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">{featureName}</h3>
      </div>
      <Button
        variant="outline"
        onClick={onClose}
        className="w-full max-w-[200px]"
      >
        OK
      </Button>
    </div>
  );
}

export function ComingSoonModal({
  isOpen,
  onClose,
  featureName,
}: ComingSoonModalProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Coming Soon</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <Body featureName={featureName} onClose={onClose} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Coming Soon</DialogTitle>
        </DialogHeader>
        <Body featureName={featureName} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
