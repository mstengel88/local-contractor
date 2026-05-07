import { data } from "react-router";
import {
  deletePushSubscription,
  getVapidPublicKey,
  savePushSubscription,
} from "../lib/push.server";
import { requireUserPermission } from "../lib/user-auth.server";

export async function loader() {
  return data({
    ok: true,
    publicKey: getVapidPublicKey(),
    configured: Boolean(getVapidPublicKey()),
  });
}

export async function action({ request }: { request: Request }) {
  const currentUser = await requireUserPermission(request, "loader");
  const contentType = request.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries(await request.formData());
  const intent = String(body.intent || "");

  if (intent === "subscribe") {
    await savePushSubscription({
      user: currentUser,
      subscription: body.subscription,
      userAgent: request.headers.get("user-agent") || "",
    });
    return data({ ok: true, message: "Push alerts enabled." });
  }

  if (intent === "unsubscribe") {
    await deletePushSubscription(String(body.endpoint || ""), currentUser);
    return data({ ok: true, message: "Push alerts disabled." });
  }

  return data({ ok: false, message: "Unknown push action." }, { status: 400 });
}
