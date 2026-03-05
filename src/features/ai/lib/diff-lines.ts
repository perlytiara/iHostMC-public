/**
 * Simple line diff for displaying file changes (git-style).
 * Uses common prefix/suffix to produce one hunk; middle is removed + added lines.
 */

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldStr = typeof oldText === "string" ? oldText : "";
  const newStr = typeof newText === "string" ? newText : "";
  const oldLines = oldStr.split(/\r?\n/);
  const newLines = newStr.split(/\r?\n/);
  const result: DiffLine[] = [];
  const oldLen = oldLines.length;
  const newLen = newLines.length;

  let prefixLen = 0;
  while (
    prefixLen < oldLen &&
    prefixLen < newLen &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    result.push({
      type: "context",
      content: oldLines[prefixLen]!,
      oldLineNum: prefixLen + 1,
      newLineNum: prefixLen + 1,
    });
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldLen - prefixLen &&
    suffixLen < newLen - prefixLen &&
    oldLines[oldLen - 1 - suffixLen] === newLines[newLen - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const removed = oldLines.slice(prefixLen, oldLen - suffixLen);
  const added = newLines.slice(prefixLen, newLen - suffixLen);
  removed.forEach((line, idx) => {
    result.push({ type: "remove", content: line, oldLineNum: prefixLen + idx + 1 });
  });
  added.forEach((line, idx) => {
    result.push({ type: "add", content: line, newLineNum: prefixLen + idx + 1 });
  });

  for (let s = suffixLen - 1; s >= 0; s--) {
    result.push({
      type: "context",
      content: oldLines[oldLen - 1 - s]!,
      oldLineNum: oldLen - s,
      newLineNum: newLen - s,
    });
  }
  return result;
}

/** Summarize diff: "X lines added, Y removed" or "new file" */
export function diffSummary(oldText: string, newText: string): string {
  const oldStr = typeof oldText === "string" ? oldText : "";
  const newStr = typeof newText === "string" ? newText : "";
  const lines = computeLineDiff(oldStr, newStr);
  const added = lines.filter((l) => l.type === "add").length;
  const removed = lines.filter((l) => l.type === "remove").length;
  if (oldStr.trim() === "" && newStr.trim() !== "") return "new file";
  if (added === 0 && removed === 0) return "no changes";
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} line${added !== 1 ? "s" : ""} added`);
  if (removed > 0) parts.push(`${removed} line${removed !== 1 ? "s" : ""} removed`);
  return parts.join(", ");
}
