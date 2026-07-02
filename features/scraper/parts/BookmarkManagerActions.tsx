// BookmarkManagerActions.jsx
import React, { useState } from "react";
import { Button } from "@/components/ui/ButtonMine";
import { SettingsIcon } from "lucide-react";
import BookmarkManager from "./BookmarkManager";

const BookmarkManagerActions = ({ jsonStr }: { jsonStr: string }) => {
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  return (
    <div className="flex space-x-2">
      <Button
        size="xs"
        variant="outline"
        onClick={() => setIsManagerOpen(true)}
        title="Manage Bookmarks"
      >
        <SettingsIcon className="w-3 h-3" />
      </Button>
      <BookmarkManager open={isManagerOpen} onOpenChange={setIsManagerOpen} />
    </div>
  );
};

export default BookmarkManagerActions;
