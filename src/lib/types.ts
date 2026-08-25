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
  type: ClientType;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientContact {
  client_id: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  service_address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientType = "individual" | "business";
export type OpportunityStatus =
  | "new"
  | "qualified"
  | "estimating"
  | "quoted"
  | "won"
  | "lost";
export type LeadSource =
  | "website"
  | "referral"
  | "phone"
  | "email"
  | "walk_in"
  | "repeat"
  | "other";
export type ServiceCategory =
  | "boat_repair"
  | "marine_fabrication"
  | "dock_wharf"
  | "boat_painting"
  | "marine_mechanics"
  | "parts"
  | "cad_design"
  | "haul_transport"
  | "other";
export type EstimateStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired";
export type EstimateItemType =
  | "labor"
  | "material"
  | "part"
  | "subcontract"
  | "other";

export interface Opportunity {
  id: string;
  client_id: string;
  title: string;
  status: OpportunityStatus;
  source: LeadSource;
  description: string | null;
  service_categories: ServiceCategory[];
  vessel_name: string | null;
  vessel_make_model: string | null;
  vessel_length_ft: number | null;
  estimated_value: number | null;
  target_date: string | null;
  assigned_to: string | null;
  lost_reason: string | null;
  project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Estimate {
  id: string;
  estimate_number: string;
  opportunity_id: string;
  client_id: string;
  status: EstimateStatus;
  title: string;
  scope: string | null;
  valid_until: string | null;
  notes: string | null;
  terms: string | null;
  tax_rate_percent: number;
  discount_amount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  assigned_to: string | null;
  accepted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateItem {
  id: string;
  estimate_id: string;
  item_type: EstimateItemType;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  sort_order: number;
  created_at: string;
}

export type WorkOrderStatus =
  | "planned"
  | "ready"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";
export type WorkOrderPriority = "low" | "normal" | "high" | "urgent";

export interface WorkOrder {
  id: string;
  work_order_number: string;
  project_id: string;
  title: string;
  description: string | null;
  service_category: ServiceCategory;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_hours: number | null;
  location: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkOrderAssignment {
  work_order_id: string;
  profile_id: string;
  assigned_by: string | null;
  created_at: string;
}

export type ScheduleSlotStatus = "scheduled" | "cancelled";
export type ScheduleEventType = "created" | "rescheduled" | "cancelled";

export type PaintJobStage =
  | "expected"
  | "yard_intake"
  | "wash_mask"
  | "surface_prep"
  | "primer"
  | "coating"
  | "cure_qc"
  | "ready"
  | "delivered"
  | "on_hold"
  | "cancelled";
export type VesselHullMaterial =
  | "fiberglass"
  | "aluminum"
  | "steel"
  | "wood"
  | "composite"
  | "unknown";
export type PaintScopeArea =
  | "bottom"
  | "topsides"
  | "deck"
  | "superstructure"
  | "touch_up"
  | "other";
export type PaintTaskStatus = "pending" | "complete" | "not_applicable";
export type CoatingOperation =
  | "cleaner_dewaxer"
  | "filler_fairing"
  | "primer"
  | "barrier_coat"
  | "tie_coat"
  | "topcoat"
  | "antifouling"
  | "clearcoat"
  | "other";
export type CoatingApplicationMethod =
  | "brush"
  | "roller"
  | "spray"
  | "trowel"
  | "wipe"
  | "other";

export interface WorkOrderScheduleSlot {
  id: string;
  work_order_id: string;
  profile_id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
  status: ScheduleSlotStatus;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkOrderScheduleEvent {
  id: string;
  slot_id: string;
  event_type: ScheduleEventType;
  old_profile_id: string | null;
  new_profile_id: string | null;
  old_starts_at: string | null;
  old_ends_at: string | null;
  new_starts_at: string | null;
  new_ends_at: string | null;
  detail: string | null;
  created_by: string;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  work_order_id: string;
  profile_id: string;
  work_date: string;
  hours: number;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MaterialEntry {
  id: string;
  work_order_id: string;
  description: string;
  part_number: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  line_total: number;
  entered_by: string;
  inventory_item_id: string | null;
  inventory_movement_id: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type InventoryCategory =
  | "aluminum"
  | "steel"
  | "fastener"
  | "paint"
  | "mechanical"
  | "electrical"
  | "dock"
  | "consumable"
  | "safety"
  | "part"
  | "other";
export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";
export type InventoryMovementType =
  | "receipt"
  | "issue"
  | "adjustment_in"
  | "adjustment_out"
  | "return_from_project";

export interface Supplier {
  id: string;
  name: string;
  account_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: InventoryCategory;
  unit: string;
  quantity_on_hand: number;
  average_cost: number;
  selling_price: number | null;
  reorder_point: number;
  location: string | null;
  preferred_supplier_id: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  subtotal: number;
  ordered_at: string | null;
  received_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  inventory_item_id: string;
  supplier_sku: string | null;
  description: string;
  quantity: number;
  quantity_received: number;
  unit: string;
  unit_cost: number;
  line_total: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  inventory_item_id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  unit_cost: number;
  purchase_order_item_id: string | null;
  project_id: string | null;
  work_order_id: string | null;
  invoice_id: string | null;
  counter_sale_id: string | null;
  reverses_movement_id: string | null;
  note: string | null;
  occurred_at: string;
  created_by: string;
}

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "void";
export type InvoicePaymentType = "deposit" | "payment";
export type InvoicePaymentMethod =
  | "cash"
  | "card"
  | "e_transfer"
  | "cheque"
  | "bank_transfer"
  | "other";

export interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  project_id: string | null;
  source_estimate_id: string | null;
  title: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  terms: string | null;
  tax_rate_percent: number;
  discount_amount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  inventory_item_id: string | null;
  item_type: EstimateItemType;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  sort_order: number;
  created_at: string;
}

export interface InvoiceItemCost {
  invoice_item_id: string;
  invoice_id: string;
  inventory_item_id: string;
  inventory_movement_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  payment_type: InvoicePaymentType;
  payment_date: string;
  amount: number;
  method: InvoicePaymentMethod;
  reference: string | null;
  note: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type CounterSaleStatus = "completed" | "void";

export interface CounterSale {
  id: string;
  sale_number: string;
  client_id: string | null;
  customer_name: string;
  status: CounterSaleStatus;
  payment_method: InvoicePaymentMethod;
  payment_reference: string | null;
  subtotal: number;
  tax_rate_percent: number;
  tax_amount: number;
  total: number;
  completed_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CounterSaleItem {
  id: string;
  counter_sale_id: string;
  inventory_item_id: string;
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  sort_order: number;
  created_at: string;
}

export interface CounterSaleItemCost {
  counter_sale_item_id: string;
  counter_sale_id: string;
  inventory_item_id: string;
  issue_movement_id: string;
  return_movement_id: string | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
}

export interface ProjectFinancialSettings {
  project_id: string;
  labor_cost_rate: number;
  overhead_cost: number;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectProfitability {
  project_id: string;
  project_name: string;
  client_id: string | null;
  client_name: string | null;
  invoiced_revenue: number;
  payments_received: number;
  outstanding_balance: number;
  labor_hours: number;
  labor_cost_rate: number;
  labor_cost: number;
  material_cost: number;
  overhead_cost: number;
  total_cost: number;
  gross_profit: number;
  gross_margin_percent: number | null;
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
