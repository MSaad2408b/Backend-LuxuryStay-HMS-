const PERMISSIONS = [
  "manage_users",
  "manage_roles",
  "manage_rooms",
  "view_rooms",
  "manage_bookings",
  "view_all_bookings",
  "manage_invoices",
  "view_all_invoices",
  "manage_housekeeping",
  "view_housekeeping",
  "manage_maintenance",
  "view_all_maintenance",
  "manage_settings",
  "view_reports",
  "manage_notifications",
  "view_audit_logs",
  "submit_feedback",
  "manage_service_requests",
  "view_own_data",
  "delete_own_data",
  "run_backup",
];

const ALL = [...PERMISSIONS];

const ROLE_PERMISSIONS = {
  admin: ALL,
  manager: [
    "manage_rooms", "view_rooms", "manage_bookings", "view_all_bookings",
    "manage_invoices", "view_all_invoices", "manage_housekeeping", "view_housekeeping",
    "manage_maintenance", "view_all_maintenance", "manage_settings", "view_reports",
    "manage_notifications", "view_audit_logs", "manage_service_requests",
    "view_own_data", "run_backup",
  ],
  receptionist: [
    "view_rooms", "manage_bookings", "view_all_bookings", "manage_invoices",
    "view_all_invoices", "manage_housekeeping", "view_housekeeping",
    "manage_maintenance", "view_all_maintenance", "manage_service_requests", "view_own_data",
  ],
  housekeeping: [
    "view_rooms", "view_housekeeping", "manage_housekeeping",
    "manage_maintenance", "view_all_maintenance", "view_own_data",
  ],
  guest: ["view_rooms", "submit_feedback", "manage_service_requests", "view_own_data", "delete_own_data"],
};

const permissionsForRole = (role) => [...(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.guest)];

/**
 * Permissions a user actually holds.
 *
 * The stored `permissions` array is only authoritative when an admin has
 * explicitly overridden it (`permissionsCustomized`). Otherwise the role's
 * defaults win, so an account whose role was changed outside the API (hand
 * seeded data, direct Mongo update, older records) can never keep the previous
 * role's permission set — that mismatch was locking admins out of /api/reports.
 */
const effectivePermissions = (user) => {
  if (!user) return [];
  const stored = Array.isArray(user.permissions) ? user.permissions : [];
  if (user.permissionsCustomized && stored.length) return [...stored];
  return permissionsForRole(user.role);
};

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole, effectivePermissions };
