/**
 * Role-based access control, shared by the API, the web UI and the mobile app.
 *
 * The UI uses `can()` only to hide or disable controls. The server must call it
 * again on every request; the database's row-level security is the final guard.
 */

export const BUSINESS_ROLES = ["owner", "admin", "agent", "marketing"] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const ACTIONS = [
  // Business and team
  "business.view",
  "business.update",
  "business.delete",
  "team.view",
  "team.invite",
  "team.changeRole",
  "team.remove",
  // Billing
  "billing.view",
  "billing.manage",
  // Properties
  "property.view",
  "property.create",
  "property.update",
  "property.delete",
  // Facebook
  "facebook.connect",
  "facebook.view",
  // Leads and conversations
  "lead.viewAll",
  "lead.viewAssigned",
  "lead.update",
  "lead.assign",
  "conversation.reply",
  // Content and analytics
  "content.create",
  "content.publish",
  "analytics.view",
  // Compliance
  "auditLog.view",
  "data.export",
] as const;
export type Action = (typeof ACTIONS)[number];

const OWNER: readonly Action[] = ACTIONS;

const ADMIN: readonly Action[] = ACTIONS.filter(
  (a) => a !== "business.delete" && a !== "billing.manage",
);

const AGENT: readonly Action[] = [
  "business.view",
  "team.view",
  "property.view",
  "property.update",
  "facebook.view",
  "lead.viewAssigned",
  "lead.update",
  "conversation.reply",
  "analytics.view",
];

const MARKETING: readonly Action[] = [
  "business.view",
  "team.view",
  "property.view",
  "facebook.view",
  "content.create",
  "content.publish",
  "analytics.view",
];

const MATRIX: Record<BusinessRole, ReadonlySet<Action>> = {
  owner: new Set(OWNER),
  admin: new Set(ADMIN),
  agent: new Set(AGENT),
  marketing: new Set(MARKETING),
};

/** Whether a business member with `role` may perform `action`. */
export function can(role: BusinessRole | null | undefined, action: Action): boolean {
  if (!role) return false;
  return MATRIX[role]?.has(action) ?? false;
}

/**
 * Who may assign a role to someone else. Only owners can create owners or
 * admins; admins can manage agents and marketing staff.
 */
export function canAssignRole(actor: BusinessRole, target: BusinessRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target === "agent" || target === "marketing";
  return false;
}
