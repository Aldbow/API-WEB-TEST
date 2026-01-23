'use client';

import { motion, AnimatePresence as FramerAnimatePresence, HTMLMotionProps } from 'framer-motion';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const FadeIn = ({ children, className, delay = 0, duration = 0.5 }: { children: ReactNode, className?: string, delay?: number, duration?: number }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration, delay, ease: "easeInOut" }}
        className={className}
    >
        {children}
    </motion.div>
);

export const SlideUp = ({ children, className, delay = 0 }: { children: ReactNode, className?: string, delay?: number }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.4, delay, ease: "easeOut" }}
        className={className}
    >
        {children}
    </motion.div>
);

export const StaggerContainer = ({ children, className, delayChildren = 0.05 }: { children: ReactNode, className?: string, delayChildren?: number }) => (
    <motion.div
        initial="hidden"
        animate="show"
        exit="hidden"
        variants={{
            hidden: { opacity: 0 },
            show: {
                opacity: 1,
                transition: {
                    staggerChildren: delayChildren
                }
            }
        }}
        className={className}
    >
        {children}
    </motion.div>
);

export const StaggerItem = ({ children, className }: { children: ReactNode, className?: string }) => (
    <motion.div
        variants={{
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
        }}
        className={className}
    >
        {children}
    </motion.div>
);

export const ScaleOnHover = ({ children, className, ...props }: HTMLMotionProps<"div">) => (
    <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={cn("cursor-pointer", className)}
        {...props}
    >
        {children}
    </motion.div>
);

export const AnimatePresence = FramerAnimatePresence;
