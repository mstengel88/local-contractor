import { supabaseAdmin } from "./supabase.server";
import { sendPushToTarget } from "./push.server";
import type { AppUserProfile } from "./user-auth.server";
import type { DispatchOrder, DispatchRoute } from "./dispatch.server";

const TABLE = "dispatch_notifications";

export type LoaderNotification = {
  id: string;
  targetUserId: string | null;
  targetRole: string;
  orderId: string | null;
  routeId: string | null;
  title: string;
  message: string;
  status: "unread" | "read";
  createdAt: string;
  readAt: string | null;
};

function normalizeNotification(row: any): LoaderNotification {
  return {
    id: String(row?.id || ""),
    targetUserId: row?.target_user_id || null,
    targetRole: String(row?.target_role || "loader"),
    orderId: row?.order_id || null,
    routeId: row?.route_id || null,
    title: String(row?.title || ""),
    message: String(row?.message || ""),
    status: row?.status === "read" ? "read" : "unread",
    createdAt: String(row?.created_at || ""),
    readAt: row?.read_at || null,
  };
}

function formatOrderNumber(order: DispatchOrder) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}

function getLoadLabel(order: DispatchOrder) {
  return [order.quantity, order.unit, order.material].filter(Boolean).join(" ");
}

function getRouteLabel(route: DispatchRoute | null | undefined) {
  if (!route) return "Unassigned route";
  const parts = [`Route ${route.code}`];
  if (route.truck) parts.push(`Truck ${route.truck}`);
  if (route.driver) parts.push(route.driver);
  return parts.join(" / ");
}

export async function createLoaderNotification(input: {
  order: DispatchOrder;
  route?: DispatchRoute | null;
  actor?: AppUserProfile | null;
  targetUserId?: string | null;
}) {
  const routeLabel = getRouteLabel(input.route);
  const title = `Load next: ${formatOrderNumber(input.order)}`;
  const message = `${getLoadLabel(input.order)} for ${routeLabel} - ${input.order.customer}`;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      target_user_id: input.targetUserId || null,
      target_role: "loader",
      order_id: input.order.id,
      route_id: input.route?.id || input.order.assignedRouteId || null,
      title,
      message,
      status: "unread",
      created_by_user_id: input.actor?.id || null,
      created_by_name: input.actor?.name || input.actor?.email || "System",
    })
    .select("*")
    .single();

  if (error?.code === "42P01") {
    throw new Error("Loader notification storage is not ready. Run dispatch_loader_notifications.sql in Supabase.");
  }
  if (error) throw new Error(error.message);
  const notification = normalizeNotification(data);
  await sendPushToTarget({
    targetUserId: notification.targetUserId,
    targetRole: notification.targetRole,
    title: "New loader assignment",
    message: "Open Loader View to see the next load.",
    url: "/loader",
    tag: `loader-${notification.orderId || notification.id}`,
  }).catch((error) => {
    console.warn("[LOADER PUSH NOTIFICATION ERROR]", error);
  });
  return notification;
}

export async function listLoaderNotifications(user: AppUserProfile, limit = 30) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .or(`target_user_id.eq.${user.id},target_role.eq.loader`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error?.code === "42P01") return [];
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeNotification);
}

export async function markLoaderNotificationRead(id: string, user: AppUserProfile) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      status: "read",
      read_at: new Date().toISOString(),
    })
    .eq("id", id)
    .or(`target_user_id.eq.${user.id},target_role.eq.loader`)
    .select("*")
    .single();

  if (error?.code === "42P01") {
    throw new Error("Loader notification storage is not ready. Run dispatch_loader_notifications.sql in Supabase.");
  }
  if (error) throw new Error(error.message);
  return normalizeNotification(data);
}
