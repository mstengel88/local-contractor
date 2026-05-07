import * as webpush from "web-push";
import { supabaseAdmin } from "./supabase.server";
import type { AppUserProfile } from "./user-auth.server";

const TABLE = "dispatch_push_subscriptions";

type PushSubscriptionJson = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject =
    process.env.VAPID_SUBJECT ||
    process.env.SHOPIFY_APP_URL ||
    "mailto:info@greenhillssupply.com";

  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function savePushSubscription(input: {
  user: AppUserProfile;
  subscription: PushSubscriptionJson;
  userAgent?: string;
}) {
  if (!input.subscription?.endpoint) {
    throw new Error("Push subscription endpoint is missing.");
  }

  const { error } = await supabaseAdmin.from(TABLE).upsert(
    {
      user_id: input.user.id,
      user_email: input.user.email,
      target_role: input.user.permissions.includes("loader") ? "loader" : input.user.role,
      endpoint: input.subscription.endpoint,
      subscription: input.subscription,
      user_agent: input.userAgent || "",
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error?.code === "42P01") {
    throw new Error("Push subscription storage is not ready. Run dispatch_loader_notifications.sql in Supabase.");
  }
  if (error) throw new Error(error.message);
}

export async function deletePushSubscription(endpoint: string, user: AppUserProfile) {
  if (!endpoint) return;
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error?.code === "42P01") return;
  if (error) throw new Error(error.message);
}

async function listPushSubscriptionsForTarget(input: {
  targetUserId?: string | null;
  targetRole?: string;
}) {
  let query = supabaseAdmin.from(TABLE).select("*");
  if (input.targetUserId) {
    query = query.eq("user_id", input.targetUserId);
  } else {
    query = query.eq("target_role", input.targetRole || "loader");
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error?.code === "42P01") return [];
  if (error) throw new Error(error.message);
  return (data || []) as Array<{
    id: string;
    endpoint: string;
    subscription: PushSubscriptionJson;
  }>;
}

export async function sendPushToTarget(input: {
  targetUserId?: string | null;
  targetRole?: string;
  title: string;
  message: string;
  url?: string;
  tag?: string;
}) {
  if (!configureWebPush()) {
    return { sent: 0, skipped: true, reason: "Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY." };
  }

  const subscriptions = await listPushSubscriptionsForTarget(input);
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          row.subscription as any,
          JSON.stringify({
            title: input.title,
            body: input.message,
            url: input.url || "/loader",
            tag: input.tag || "loader-load-next",
          }),
        );
        sent += 1;
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await supabaseAdmin.from(TABLE).delete().eq("id", row.id);
        } else {
          console.warn("[PUSH SEND ERROR]", error?.message || error);
        }
      }
    }),
  );

  return { sent, skipped: false };
}
