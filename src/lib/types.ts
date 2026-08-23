export type UserRole =
  | "owner"
  | "project_manager"
  | "sales"
  | "draftsperson"
  | "welder"
  | "painter"
  | "mechanic"
  | "installer"
  | "parts"
  | "accounting";
export type UserStatus = "invited" | "active" | "disabled";
export type EmployeeSpecialty =
  | "cad_design"
  | "welding"
  | "aluminum_fabrication"
  | "boat_painting"
  | "marine_mechanics"
  | "dock_installation"
  | "haul_transport"
  | "parts_sales";
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
  phone: string | null;
  job_title: string | null;
  specialties: EmployeeSpecialty[];
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

export type MarkupKind = "pin" | "area" | "ink";
export type MarkupStatus = "open" | "answered" | "resolved";

export interface DrawingMarkup {
  id: string;
  drawing_id: string;
  version: number;
  page_no: number;
  kind: MarkupKind;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  path: unknown | null;
  color: string | null;
  stroke_width: number | null;
  opacity: number;
  status: MarkupStatus;
  title: string | null;
  created_by: string | null;
  carried_from_id: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null; login: string } | null;
}

export interface MarkupComment {
  id: string;
  markup_id: string;
  body: string;
  author: string | null;
  created_at: string;
  profiles?: { full_name: string | null; login: string } | null;
}

export interface MarkupPhoto {
  id: string;
  markup_id: string;
  comment_id: string | null;
  file_path: string;
  uploaded_by: string | null;
  created_at: string;
  url?: string | null;
}

export interface MarkupWithThread extends DrawingMarkup {
  comments: MarkupComment[];
  photos: MarkupPhoto[];
}
