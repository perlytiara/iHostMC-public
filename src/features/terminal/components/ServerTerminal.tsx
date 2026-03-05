"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getRawBuffer, subscribeChunks } from "@/lib/server-output-store";

import "@xterm/xterm/css/xterm.css";

interface ServerTerminalProps {
  visible: boolean;
}

export function ServerTerminal({ visible }: ServerTerminalProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [commandLine, setCommandLine] = useState("");

  const safeFit = useCallback(() => {
    const el = containerRef.current;
    const fit = fitRef.current;
    const term = terminalRef.current;
    if (!el || !fit || !term) return;
    const { clientWidth, clientHeight } = el;
    if (clientWidth <= 0 || clientHeight <= 0) return;
    try {
      const core = (term as any)._core;
      if (!core?._renderService?._renderer) return;
      fit.fit();
    } catch {
      /* renderer not ready yet */
    }
  }, []);

  useEffect(() => {
    if (!visible || !containerRef.current) return;
    const el = containerRef.current;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: "hsl(var(--muted) / 0.5)",
        foreground: "hsl(var(--foreground))",
        cursor: "hsl(var(--foreground))",
        cursorAccent: "hsl(var(--background))",
        selectionBackground: "hsl(var(--primary) / 0.3)",
      },
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    terminalRef.current = term;
    fitRef.current = fit;

    const buffer = getRawBuffer();
    if (buffer) {
      term.write(buffer);
    }

    const unsubChunks = subscribeChunks((chunk) => {
      term.write(chunk);
    });

    requestAnimationFrame(() => setTimeout(safeFit, 50));

    const unlisten = term.onData((data) => {
      invoke("send_server_input", { input: data }).catch(() => {});
    });

    return () => {
      unsubChunks();
      unlisten.dispose();
      term.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [visible, safeFit]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(safeFit, 80);
    return () => clearTimeout(t);
  }, [visible, safeFit]);

  useEffect(() => {
    window.addEventListener("resize", safeFit);
    const el = containerRef.current;
    let ro: ResizeObserver | undefined;
    if (el) {
      ro = new ResizeObserver(safeFit);
      ro.observe(el);
    }
    return () => {
      window.removeEventListener("resize", safeFit);
      ro?.disconnect();
    };
  }, [safeFit]);

  const sendCommand = useCallback(() => {
    const line = commandLine.trim();
    if (!line) return;
    const toSend = line.endsWith("\n") ? line : `${line}\n`;
    invoke("send_server_input", { input: toSend }).catch(() => {});
    setCommandLine("");
  }, [commandLine]);

  if (!visible) return null;

  return (
    <div className="flex h-full w-full flex-col">
      <div
        ref={containerRef}
        className={cn(
          "flex-1 min-h-[180px] rounded-b overflow-hidden",
          "[&_.xterm]:rounded-b [&_.xterm-viewport]:rounded-b"
        )}
      />
      <div className="flex gap-2 border-t border-border bg-card/50 p-2">
        <input
          type="text"
          className={cn(
            "flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          )}
          placeholder={t("terminal.placeholder")}
          value={commandLine}
          onChange={(e) => setCommandLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sendCommand();
            }
          }}
        />
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={sendCommand}
        >
          <Send className="h-4 w-4" />
          {t("terminal.send")}
        </button>
      </div>
    </div>
  );
}
