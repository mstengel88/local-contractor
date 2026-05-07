import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { data } from "react-router";
import {
  listLoaderNotifications,
  markLoaderNotificationRead,
  type LoaderNotification,
} from "../lib/loader-notifications.server";
import { requireUserPermission } from "../lib/user-auth.server";

export async function loader({ request }: any) {
  const currentUser = await requireUserPermission(request, "loader");
  const notifications = await listLoaderNotifications(currentUser, 30);
  return data({
    currentUser,
    notifications,
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  });
}

export async function action({ request }: any) {
  const currentUser = await requireUserPermission(request, "loader");
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "mark-read") {
    await markLoaderNotificationRead(String(form.get("id") || ""), currentUser);
    const notifications = await listLoaderNotifications(currentUser, 30);
    return data({ ok: true, message: "Marked loaded.", notifications });
  }

  return data({ ok: false, message: "Unknown loader action." }, { status: 400 });
}

function formatTime(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function LoaderPage() {
  const loaderData = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const [notifications, setNotifications] = useState<LoaderNotification[]>(
    actionData?.notifications || loaderData.notifications || [],
  );
  const lastSeenId = useRef(notifications[0]?.id || "");
  const currentUser = loaderData.currentUser;
  const newest = notifications[0] || null;
  const unread = notifications.filter((notification) => notification.status === "unread");
  const history = notifications.filter((notification) => notification.status === "read");
  const canUseRealtime = Boolean(loaderData.supabaseUrl && loaderData.supabaseAnonKey);
  const [pushStatus, setPushStatus] = useState("Push alerts not enabled on this device.");
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (actionData?.notifications) setNotifications(actionData.notifications);
  }, [actionData]);

  useEffect(() => {
    async function refreshNotifications() {
      try {
        const response = await fetch("/api/loader-notifications");
        const result = await response.json();
        if (response.ok && result?.notifications) {
          setNotifications(result.notifications);
        }
      } catch {
        // Keep the last visible load if a refresh misses.
      }
    }

    const timer = window.setInterval(refreshNotifications, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canUseRealtime) return;
    const client = createClient(loaderData.supabaseUrl, loaderData.supabaseAnonKey);
    const channel = client
      .channel("loader-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dispatch_notifications",
          filter: "target_role=eq.loader",
        },
        () => {
          void fetch("/api/loader-notifications")
            .then((response) => response.json())
            .then((result) => {
              if (result?.notifications) setNotifications(result.notifications);
            })
            .catch(() => null);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [canUseRealtime, loaderData.supabaseAnonKey, loaderData.supabaseUrl]);

  useEffect(() => {
    const newestId = notifications[0]?.id || "";
    if (!newestId || newestId === lastSeenId.current) return;
    lastSeenId.current = newestId;
    document.title = "New load ready";
    window.setTimeout(() => {
      document.title = "Loader";
    }, 5000);
  }, [notifications]);

  const connectionLabel = useMemo(
    () => (canUseRealtime ? "Live + polling backup" : "Polling every 10 seconds"),
    [canUseRealtime],
  );

  function urlBase64ToUint8Array(value: string) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  }

  async function enablePushAlerts() {
    if (!pushSupported) {
      setPushStatus("Push is not supported in this browser. On iPad, install the site to Home Screen first.");
      return;
    }

    setPushBusy(true);
    try {
      const keyResponse = await fetch("/api/loader-push-subscription");
      const keyResult = await keyResponse.json();
      if (!keyResult?.publicKey) {
        setPushStatus("Push is not configured yet. Add VAPID keys to the server environment.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("Push permission was not allowed on this device.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/loader-push-sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey),
        }));

      const response = await fetch("/api/loader-push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "subscribe",
          subscription: subscription.toJSON(),
        }),
      });
      const result = await response.json();
      setPushStatus(result?.message || "Push alerts enabled.");
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : "Unable to enable push alerts.");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.kicker}>Loader Mode</p>
            <h1 style={styles.title}>What to Load Next</h1>
            <p style={styles.subtitle}>
              Signed in as {currentUser.name || currentUser.email}. {connectionLabel}.
            </p>
          </div>
          <nav style={styles.nav}>
            <button
              type="button"
              onClick={enablePushAlerts}
              style={styles.navButton}
              disabled={pushBusy}
            >
              {pushBusy ? "Enabling..." : "Enable Push Alerts"}
            </button>
            <Link to="/classic" style={styles.navButton}>Dispatch</Link>
            <Link to="/login?logout=1" style={styles.navButton}>Log Out</Link>
          </nav>
        </header>

        <div style={styles.pushStatus}>{pushStatus}</div>

        {actionData?.message ? (
          <div style={actionData.ok ? styles.success : styles.error}>{actionData.message}</div>
        ) : null}

        <section style={styles.hero}>
          <div>
            <p style={styles.heroLabel}>Current Load</p>
            <h2 style={styles.heroTitle}>{newest?.title || "Waiting for dispatch"}</h2>
            <p style={styles.heroMessage}>
              {newest?.message || "When dispatch sends the next load, it will show up here."}
            </p>
            {newest ? <p style={styles.heroTime}>Sent {formatTime(newest.createdAt)}</p> : null}
          </div>
          {newest && newest.status === "unread" ? (
            <Form method="post" style={styles.heroAction}>
              <input type="hidden" name="intent" value="mark-read" />
              <input type="hidden" name="id" value={newest.id} />
              <button type="submit" style={styles.primaryButton}>Mark Loaded</button>
            </Form>
          ) : null}
        </section>

        <div style={styles.grid}>
          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>Unread</h2>
            <div style={styles.list}>
              {unread.map((notification) => (
                <NotificationCard key={notification.id} notification={notification} />
              ))}
              {!unread.length ? <p style={styles.empty}>No waiting loads.</p> : null}
            </div>
          </section>

          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>Loaded History</h2>
            <div style={styles.list}>
              {history.slice(0, 10).map((notification) => (
                <NotificationCard key={notification.id} notification={notification} />
              ))}
              {!history.length ? <p style={styles.empty}>Loaded confirmations will show here.</p> : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function NotificationCard({ notification }: { notification: LoaderNotification }) {
  return (
    <article style={styles.card}>
      <div>
        <strong>{notification.title}</strong>
        <p>{notification.message}</p>
        <small>{formatTime(notification.createdAt)}</small>
      </div>
      {notification.status === "unread" ? (
        <Form method="post">
          <input type="hidden" name="intent" value="mark-read" />
          <input type="hidden" name="id" value={notification.id} />
          <button type="submit" style={styles.smallButton}>Loaded</button>
        </Form>
      ) : (
        <span style={styles.readPill}>Loaded</span>
      )}
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#020617",
    color: "#e5e7eb",
    fontFamily: "'Arial Rounded MT Bold', Arial, sans-serif",
    padding: 20,
  },
  shell: { maxWidth: 1180, margin: "0 auto", display: "grid", gap: 18 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "center",
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 22,
    padding: 24,
  },
  kicker: { margin: 0, color: "#38bdf8", textTransform: "uppercase", letterSpacing: 3, fontSize: 13 },
  title: { margin: "6px 0", fontSize: 38 },
  subtitle: { margin: 0, color: "#94a3b8" },
  nav: { display: "flex", gap: 10, flexWrap: "wrap" },
  navButton: {
    color: "#e5e7eb",
    textDecoration: "none",
    border: "1px solid #334155",
    borderRadius: 999,
    padding: "10px 14px",
    background: "#020617",
    fontWeight: 900,
  },
  pushStatus: {
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: 12,
    background: "#0f172a",
    color: "#cbd5e1",
  },
  success: { background: "#052e16", border: "1px solid #16a34a", borderRadius: 14, padding: 12 },
  error: { background: "#450a0a", border: "1px solid #dc2626", borderRadius: 14, padding: 12 },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 22,
    alignItems: "center",
    background: "linear-gradient(135deg, #0ea5e9, #22c55e)",
    color: "#00111d",
    borderRadius: 28,
    padding: 30,
    boxShadow: "0 28px 80px rgba(14, 165, 233, 0.18)",
  },
  heroLabel: { margin: 0, textTransform: "uppercase", letterSpacing: 3, fontSize: 13, opacity: 0.72 },
  heroTitle: { margin: "8px 0", fontSize: 46 },
  heroMessage: { margin: 0, fontSize: 23, lineHeight: 1.3 },
  heroTime: { marginBottom: 0, opacity: 0.75 },
  heroAction: { minWidth: 220 },
  primaryButton: {
    width: "100%",
    border: 0,
    borderRadius: 18,
    padding: "18px 22px",
    fontWeight: 900,
    fontSize: 18,
    background: "#020617",
    color: "#fff",
  },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  panel: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 22, padding: 20 },
  panelTitle: { marginTop: 0 },
  list: { display: "grid", gap: 12 },
  card: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 18,
    padding: 16,
  },
  smallButton: {
    border: 0,
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
    background: "#22c55e",
    color: "#052e16",
  },
  readPill: {
    borderRadius: 999,
    padding: "8px 12px",
    background: "#052e16",
    color: "#86efac",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  empty: { color: "#94a3b8" },
};
