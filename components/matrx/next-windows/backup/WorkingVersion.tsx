'use client';

import React, {useState, useEffect, useRef} from 'react';
import {motion, AnimatePresence, useMotionValue, useTransform} from 'motion/react';
import {X, Minus, Maximize2, Minimize2, Command} from 'lucide-react';
import {useRouter, usePathname} from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

const DEFAULT_IMAGE = '/images/dashboard.jpg';

const Window = ({id, title, content, images, onClose, onMinimize, onMaximize, onClick, isFullScreen, href}) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [validImages, setValidImages] = useState<string[]>([]);
    const scale = useMotionValue(1);
    const boxShadow = useTransform(
        scale,
        [1, 1.05],
        ['0px 10px 30px hsl(var(--muted) / 0.2)', '0px 30px 60px hsl(var(--muted) / 0.4)']
    );

    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const checkImages = async () => {
            const checkedImages = await Promise.all(
                images.map(async (src) => {
                    try {
                        const res = await fetch(src, {method: 'HEAD'});
                        return res.ok ? src : null;
                    } catch {
                        return null;
                    }
                })
            );
            setValidImages(checkedImages.filter((src): src is string => src !== null));
        };

        checkImages();
    }, [images]);

    useEffect(() => {
        if (!isFullScreen && validImages.length > 0) {
            const interval = setInterval(() => {
                setCurrentImageIndex((prevIndex) => (prevIndex + 1) % validImages.length);
            }, 5000);
            return () => clearInterval(interval);
        }
        return undefined;
    }, [isFullScreen, validImages]);

    const handleClick = () => {
        if (!isFullScreen) {
            onClick(id);
        } else {
            router.push(href);
        }
    };

    const currentImage = validImages[currentImageIndex] || DEFAULT_IMAGE;

    return (
        <motion.div
            className={`bg-card/80 backdrop-blur-md rounded-lg overflow-hidden ${
                isFullScreen ? 'fixed inset-0 z-40' : ''
            } border-2 border-primary`}
            style={{
                boxShadow,
                scale,
            }}
            onClick={handleClick}
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
                    <iframe src={href} className="w-full h-full border-none"/>
                ) : (
                    <div className="relative h-full">
                        <Image
                            src={currentImage}
                            alt={title}
                            layout="fill"
                            objectFit="cover"
                            quality={100}
                        />
                        <div
                            className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-4">
                            <p className="text-white text-sm">{content}</p>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

const CommandPalette = ({isOpen, onClose, onCommand}) => (
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

const NextWindowManager = ({windows: initialWindows}) => {
    const [windows, setWindows] = useState(initialWindows);
    const [fullScreenWindow, setFullScreenWindow] = useState(null);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [backgroundPosition, setBackgroundPosition] = useState({x: 0, y: 0});
    const containerRef = useRef<HTMLDivElement>(null);
    const [windowSize, setWindowSize] = useState({width: 0, height: 0});

    const router = useRouter();

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const maxWindowWidth = Math.min(300, containerWidth / 3 - 16); // 3 windows per row, 16px for gaps
                const windowHeight = maxWindowWidth * (3 / 2); // 2:3 aspect ratio
                setWindowSize({width: maxWindowWidth, height: windowHeight});
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleKeyPress = (e) => {
            if (e.key === 'k' && e.metaKey) {
                e.preventDefault();
                setIsCommandPaletteOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, []);

    const closeWindow = (id) => {
        setWindows(windows.filter(window => window.id !== id));
        if (fullScreenWindow === id) setFullScreenWindow(null);
    };

    const minimizeWindow = (id) => {
        setWindows(windows.map(window =>
            window.id === id ? {...window, minimized: !window.minimized} : window
        ));
        if (fullScreenWindow === id) setFullScreenWindow(null);
    };

    const maximizeWindow = (id) => {
        setFullScreenWindow(fullScreenWindow === id ? null : id);
    };

    const handleWindowClick = (id) => {
        setFullScreenWindow(id);
    };

    const handleCommand = (command) => {
        // Implement command handling logic here
        console.log('Executing command:', command);
    };

    return (
        <motion.div
            ref={containerRef}
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
                            className={`${fullScreenWindow === window.id ? 'fixed inset-0 z-40' : ''}`}
                            style={{
                                width: fullScreenWindow === window.id ? '100%' : windowSize.width,
                                height: fullScreenWindow === window.id ? '100%' : windowSize.height,
                                flexGrow: 0,
                                flexShrink: 0,
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

export default NextWindowManager;