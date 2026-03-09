/**
 * Minecraft MOTD formatting: § and & color/format codes.
 * §0-§f colors, §l/o/n/m/k/r formatting.
 */

export interface MotdSegment {
  text: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  obfuscated: boolean;
}

const MC_COLORS: Record<string, string> = {
  "0": "#000000",
  "1": "#0000aa",
  "2": "#00aa00",
  "3": "#00aaaa",
  "4": "#aa0000",
  "5": "#aa00aa",
  "6": "#ffaa00",
  "7": "#aaaaaa",
  "8": "#555555",
  "9": "#5555ff",
  a: "#55ff55",
  b: "#55ffff",
  c: "#ff5555",
  d: "#ff55ff",
  e: "#ffff55",
  f: "#ffffff",
};

const DEFAULT_COLOR = "#ffffff";

function parseOne(
  raw: string,
  startColor: string,
  startBold: boolean,
  startItalic: boolean,
  startUnderline: boolean,
  startStrikethrough: boolean,
  startObfuscated: boolean
): MotdSegment[] {
  const segments: MotdSegment[] = [];
  let color = startColor;
  let bold = startBold;
  let italic = startItalic;
  let underline = startUnderline;
  let strikethrough = startStrikethrough;
  let obfuscated = startObfuscated;
  let i = 0;
  let text = "";

  while (i < raw.length) {
    const c = raw[i];
    const next = raw[i + 1];
    const isSection = c === "§" || c === "&";
    if (isSection && next !== undefined) {
      if (text) {
        segments.push({
          text,
          color,
          bold,
          italic,
          underline,
          strikethrough,
          obfuscated,
        });
        text = "";
      }
      const code = next.toLowerCase();
      if (MC_COLORS[code] !== undefined) {
        color = MC_COLORS[code];
        bold = false;
        italic = false;
        underline = false;
        strikethrough = false;
        obfuscated = false;
      } else if (code === "l") bold = true;
      else if (code === "o") italic = true;
      else if (code === "n") underline = true;
      else if (code === "m") strikethrough = true;
      else if (code === "k") obfuscated = true;
      else if (code === "r") {
        color = DEFAULT_COLOR;
        bold = false;
        italic = false;
        underline = false;
        strikethrough = false;
        obfuscated = false;
      }
      i += 2;
      continue;
    }
    text += c;
    i += 1;
  }
  if (text) {
    segments.push({
      text,
      color,
      bold,
      italic,
      underline,
      strikethrough,
      obfuscated,
    });
  }
  return segments;
}

export function parseMotd(motd: string): MotdSegment[] {
  if (!motd) return [];
  return parseOne(
    motd,
    DEFAULT_COLOR,
    false,
    false,
    false,
    false,
    false
  );
}
