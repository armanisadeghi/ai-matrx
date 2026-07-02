import React, {useState, useEffect} from 'react';
import {motion, AnimatePresence, useMotionValue, useTransform} from 'motion/react';
import {X, Minus, Maximize2, Minimize2, Command} from 'lucide-react';

interface WindowData {
    id: number;
    title: string;
    content: string;
    minimized?: boolean;
    CustomComponent: React.ComponentType;
}

interface WindowProps extends WindowData {
    onClose: (id: number) => void;
    onMinimize: (id: number) => void;
    onMaximize: (id: number) => void;
    onClick: (id: number) => void;
    isFullScreen: boolean;
}

const Window = ({id, title, content, onClose, onMinimize, onMaximize, onClick, isFullScreen, CustomComponent}: WindowProps) => {
    const scale = useMotionValue(1);
    const boxShadow = useTransform(
        scale,
        [1, 1.05],
        ['0px 10px 30px hsl(var(--muted) / 0.2)', '0px 30px 60px hsl(var(--muted) / 0.4)']
    );

    return (
        <motion.div
            className={`bg-card/80 backdrop-blur-md rounded-lg overflow-hidden ${
                isFullScreen ? 'fixed inset-0 z-40' : ''
            } border-2 border-primary`}
            style={{
                boxShadow,
                scale,
            }}
            onClick={() => !isFullScreen && onClick(id)}
            initial={isFullScreen ? {scale: 0.5, opacity: 0, rotateY: 180} : {scale: 1, opacity: 1, rotateY: 0}}
            animate={isFullScreen ? {scale: 1, opacity: 1, rotateY: 0} : {scale: 1, opacity: 1, rotateY: 0}}
            exit={isFullScreen ? {scale: 0.5, opacity: 0, rotateY: 180} : {scale: 1, opacity: 0, rotateY: 0}}
            transition={{type: 'spring', stiffness: 100, damping: 20, duration: 0.5}}
            drag={!isFullScreen}
            dragConstraints={{left: 0, top: 0, right: 0, bottom: 0}}
            dragElastic={0.1}
            whileHover={isFullScreen ? {} : {scale: 1.05}}
            whileTap={isFullScreen ? {} : {scale: 0.95}}
            layout
        >
            <motion.div
                className={`bg-primary text-primary-foreground p-1 flex justify-between items-center ${isFullScreen ? '' : 'cursor-move'}`}
                onPanEnd={(e, info) => {
                    if (!isFullScreen && Math.abs(info.offset.y) > 100) {
                        onMinimize(id);
                    }
                }}
            >
                <h3 className="text-xs font-semibold">{title}</h3>
                <div className="flex space-x-1">
                    <button onClick={(e) => {
                        e.stopPropagation();
                        onMinimize(id);
                    }} className="text-primary-foreground"><Minus size={12}/></button>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        onMaximize(id);
                    }} className="text-primary-foreground"><Maximize2 size={12}/></button>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        onClose(id);
                    }} className="text-primary-foreground"><X size={12}/></button>
                </div>
            </motion.div>
            <div className={`${isFullScreen ? 'h-[calc(100%-24px)]' : 'h-[calc(100%-24px)]'} overflow-auto`}>
                {isFullScreen ? (
                    <CustomComponent/>
                ) : (
                    <div className="p-4 h-full flex items-center justify-center bg-muted text-muted-foreground">
                        <p>{content}</p>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onCommand: (command: string) => void;
}

const CommandPalette = ({isOpen, onClose, onCommand}: CommandPaletteProps) => (
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

interface WindowManagerProps {
    windows: WindowData[];
}

const WindowManager = ({windows: initialWindows}: WindowManagerProps) => {
    const [windows, setWindows] = useState<WindowData[]>(initialWindows);
    const [fullScreenWindow, setFullScreenWindow] = useState<number | null>(null);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [backgroundPosition, setBackgroundPosition] = useState({x: 0, y: 0});

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key === 'k' && e.metaKey) {
                e.preventDefault();
                setIsCommandPaletteOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, []);

    const closeWindow = (id: number) => {
        setWindows(windows.filter(window => window.id !== id));
        if (fullScreenWindow === id) setFullScreenWindow(null);
    };

    const minimizeWindow = (id: number) => {
        setWindows(windows.map(window =>
            window.id === id ? {...window, minimized: !window.minimized} : window
        ));
        if (fullScreenWindow === id) setFullScreenWindow(null);
    };

    const maximizeWindow = (id: number) => {
        setFullScreenWindow(fullScreenWindow === id ? null : id);
    };

    const handleWindowClick = (id: number) => {
        setFullScreenWindow(id);
    };

    const handleCommand = (command: string) => {
        console.log('Executing command:', command);
    };

    return (
        <motion.div
            className="relative w-full h-dvh overflow-hidden bg-background p-8"
            onMouseMove={(e) => {
                setBackgroundPosition({x: e.clientX / 100, y: e.clientY / 100});
            }}
            animate={{
                backgroundPosition: `${backgroundPosition.x}px ${backgroundPosition.y}px`,
            }}
            transition={{type: 'spring', stiffness: 50, damping: 20}}
        >
            <CommandPalette
                isOpen={isCommandPaletteOpen}
                onClose={() => setIsCommandPaletteOpen(false)}
                onCommand={handleCommand}
            />
            <div className="flex flex-wrap gap-4">
                <AnimatePresence>
                    {windows.map((window) => (
                        <motion.div
                            key={window.id}
                            className={`${fullScreenWindow === window.id ? 'fixed inset-0 z-40' : 'max-w-[300px] flex-grow-0 flex-shrink-0'}`}
                            style={{
                                width: '100%', // or you can set a max-width
                                height: `calc(100% * (2/3))` // Dynamically calculate the height
                            }}
                            initial={fullScreenWindow === window.id ? {scale: 0.5, opacity: 0} : {scale: 1, opacity: 1}}
                            animate={fullScreenWindow === window.id ? {scale: 1, opacity: 1} : {scale: 1, opacity: 1}}
                            exit={{scale: 0.5, opacity: 0}}
                            transition={{duration: 0.5}}
                        >
                            <Window
                                {...window}
                                onClose={closeWindow}
                                onMinimize={minimizeWindow}
                                onMaximize={maximizeWindow}
                                onClick={handleWindowClick}
                                isFullScreen={fullScreenWindow === window.id}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            {fullScreenWindow && (
                <motion.div
                    className="fixed bottom-4 right-4 bg-popover text-popover-foreground p-2 rounded-full shadow-lg cursor-pointer z-50"
                    onClick={() => setFullScreenWindow(null)}
                    initial={{scale: 0, opacity: 0}}
                    animate={{scale: 1, opacity: 1}}
                    exit={{scale: 0, opacity: 0}}
                    whileHover={{scale: 1.1}}
                    whileTap={{scale: 0.9}}
                >
                    <Minimize2 size={24}/>
                </motion.div>
            )}
            <motion.button
                className="fixed bottom-4 left-4 bg-popover text-popover-foreground p-2 rounded-full shadow-lg cursor-pointer z-50"
                onClick={() => setIsCommandPaletteOpen(prev => !prev)}
                whileHover={{scale: 1.1}}
                whileTap={{scale: 0.9}}
            >
                <Command size={24}/>
            </motion.button>
        </motion.div>
    );
};

export default WindowManager;