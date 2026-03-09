/**
 * Direct reference format for Advisor @ mentions.
 * Ensures the program and AI know exactly which server or file is meant.
 *
 * - Server only: [@server:serverId:DisplayName]
 * - File/folder: [@server:serverId path:path/to/item]
 */

export type AdvisorRef =
  | { kind: "server"; serverId: string; displayName: string }
  | { kind: "path"; serverId: string; path: string };

const SERVER_ONLY_RE = /^\[@server:([^:\]]+):([^\]]+)\]$/;
const SERVER_PATH_RE = /^\[@server:([^\s]+)\s+path:([^\]]+)\]$/;

export function formatServerRef(serverId: string, displayName: string): string {
  return `[@server:${serverId}:${displayName}]`;
}

export function formatPathRef(serverId: string, path: string): string {
  return `[@server:${serverId} path:${path}]`;
}

export function parseRef(token: string): AdvisorRef | null {
  const trimmed = token.trim();
  const serverOnly = SERVER_ONLY_RE.exec(trimmed);
  if (serverOnly) {
    return { kind: "server", serverId: serverOnly[1], displayName: serverOnly[2] };
  }
  const pathMatch = SERVER_PATH_RE.exec(trimmed);
  if (pathMatch) {
    return { kind: "path", serverId: pathMatch[1], path: pathMatch[2] };
  }
  return null;
}

/**
 * Split message content into segments: plain text and ref tokens.
 * Ref tokens match [@server:...] or legacy [@Name].
 */
export function splitContentWithRefs(content: string): Array<{ type: "text"; value: string } | { type: "ref"; value: string; parsed: AdvisorRef | null }> {
  const parts: Array<{ type: "text"; value: string } | { type: "ref"; value: string; parsed: AdvisorRef | null }> = [];
  const refRe = /\[@server:[^\]]+\]|\[@[^\]]+\]/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(content)) !== null) {
    if (m.index > lastEnd) {
      parts.push({ type: "text", value: content.slice(lastEnd, m.index) });
    }
    const value = m[0];
    const parsed = value.startsWith("[@server:") ? parseRef(value) : null;
    parts.push({ type: "ref", value, parsed });
    lastEnd = m.index + value.length;
  }
  if (lastEnd < content.length) {
    parts.push({ type: "text", value: content.slice(lastEnd) });
  }
  return parts;
}

/**
 * Full display label (e.g. for tooltips).
 * Needs server list to resolve serverId -> name for path refs.
 */
export function refDisplayLabel(
  ref: AdvisorRef,
  serverNames: Array<{ id: string; name: string }>
): string {
  if (ref.kind === "server") return ref.displayName;
  const server = serverNames.find((s) => s.id === ref.serverId);
  const name = server?.name ?? ref.serverId;
  return `${name} » ${ref.path}`;
}

/**
 * Short inline label for sleek display in the text: server name or file name only.
 */
export function refInlineLabel(
  ref: AdvisorRef,
  serverNames: Array<{ id: string; name: string }>
): string {
  if (ref.kind === "server") return ref.displayName;
  const segments = ref.path.replace(/\\/g, "/").split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1]! : ref.path;
}

/**
 * Map a raw string offset (e.g. input selectionStart) to display offset
 * when refs are shown as short labels. Used for cursor positioning in overlay.
 */
export function rawOffsetToDisplayOffset(
  rawContent: string,
  rawOffset: number,
  serverNames: Array<{ id: string; name: string }>
): number {
  const segments = splitContentWithRefs(rawContent);
  let rawCount = 0;
  let displayCount = 0;
  for (const seg of segments) {
    if (seg.type === "text") {
      const len = seg.value.length;
      if (rawCount + len >= rawOffset) {
        return displayCount + (rawOffset - rawCount);
      }
      rawCount += len;
      displayCount += len;
    } else {
      const rawLen = seg.value.length;
      const displayLen = seg.parsed ? refInlineLabel(seg.parsed, serverNames).length : seg.value.length;
      if (rawCount + rawLen >= rawOffset) {
        return displayCount + (rawOffset === rawCount ? 0 : displayLen);
      }
      rawCount += rawLen;
      displayCount += displayLen;
    }
  }
  return displayCount;
}
