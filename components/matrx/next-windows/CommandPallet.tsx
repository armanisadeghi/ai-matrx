import {AnimatePresence, motion} from "motion/react";
import {X} from "lucide-react";
import React from "react";

const CommandPalette = ({
    isOpen,
    onClose,
    onCommand,
}: {
    isOpen: boolean;
    onClose: () => void;
    onCommand: (command: string) => void;
}) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div
                initial={{opacity: 0, y: -50}}
                animate={{opacity: 1, y: 0}}
                exit={{opacity: 0, y: -50}}
                className="fixed inset-x-0 top-0 z-50 bg-popover shadow-lg rounded-b-lg p-4"
            >
                <div className="flex items-center">
                    <input
                        autoFocus
                        className="w-full p-2 bg-input text-popover-foreground rounded"
                        placeholder="Type a command..."
                        onKeyDown={(e) => {
                            const target = e.target as HTMLInputElement;
                            if (e.key === 'Enter') {
                                onCommand(target.value);
                                onClose();
                            } else if (e.key === 'Escape') {
                                onClose();
                            }
                        }}
                    />
                    <button onClick={onClose} className="ml-2 text-popover-foreground">
                        <X size={20}/>
                    </button>
                </div>
            </motion.div>
        )}
    </AnimatePresence>
);

export default CommandPalette;