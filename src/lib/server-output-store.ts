import { listen } from "@tauri-apps/api/event";

const MAX_LINES = 1000;
const MAX_RAW_BYTES = 500_000;

type LinesListener = () => void;
type ChunkListener = (chunk: string) => void;

let lines: string[] = [];
let rawBuffer = "";
const linesListeners = new Set<LinesListener>();
const chunkListeners = new Set<ChunkListener>();
let initialized = false;

function notifyLines() {
  linesListeners.forEach((fn) => fn());
}

export function initServerOutputStore() {
  if (initialized) return;
  initialized = true;
  listen<string>("server-output", (ev) => {
    const chunk = ev.payload ?? "";
    if (!chunk) return;

    rawBuffer += chunk;
    if (rawBuffer.length > MAX_RAW_BYTES) {
      rawBuffer = rawBuffer.slice(-MAX_RAW_BYTES);
    }

    const newParts = chunk.split(/\r\n|\r|\n/).filter(Boolean);
    if (newParts.length > 0) {
      lines = [...lines, ...newParts].slice(-MAX_LINES);
    }

    chunkListeners.forEach((fn) => fn(chunk));
    notifyLines();
  });
}

export function getOutputLines(): string[] {
  return lines;
}

export function getRawBuffer(): string {
  return rawBuffer;
}

export function clearServerOutput() {
  lines = [];
  rawBuffer = "";
  notifyLines();
}

export function subscribeLines(listener: LinesListener): () => void {
  linesListeners.add(listener);
  return () => linesListeners.delete(listener);
}

export function subscribeChunks(listener: ChunkListener): () => void {
  chunkListeners.add(listener);
  return () => chunkListeners.delete(listener);
}
