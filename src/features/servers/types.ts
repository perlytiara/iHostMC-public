export type ServerType =
  | "vanilla"
  | "paper"
  | "purpur"
  | "fabric"
  | "forge"
  | "neoforge"
  | "quilt"
  | "spigot"
  | "bukkit";

export interface ServerConfig {
  id: string;
  name: string;
  server_type: ServerType;
  minecraft_version: string;
  memory_mb: number;
  port: number;
  java_path: string | null;
  path: string;
}

export interface CreateServerInput {
  name: string;
  server_type: ServerType;
  minecraft_version: string;
  fabric_loader_version?: string | null;
  fabric_installer_version?: string | null;
  forge_build_version?: string | null;
  neoforge_version?: string | null;
  memory_mb: number;
  port?: number | null;
  java_path: string | null;
  motd?: string | null;
  favicon_b64?: string | null;
}

export interface ForgeBuildOption {
  version: string;
  label: string;
}

export interface JavaPaths {
  bundled: string | null;
  system: string | null;
}
