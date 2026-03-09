"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { subscribe, dismiss, type ToastItem } from "@/lib/toast-store";
import { cn } from "@/lib/utils";

const variantStyles = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-primary/10 text-foreground",
};

const variantIcons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

function ToastCard({ item }: { item: ToastItem }) {
  const Icon = variantIcons[item.variant];
  const style = variantStyles[item.variant];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur-sm",
        style
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <p className="min-w-0 flex-1 break-words">{item.message}</p>
    </motion.div>
  );
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsub = subscribe(setToasts);
    return () => {
      unsub();
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-full max-w-sm flex-col gap-2"
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto cursor-default"
            onClick={() => dismiss(item.id)}
          >
            <ToastCard item={item} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
