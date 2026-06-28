export type UserRole = "owner" | "draftsperson" | "welder";
export type UserStatus = "invited" | "active" | "disabled";
export type ProjectStatus =
  | "planned"
  | "in_progress"
  | "in_review"
  | "completed"
  | "archived";

export interface Profile {
  id: string;
  full_name: string | null;
  login: string;
  role: UserRole;
  status: UserStatus;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  created_at: string;
}

export type StructureType = "dock" | "wharf" | "pontoon" | "ramp" | "other";

export interface Project {
  id: string;
  name: string;
  client_id: string | null;
  description: string | null;
  status: ProjectStatus;
  cover_url: string | null;
  model_url: string | null;
  revision: number;
  drawing_count: number;
  structure_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  clients?: Client | null;
}

export interface Drawing {
  id: string;
  project_id: string;
  file_path: string;
  original_name: string | null;
  page_count: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export type MediaType = "photo" | "video";

export interface GalleryItem {
  id: string;
  project_id: string;
  file_path: string;
  media_type: MediaType;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProjectMember {
  project_id: string;
  profile_id: string;
}
