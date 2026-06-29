import React, {useState, useEffect} from 'react';
import {motion, useMotionValue, useTransform} from 'motion/react';
import {X, Minus, Maximize2} from 'lucide-react';
import {useRouter} from 'next/navigation';
import Image from 'next/image';

const DEFAULT_IMAGE = '/images/dashboard.jpg';

interface WindowProps {
    id: string;
    title: string;
    content: string;
    images: string[];
    onClose: (id: string) => void;
    onMinimize: (id: string) => void;
    onMaximize: (id: string) => void;
    onClick: (id: string) => void;
    isFullScreen: boolean;
    isMinimized?: boolean;
    href: string;
    windowSize: { width: number; height: number };
}

const Window: React.FC<WindowProps> = (
    {
        id,
        title,
        content,
        images,
        onClose,
        onMinimize,
        onMaximize,
        onClick,
        isFullScreen,
        isMinimized,
        href,
        windowSize
    }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [validImages, setValidImages] = useState<string[]>([]);
    const scale = useMotionValue(1);
    const boxShadow = useTransform(
        scale,
        [1, 1.05],
        ['0px 10px 30px hsl(var(--muted) / 0.2)', '0px 30px 60px hsl(var(--muted) / 0.4)']
    );

    const router = useRouter();

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
            setValidImages(checkedImages.filter((img): img is string => img !== null));
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
            } ${isMinimized ? 'h-8' : ''} border-2 border-primary cursor-pointer`}
            style={{
                boxShadow,
                scale,
                width: isFullScreen ? '100%' : windowSize.width,
                height: isMinimized ? 32 : (isFullScreen ? '100%' : windowSize.height),
            }}
            onClick={handleClick}
            initial={isFullScreen ? {scale: 0.5, opacity: 0, rotateY: 180} : {scale: 1, opacity: 1, rotateY: 0}}
            animate={isFullScreen ? {scale: 1, opacity: 1, rotateY: 0} : {scale: 1, opacity: 1, rotateY: 0}}
            exit={{scale: 0.5, opacity: 0}}
            transition={{type: 'spring', stiffness: 100, damping: 20, duration: 0.5}}
            drag={!isFullScreen && !isMinimized}
            dragConstraints={{left: 0, top: 0, right: 0, bottom: 0}}
            dragElastic={0.1}
            whileHover={isFullScreen || isMinimized ? {} : {scale: 1.05}}
            whileTap={isFullScreen || isMinimized ? {} : {scale: 0.95}}
            layout
        >
            <motion.div
                className={`bg-primary text-primary-foreground p-1 flex justify-between items-center ${isFullScreen || isMinimized ? '' : 'cursor-move'}`}
                onPanEnd={(e, info) => {
                    if (!isFullScreen && !isMinimized && Math.abs(info.offset.y) > 100) {
                        onMinimize(id);
                    }
                }}
            >
                <h3 className="text-xs font-semibold truncate max-w-[calc(100%-60px)]">{title}</h3>
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
            {!isMinimized && (
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
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
};

export default Window;
