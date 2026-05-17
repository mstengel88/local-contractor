import { data } from "react-router";
import {
  hasAdminQuotePermissionAccess,
} from "../lib/admin-quote-auth.server";
import { getCurrentUser } from "../lib/user-auth.server";
import {
  getDispatchOrders,
  getDispatchRoutes,
} from "../lib/dispatch.server";
import { createDispatchTrackingToken } from "../lib/dispatch-tracking-token.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const allowed = await hasAdminQuotePermissionAccess(request, "driver");
  if (!allowed) {
    return data({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const routeId = String(url.searchParams.get("routeId") || "").trim();
  const orderId = String(url.searchParams.get("orderId") || "").trim();
  if (!routeId) {
    return data({ ok: false, message: "Missing routeId." }, { status: 400 });
  }

  const currentUser = await getCurrentUser(request);
  const canManageDispatch =
    currentUser?.role === "admin" ||
    currentUser?.permissions?.includes("manageDispatch") ||
    (await hasAdminQuotePermissionAccess(request, "manageDispatch"));

  const [routes, orders] = await Promise.all([
    getDispatchRoutes(),
    getDispatchOrders({ lightweight: true }),
  ]);
  const route = routes.find((entry) => entry.id === routeId) || null;
  if (!route) {
    return data({ ok: false, message: "Route not found." }, { status: 404 });
  }

  if (!canManageDispatch && currentUser?.driverEmployeeId !== route.driverId) {
    return data(
      { ok: false, message: "That route is not assigned to this driver login." },
      { status: 403 },
    );
  }

  const order =
    orders.find((entry) => entry.id === orderId && entry.assignedRouteId === route.id) ||
    orders
      .filter((entry) => entry.assignedRouteId === route.id && entry.deliveryStatus !== "delivered")
      .sort((a, b) => Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999))[0] ||
    null;

  const token = createDispatchTrackingToken({
    routeId: route.id,
    orderId: order?.id || null,
    driverId: route.driverId || null,
    driverName: route.driver || currentUser?.name || "Driver",
    truck: route.truck || route.code,
  });

  const endpoint = `${url.origin}/api/dispatch-driver-location`;
  const deepLink = new URL("winterwatch://dispatch-tracking");
  deepLink.searchParams.set("endpoint", endpoint);
  deepLink.searchParams.set("token", token);
  deepLink.searchParams.set("routeId", route.id);
  if (order?.id) deepLink.searchParams.set("orderId", order.id);
  if (route.driverId) deepLink.searchParams.set("driverId", route.driverId);
  deepLink.searchParams.set("driverName", route.driver || currentUser?.name || "Driver");
  deepLink.searchParams.set("truck", route.truck || route.code);

  return data({
    ok: true,
    expiresInSeconds: 60 * 60 * 14,
    routeId: route.id,
    orderId: order?.id || null,
    deepLink: deepLink.toString(),
  });
}
