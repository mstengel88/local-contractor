import { useLoaderData } from "react-router";
import { data, redirect } from "react-router";
import {
  adminQuoteCookie,
  hasAdminQuotePermissionAccess,
} from "../lib/admin-quote-auth.server";
import {
  ensureSeedDispatchEmployees,
  ensureSeedDispatchOrders,
  ensureSeedDispatchRoutes,
  ensureSeedDispatchTrucks,
  getDispatchOrders,
  type DispatchDeliveryStatus,
  type DispatchOrder,
} from "../lib/dispatch.server";

function getDetailPath(url: URL) {
  return url.pathname.startsWith("/app/")
    ? "/app/dispatch/driver/detail"
    : "/dispatch/driver/detail";
}

function getStatusLabel(status?: DispatchDeliveryStatus) {
  if (status === "en_route") return "Enroute";
  if (status === "delivered") return "Delivered";
  return "Dispatched";
}

function getStatusColor(status?: DispatchDeliveryStatus) {
  if (status === "delivered") return "#16a34a";
  if (status === "en_route") return "#ea580c";
  return "#0284c7";
}

function getOrderDisplayNumber(order: DispatchOrder) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}

function isImageProof(value?: string | null) {
  return (
    /^data:image\//i.test(String(value || "")) ||
    /^https?:\/\/.+\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i.test(String(value || ""))
  );
}

async function loadOrder(orderId: string) {
  await ensureSeedDispatchTrucks();
  await ensureSeedDispatchEmployees();
  await ensureSeedDispatchOrders();
  await ensureSeedDispatchRoutes();

  const orders = await getDispatchOrders();
  return orders.find((order) => order.id === orderId) || null;
}

export async function loader({ request }: any) {
  const url = new URL(request.url);
  const detailPath = getDetailPath(url);

  if (url.searchParams.get("logout") === "1") {
    return redirect(detailPath, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("", { maxAge: 0 }),
      },
    });
  }

  const allowed = await hasAdminQuotePermissionAccess(request, "driver");
  if (!allowed) {
    return data({ allowed: false, order: null });
  }

  const orderId = url.searchParams.get("order") || "";
  const order = orderId ? await loadOrder(orderId) : null;

  return data({ allowed: true, order });
}

export default function DispatchDriverDetailPage() {
  const loaderData = useLoaderData<typeof loader>() as any;
  const order = loaderData.order as DispatchOrder | null;

  if (!loaderData.allowed) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.title}>Driver Stop Detail</h1>
          <p style={styles.muted}>Please open the driver route and log in first.</p>
        </section>
      </main>
    );
  }

  if (!order) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.title}>Stop Not Found</h1>
          <p style={styles.muted}>This stop may have been unassigned or deleted.</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.header}>
          <div>
            <div style={styles.kicker}>{getOrderDisplayNumber(order)}</div>
            <h1 style={styles.title}>{order.customer}</h1>
            <p style={styles.muted}>{order.contact || "No contact captured"}</p>
          </div>
          <span
            style={{
              ...styles.status,
              color: getStatusColor(order.deliveryStatus),
              borderColor: `${getStatusColor(order.deliveryStatus)}55`,
              background: `${getStatusColor(order.deliveryStatus)}18`,
            }}
          >
            {getStatusLabel(order.deliveryStatus)}
          </span>
        </div>

        <div style={styles.grid}>
          <Info label="Address" value={`${order.address}, ${order.city}`} />
          <Info label="Load" value={`${order.quantity} ${order.unit} ${order.material}`} />
          <Info label="Requested" value={order.requestedWindow || "Not set"} />
          <Info label="Time Preference" value={order.timePreference || "No preference"} />
          <Info label="Travel Time" value={order.travelSummary || "Not calculated"} />
          <Info label="ETA" value={order.eta || "Not set"} />
          <Info label="Stop" value={order.stopSequence ? `Stop ${order.stopSequence}` : "Unassigned"} />
          <Info label="Inspection" value={order.inspectionStatus || "Not completed"} />
          <Info label="Proof Name" value={order.proofName || "Not captured"} />
        </div>

        <section style={styles.noteBox}>
          <div style={styles.label}>Notes</div>
          <p style={styles.noteText}>{order.notes || "No dispatch notes yet."}</p>
        </section>

        {order.proofNotes || order.photoUrls || order.signatureName ? (
          <section style={styles.noteBox}>
            <div style={styles.label}>Driver Proof</div>
            {order.signatureName ? <p style={styles.noteText}>Signature: {order.signatureName}</p> : null}
            {order.proofNotes ? <p style={styles.noteText}>Proof notes: {order.proofNotes}</p> : null}
            {order.photoUrls ? (
              isImageProof(order.photoUrls) ? (
                <img
                  src={order.photoUrls}
                  alt="Delivered material proof"
                  style={styles.photoPreview}
                />
              ) : (
                <p style={styles.noteText}>Photos: {order.photoUrls}</p>
              )
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoCard}>
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{value}</div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    padding: 16,
    fontFamily:
      '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } as const,
  card: {
    maxWidth: 760,
    margin: "0 auto",
    padding: 18,
    borderRadius: 12,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)",
  } as const,
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 16,
  } as const,
  kicker: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  title: {
    margin: "4px 0 0",
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 900,
  },
  muted: {
    margin: "6px 0 0",
    color: "#64748b",
    lineHeight: 1.4,
  },
  status: {
    minHeight: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap" as const,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  } as const,
  infoCard: {
    padding: 12,
    borderRadius: 10,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  } as const,
  label: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  value: {
    marginTop: 5,
    color: "#0f172a",
    fontWeight: 850,
    lineHeight: 1.35,
  },
  noteBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
  } as const,
  noteText: {
    margin: "6px 0 0",
    color: "#334155",
    lineHeight: 1.45,
    whiteSpace: "pre-wrap" as const,
  },
  photoPreview: {
    width: "100%",
    maxHeight: 460,
    marginTop: 8,
    borderRadius: 10,
    objectFit: "contain" as const,
    background: "#e2e8f0",
    border: "1px solid #cbd5e1",
  },
};
