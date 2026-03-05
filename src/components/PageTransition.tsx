import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  pageKey: string;
}

const cubic = [0.25, 0.1, 0.25, 1] as const;
const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: cubic, staggerChildren: 0.04 },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export function PageTransition({ children, pageKey }: PageTransitionProps) {
  return (
    <motion.div
      key={pageKey}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.28, ease: cubic }}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden w-full"
    >
      {children}
    </motion.div>
  );
}
