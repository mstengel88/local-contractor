export const permissionLabels = {
  quoteTool: "Quote Tool",
  reviewQuotes: "Review Quotes",
  dispatch: "Dispatch",
  driver: "Driver View",
  settings: "Settings",
  sendToShopify: "Send To Shopify",
  manageDispatch: "Manage Dispatch",
  manageUsers: "Manage Users",
  auditLog: "Audit Log",
} as const;

export type UserPermission = keyof typeof permissionLabels;

export const allPermissions = Object.keys(permissionLabels) as UserPermission[];
