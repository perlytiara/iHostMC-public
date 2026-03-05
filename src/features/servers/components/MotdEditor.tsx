"use client";

import { useMemo } from "react";
import { parseMotd } from "../utils/motdParse";
import { cn } from "@/lib/utils";

export interface MotdEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  "aria-label"?: string;
  /** Tighter layout for wizards/cards */
  compact?: boolean;
}

/**
 * MOTD editor with live Minecraft-style preview.
 * Supports § and & color/format codes (e.g. §a green, §l bold).
 */
export function MotdEditor({
  value,
  onChange,
  placeholder = "A Minecraft Server",
  className,
  label,
  "aria-label": ariaLabel,
  compact = false,
}: MotdEditorProps) {
  const segments = useMemo(() => parseMotd(value || ""), [value]);
  const hasContent = (value || "").trim().length > 0;

  return (
    <div className={cn(compact ? "space-y-1.5" : "space-y-3", className)}>
      {label && (
        <label className={cn("font-medium text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || label}
        className={cn(
          "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-y",
          compact ? "min-h-[48px]" : "min-h-[72px] rounded-xl px-4 py-2.5"
        )}
        spellCheck={false}
      />
      <div className={cn("rounded-lg border border-border bg-card overflow-hidden", !compact && "rounded-xl")}>
        <p className={cn("text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30", compact ? "px-2 py-1" : "px-3 py-1.5")}>
          In-game preview
        </p>
        <div
          className={cn("px-3 py-2 flex items-center flex-wrap gap-0.5 font-medium", compact ? "min-h-[36px] text-xs" : "px-4 py-3 min-h-[52px]")}
          style={{
            background: "linear-gradient(180deg, #2d2d2d 0%, #1e1e1e 100%)",
            color: "#fff",
            fontFamily: "inherit",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {!hasContent ? (
            <span className="text-muted-foreground/70 italic">
              {placeholder}
            </span>
          ) : (
            segments.map((seg, i) => (
              <span
                key={i}
                className={seg.obfuscated ? "opacity-90" : ""}
                style={{
                  color: seg.color,
                  fontWeight: seg.bold ? 700 : 400,
                  fontStyle: seg.italic ? "italic" : "normal",
                  textDecoration: seg.underline
                    ? "underline"
                    : seg.strikethrough
                      ? "line-through"
                      : "none",
                  textDecorationSkipInk: "none",
                }}
              >
                {seg.obfuscated ? "█".repeat(Math.min(seg.text.length, 20)) : seg.text}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
