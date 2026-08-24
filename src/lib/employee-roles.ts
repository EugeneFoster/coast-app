import type { EmployeeSpecialty, UserRole, UserStatus } from "@/lib/types";

export const USER_ROLES: Array<{ value: UserRole; label: string }> = [
  { value: "owner", label: "Owner / Admin" },
  { value: "project_manager", label: "Project Manager" },
  { value: "sales", label: "Sales" },
  { value: "draftsperson", label: "CAD Designer" },
  { value: "welder", label: "Welder / Fabricator" },
  { value: "painter", label: "Boat Painter" },
  { value: "mechanic", label: "Marine Mechanic" },
  { value: "installer", label: "Dock Installer" },
  { value: "parts", label: "Parts / Warehouse" },
  { value: "accounting", label: "Accounting" },
];

export const EMPLOYEE_SPECIALTIES: Array<{
  value: EmployeeSpecialty;
  label: string;
}> = [
  { value: "cad_design", label: "CAD design" },
  { value: "welding", label: "Welding" },
  { value: "aluminum_fabrication", label: "Aluminum fabrication" },
  { value: "boat_painting", label: "Boat painting" },
  { value: "marine_mechanics", label: "Marine mechanics" },
  { value: "dock_installation", label: "Dock installation" },
  { value: "haul_transport", label: "Haul & transport" },
  { value: "parts_sales", label: "Parts sales" },
];

export const USER_STATUSES: Array<{ value: UserStatus; label: string }> = [
  { value: "invited", label: "Invited" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
];

export const ASSIGNABLE_PROJECT_ROLES: UserRole[] = [
  "sales",
  "draftsperson",
  "welder",
  "painter",
  "mechanic",
  "installer",
  "parts",
  "accounting",
];

export const ASSIGNABLE_WORK_ORDER_ROLES: UserRole[] = [
  "owner",
  "project_manager",
  "draftsperson",
  "welder",
  "painter",
  "mechanic",
  "installer",
  "parts",
];

const roleValues = new Set<UserRole>(USER_ROLES.map(({ value }) => value));
const specialtyValues = new Set<EmployeeSpecialty>(
  EMPLOYEE_SPECIALTIES.map(({ value }) => value),
);
const statusValues = new Set<UserStatus>(USER_STATUSES.map(({ value }) => value));

export function isUserRole(value: string): value is UserRole {
  return roleValues.has(value as UserRole);
}

export function isEmployeeSpecialty(value: string): value is EmployeeSpecialty {
  return specialtyValues.has(value as EmployeeSpecialty);
}

export function isUserStatus(value: string): value is UserStatus {
  return statusValues.has(value as UserStatus);
}

export function userRoleLabel(role: UserRole) {
  return USER_ROLES.find(({ value }) => value === role)?.label ?? role;
}

export function userStatusLabel(status: UserStatus) {
  return USER_STATUSES.find(({ value }) => value === status)?.label ?? status;
}

export function canManageProjects(role: UserRole) {
  return role === "owner" || role === "draftsperson" || role === "project_manager";
}

export function canManageEmployees(role: UserRole) {
  return canManageProjects(role);
}

export function canManageSales(role: UserRole) {
  return (
    role === "owner" ||
    role === "project_manager" ||
    role === "sales" ||
    role === "draftsperson"
  );
}

export function canViewSales(role: UserRole) {
  return canManageSales(role) || role === "accounting";
}

export function canManageOperations(role: UserRole) {
  return canManageProjects(role);
}

export function canManageInventory(role: UserRole) {
  return role === "owner" || role === "project_manager" || role === "parts";
}

export function canViewInventory(role: UserRole) {
  return canManageInventory(role) || role === "sales" || role === "accounting";
}

export function canViewPurchasing(role: UserRole) {
  return canManageInventory(role) || role === "accounting";
}

export function canManageBilling(role: UserRole) {
  return role === "owner" || role === "project_manager" || role === "accounting";
}

export function canViewBilling(role: UserRole) {
  return canManageBilling(role) || role === "sales";
}

export function canViewProfitability(role: UserRole) {
  return role === "owner" || role === "project_manager" || role === "accounting";
}

export function canManageProjectFinancials(role: UserRole) {
  return role === "owner" || role === "accounting";
}
