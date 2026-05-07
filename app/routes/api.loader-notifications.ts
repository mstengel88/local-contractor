import { data } from "react-router";
import {
  listLoaderNotifications,
  markLoaderNotificationRead,
} from "../lib/loader-notifications.server";
import { requireUserPermission } from "../lib/user-auth.server";

export async function loader({ request }: { request: Request }) {
  const currentUser = await requireUserPermission(request, "loader");
  const notifications = await listLoaderNotifications(currentUser, 30);
  return data({ ok: true, notifications });
}

export async function action({ request }: { request: Request }) {
  const currentUser = await requireUserPermission(request, "loader");
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "mark-read") {
    const id = String(form.get("id") || "");
    if (!id) return data({ ok: false, message: "Notification is required." }, { status: 400 });
    const notification = await markLoaderNotificationRead(id, currentUser);
    return data({ ok: true, notification });
  }

  return data({ ok: false, message: "Unknown notification action." }, { status: 400 });
}
