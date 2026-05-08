import { createCookie, redirect } from "react-router";
import { getCurrentUser } from "./user-auth.server";
import { type UserPermission } from "./user-permissions";

const cookieSecret =
  process.env.QUOTE_ACCESS_COOKIE_SECRET || "dev-secret-change-me";

export const adminQuoteCookie = createCookie("admin_quote_access", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: true,
  secrets: [cookieSecret],
  maxAge: 60 * 60 * 12,
});

export async function hasAdminQuoteAccess(request: Request) {
  const user = await getCurrentUser(request);
  if (user?.mustChangePassword) {
    const url = new URL(request.url);
    throw redirect(`/change-password?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return Boolean(user);
}

export async function hasAdminQuotePermissionAccess(
  request: Request,
  permission: UserPermission,
) {
  const user = await getCurrentUser(request);
  if (user?.mustChangePassword) {
    const url = new URL(request.url);
    throw redirect(`/change-password?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (user) return user.permissions.includes(permission);
  return false;
}
