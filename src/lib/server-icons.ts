/**
 * Per-server icon preference (Lucide icon name). Stored in localStorage so we don't touch backend.
 * Used in collapsed sidebar and server picker cards.
 */

const STORAGE_KEY = "ihostmc:server-icons";

export type ServerIconId =
  | "Server"
  | "Gamepad2"
  | "Cpu"
  | "HardDrive"
  | "Box"
  | "LayoutDashboard"
  | "Terminal"
  | "Puzzle"
  | "Database"
  | "Cloud"
  | "Folder"
  | "Archive"
  | "Zap"
  | "Shield"
  | "Globe"
  | "Home";

export const SERVER_ICON_IDS: ServerIconId[] = [
  "Server",
  "Gamepad2",
  "Cpu",
  "HardDrive",
  "Box",
  "LayoutDashboard",
  "Terminal",
  "Puzzle",
  "Database",
  "Cloud",
  "Folder",
  "Archive",
  "Zap",
  "Shield",
  "Globe",
  "Home",
];

export function getServerIcons(): Record<string, ServerIconId> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, ServerIconId> = {};
    for (const [id, name] of Object.entries(parsed)) {
      if (SERVER_ICON_IDS.includes(name as ServerIconId)) out[id] = name as ServerIconId;
    }
    return out;
  } catch {
    return {};
  }
}

export function setServerIcon(serverId: string, iconId: ServerIconId | null): void {
  if (typeof window === "undefined") return;
  const map = getServerIcons();
  if (iconId === null) {
    delete map[serverId];
  } else {
    map[serverId] = iconId;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getServerIcon(serverId: string): ServerIconId | null {
  return getServerIcons()[serverId] ?? null;
}
