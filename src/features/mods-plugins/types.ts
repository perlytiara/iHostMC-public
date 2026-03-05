export interface ModrinthHit {
  slug: string;
  title: string;
  description: string | null;
  project_type: string;
  icon_url: string | null;
}

export interface SpigetResource {
  id: number;
  name: string;
  tag: string | null;
  version: { id: number; name: string } | null;
  premium: boolean | null;
}

export interface CurseForgeHit {
  id: number;
  name: string;
  slug: string;
  summary: string | null;
  logo: { thumbnailUrl: string | null } | null;
  downloadCount: number | null;
  classId: number | null;
}
