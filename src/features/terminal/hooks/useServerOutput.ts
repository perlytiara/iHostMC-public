"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOutputLines,
  subscribeLines,
  subscribeChunks,
  clearServerOutput,
} from "@/lib/server-output-store";

const LIST_PATTERN =
  /(\d+)\s*(?:\/|von|of a max of)\s*(\d+)[\s\S]*?online(?::\s*(.*))?/i;

export interface ParsedPlayerList {
  online: number;
  max: number;
  names: string[];
}

export function useServerOutput() {
  const [lines, setLines] = useState<string[]>(getOutputLines);
  const [playerList, setPlayerList] = useState<ParsedPlayerList | null>(null);

  useEffect(() => {
    setLines(getOutputLines());

    const unsubLines = subscribeLines(() => {
      setLines(getOutputLines());
    });

    const unsubChunks = subscribeChunks((chunk) => {
      const newParts = chunk.split(/\r\n|\r|\n/).filter(Boolean);
      for (const line of newParts) {
        const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
        const m = plain.match(LIST_PATTERN);
        if (m) {
          const online = parseInt(m[1], 10);
          const max = parseInt(m[2], 10);
          const namesStr = m[3]?.trim();
          const names = namesStr
            ? namesStr
                .split(/,\s*/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
          setPlayerList({ online, max, names });
          break;
        }
      }
    });

    return () => {
      unsubLines();
      unsubChunks();
    };
  }, []);

  const clear = useCallback(() => {
    clearServerOutput();
    setPlayerList(null);
  }, []);

  return { lines, playerList, clear };
}
