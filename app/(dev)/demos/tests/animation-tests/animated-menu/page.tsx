'use client';

import React, { useState } from "react";
import { motion, Variants, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

const itemVariants: Variants = {
    open: {
        opacity: 1,
        y: 0,
        transition: { type: "spring", stiffness: 300, damping: 24 }
    },
    closed: { opacity: 0, y: 20, transition: { duration: 0.2 } }
};

const buttonVariants: Variants = {
    pressed: { scale: 0.95 },
    released: { scale: 1, transition: { type: "spring", stiffness: 400, damping: 10 } }
};

export default function AnimatedMenu() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <motion.nav
            initial={false}
            animate={isOpen ? "open" : "closed"}
            className="w-72"
        >
            <motion.div
                variants={buttonVariants}
                initial="released"
                whileTap="pressed"
            >
                <Button
                    variant="outline"
                    className="w-full justify-between text-left font-normal"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    Menu
                    <motion.div
                        variants={{
                            open: { rotate: 180 },
                            closed: { rotate: 0 }
                        }}
                        transition={{ duration: 0.2 }}
                        style={{ originY: 0.55 }}
                    >
                        <ChevronDown className="h-4 w-4" />
                    </motion.div>
                </Button>
            </motion.div>
            <AnimatePresence>
                {isOpen && (
                    <motion.ul
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={{
                            open: {
                                clipPath: "inset(0% 0% 0% 0% round 0.5rem)",
                                transition: {
                                    type: "spring",
                                    bounce: 0,
                                    duration: 0.7,
                                    delayChildren: 0.3,
                                    staggerChildren: 0.05
                                }
                            },
                            closed: {
                                clipPath: "inset(10% 50% 90% 50% round 0.5rem)",
                                transition: {
                                    type: "spring",
                                    bounce: 0,
                                    duration: 0.3
                                }
                            }
                        }}
                        className="mt-2 space-y-2 bg-accent text-accent-foreground rounded-lg p-2 overflow-hidden"
                    >
                        {['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'].map((item, index) => (
                            <motion.li key={index} variants={itemVariants} className="p-2 rounded-md hover:bg-accent-foreground hover:text-accent cursor-pointer">
                                {item}
                            </motion.li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </motion.nav>
    );
}