import { useMemo } from "react";
import { Form, useActionData, useLoaderData, useLocation } from "react-router";
import { data, redirect } from "react-router";
import {
  adminQuoteCookie,
  getAdminQuotePassword,
  hasAdminQuoteAccess,
} from "../lib/admin-quote-auth.server";
import {
  ensureSeedDispatchEmployees,
  ensureSeedDispatchOrders,
  ensureSeedDispatchRoutes,
  ensureSeedDispatchTrucks,
  getDispatchOrders,
  getDispatchRoutes,
  seedDispatchOrders,
  seedDispatchRoutes,
  type DispatchDeliveryStatus,
  type DispatchOrder,
  type DispatchRoute,
  updateDispatchOrder,
} from "../lib/dispatch.server";

function getDriverPath(url: URL) {
  return url.pathname.startsWith("/app/")
    ? "/app/dispatch/driver"
    : "/dispatch/driver";
}

function getDispatchPath(pathname: string) {
  return pathname.startsWith("/app/") ? "/app/dispatch" : "/dispatch";
}

function getStatusLabel(status?: DispatchDeliveryStatus) {
  if (status === "en_route") return "En route";
  if (status === "arrived") return "Arrived";
  if (status === "delivered") return "Delivered";
  if (status === "issue") return "Issue";
  return "Not started";
}

function getStatusColor(status?: DispatchDeliveryStatus) {
  if (status === "delivered") return "#16a34a";
  if (status === "arrived") return "#0284c7";
  if (status === "en_route") return "#ea580c";
  if (status === "issue") return "#dc2626";
  return "#475569";
}

function buildChecklistJson(form: FormData) {
  return JSON.stringify({
    siteSafe: form.get("siteSafe") === "on",
    loadMatchesTicket: form.get("loadMatchesTicket") === "on",
    customerConfirmedPlacement: form.get("customerConfirmedPlacement") === "on",
    photosTaken: form.get("photosTaken") === "on",
    customChecklist: String(form.get("customChecklist") || "").trim(),
  });
}

async function loadDriverState() {
  try {
    await ensureSeedDispatchTrucks();
    await ensureSeedDispatchEmployees();
    await ensureSeedDispatchOrders();
    await ensureSeedDispatchRoutes();

    return {
      orders: await getDispatchOrders(),
      routes: await getDispatchRoutes(),
      storageReady: true,
      storageError: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load driver route data";
    console.error("[DISPATCH DRIVER STORAGE ERROR]", message);

    return {
      orders: seedDispatchOrders,
      routes: seedDispatchRoutes,
      storageReady: false,
      storageError: message,
    };
  }
}

export async function loader({ request }: any) {
  const url = new URL(request.url);
  const driverPath = getDriverPath(url);

  if (url.searchParams.get("logout") === "1") {
    return redirect(driverPath, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("", { maxAge: 0 }),
      },
    });
  }

  const allowed = await hasAdminQuoteAccess(request);
  if (!allowed) {
    return data({
      allowed: false,
      orders: [],
      routes: [],
      storageReady: false,
      storageError: null,
    });
  }

  return data({
    allowed: true,
    ...(await loadDriverState()),
  });
}

export async function action({ request }: any) {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "login") {
    const password = String(form.get("password") || "");
    const expected = getAdminQuotePassword();

    if (!expected || password !== expected) {
      return data(
        { allowed: false, loginError: "Invalid password", orders: [], routes: [] },
        { status: 401 },
      );
    }

    return data(
      {
        allowed: true,
        loginError: null,
        ...(await loadDriverState()),
      },
      {
        headers: {
          "Set-Cookie": await adminQuoteCookie.serialize("ok"),
        },
      },
    );
  }

  const allowed = await hasAdminQuoteAccess(request);
  if (!allowed) {
    return data(
      { allowed: false, loginError: "Please log in", orders: [], routes: [] },
      { status: 401 },
    );
  }

  if (intent !== "update-stop-status") {
    return data(
      {
        allowed: true,
        ok: false,
        message: "Unknown driver action.",
        ...(await loadDriverState()),
      },
      { status: 400 },
    );
  }

  const orderId = String(form.get("orderId") || "").trim();
  const routeId = String(form.get("routeId") || "").trim();
  const rawStatus = String(form.get("deliveryStatus") || "").trim();
  const deliveryStatus: DispatchDeliveryStatus =
    rawStatus === "en_route" ||
    rawStatus === "arrived" ||
    rawStatus === "delivered" ||
    rawStatus === "issue"
      ? rawStatus
      : "not_started";

  if (!orderId) {
    return data(
      {
        allowed: true,
        ok: false,
        message: "Missing stop selection.",
        selectedRouteId: routeId || null,
        ...(await loadDriverState()),
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const patch: Parameters<typeof updateDispatchOrder>[1] = {
    deliveryStatus: rawStatus === "departed" ? "en_route" : deliveryStatus,
    proofName: String(form.get("proofName") || "").trim() || null,
    proofNotes: String(form.get("proofNotes") || "").trim() || null,
    signatureName: String(form.get("signatureName") || "").trim() || null,
    signatureData: String(form.get("signatureData") || "").trim() || null,
    photoUrls: String(form.get("photoUrls") || "").trim() || null,
    ticketNumbers: String(form.get("ticketNumbers") || "").trim() || null,
    inspectionStatus: String(form.get("inspectionStatus") || "").trim() || null,
    checklistJson: buildChecklistJson(form),
  };

  if (deliveryStatus === "arrived") patch.arrivedAt = now;
  if (rawStatus === "departed") patch.departedAt = now;
  if (deliveryStatus === "delivered") {
    patch.departedAt = patch.departedAt || now;
    patch.deliveredAt = now;
  }

  await updateDispatchOrder(orderId, patch);

  return data({
    allowed: true,
    ok: true,
    message:
      rawStatus === "departed"
        ? "Stop marked departed."
        : `Stop marked ${getStatusLabel(deliveryStatus).toLowerCase()}.`,
    selectedRouteId: routeId || null,
    selectedOrderId: orderId,
    ...(await loadDriverState()),
  });
}

export default function DispatchDriverPage() {
  const loaderData = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const location = useLocation();
  const allowed = actionData?.allowed ?? loaderData.allowed;
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const dispatchHref = getDispatchPath(location.pathname);
  const logoutHref = `${driverHref}?logout=1`;
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const routes = (actionData?.routes ?? loaderData.routes ?? []) as DispatchRoute[];
  const storageReady = actionData?.storageReady ?? loaderData.storageReady ?? false;
  const storageError = actionData?.storageError ?? loaderData.storageError ?? null;
  const searchParams = new URLSearchParams(location.search);
  const selectedRouteId =
    actionData?.selectedRouteId || searchParams.get("route") || routes[0]?.id || "";

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || routes[0] || null;
  const routeStops = useMemo(
    () =>
      selectedRoute
        ? orders
            .filter((order) => order.assignedRouteId === selectedRoute.id)
            .sort(
              (a, b) =>
                Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999),
            )
        : [],
    [orders, selectedRoute],
  );
  const completedCount = routeStops.filter(
    (stop) => stop.deliveryStatus === "delivered",
  ).length;

  if (!allowed) {
    return (
      <div style={styles.page}>
        <div style={styles.loginCard}>
          <h1 style={styles.title}>Driver Route</h1>
          <p style={styles.subtle}>Enter the admin password to open route stops.</p>
          <Form method="post" style={{ display: "grid", gap: 12, marginTop: 18 }}>
            <input type="hidden" name="intent" value="login" />
            <label style={styles.label}>Admin Password</label>
            <input name="password" type="password" style={styles.input} />
            {actionData?.loginError ? (
              <div style={styles.error}>{actionData.loginError}</div>
            ) : null}
            <button type="submit" style={styles.primaryButton}>Open Route</button>
          </Form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>Driver Mode</div>
            <h1 style={styles.title}>{selectedRoute?.truck || "Driver Route"}</h1>
            <p style={styles.subtle}>
              {selectedRoute
                ? `${selectedRoute.driver}${selectedRoute.helper ? ` / ${selectedRoute.helper}` : ""} · ${selectedRoute.shift || "Shift not set"}`
                : "No active route selected"}
            </p>
          </div>
          <div style={styles.headerActions}>
            <a href={dispatchHref} style={styles.ghostButton}>Dispatch</a>
            <a href={logoutHref} style={styles.ghostButton}>Log Out</a>
          </div>
        </header>

        {!storageReady ? (
          <div style={styles.warning}>
            Run `dispatch_schema.sql` in Supabase, then refresh.
            {storageError ? ` Storage error: ${storageError}` : ""}
          </div>
        ) : null}

        {actionData?.message ? (
          <div style={actionData.ok ? styles.success : styles.error}>
            {actionData.message}
          </div>
        ) : null}

        <section style={styles.routePicker}>
          {routes.map((route) => (
            <a
              key={route.id}
              href={`${driverHref}?route=${encodeURIComponent(route.id)}`}
              style={{
                ...styles.routeChip,
                borderColor:
                  route.id === selectedRoute?.id ? route.color : "rgba(203, 213, 225, 0.28)",
                background:
                  route.id === selectedRoute?.id ? `${route.color}22` : "#ffffff",
              }}
            >
              <span style={{ ...styles.routeDot, background: route.color }} />
              <span>{route.code}</span>
              <small>{route.truck}</small>
            </a>
          ))}
        </section>

        <section style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <span>Stops</span>
            <strong>{routeStops.length}</strong>
          </div>
          <div style={styles.summaryCard}>
            <span>Delivered</span>
            <strong>{completedCount}</strong>
          </div>
          <div style={styles.summaryCard}>
            <span>Remaining</span>
            <strong>{Math.max(routeStops.length - completedCount, 0)}</strong>
          </div>
        </section>

        <main style={styles.stopList}>
          {routeStops.length === 0 ? (
            <div style={styles.empty}>No stops assigned to this route yet.</div>
          ) : (
            routeStops.map((stop) => (
              <article key={stop.id} style={styles.stopCard}>
                <div style={styles.stopTop}>
                  <div style={styles.stopNumber}>{stop.stopSequence || "-"}</div>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={styles.stopTitle}>{stop.customer}</h2>
                    <p style={styles.stopAddress}>{stop.address}, {stop.city}</p>
                  </div>
                  <span
                    style={{
                      ...styles.statusPill,
                      color: getStatusColor(stop.deliveryStatus),
                      borderColor: `${getStatusColor(stop.deliveryStatus)}55`,
                      background: `${getStatusColor(stop.deliveryStatus)}18`,
                    }}
                  >
                    {getStatusLabel(stop.deliveryStatus)}
                  </span>
                </div>

                <div style={styles.stopMeta}>
                  <span>{stop.quantity} {stop.unit} {stop.material}</span>
                  <span>{stop.requestedWindow}</span>
                  {stop.eta ? <span>ETA {stop.eta}</span> : null}
                </div>

                {stop.notes ? <p style={styles.notes}>{stop.notes}</p> : null}

                <Form method="post" style={styles.stopForm}>
                  <input type="hidden" name="intent" value="update-stop-status" />
                  <input type="hidden" name="routeId" value={selectedRoute?.id || ""} />
                  <input type="hidden" name="orderId" value={stop.id} />

                  <div style={styles.statusButtons}>
                    {[
                      ["en_route", "En Route"],
                      ["arrived", "Arrived"],
                      ["departed", "Depart"],
                      ["delivered", "Delivered"],
                      ["issue", "Issue"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="submit"
                        name="deliveryStatus"
                        value={value}
                        style={styles.statusButton}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div style={styles.formGrid}>
                    <div>
                      <label style={styles.label}>Proof Name</label>
                      <input
                        name="proofName"
                        defaultValue={stop.proofName || ""}
                        style={styles.input}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Signature Name</label>
                      <input
                        name="signatureName"
                        defaultValue={stop.signatureName || ""}
                        style={styles.input}
                      />
                    </div>
                  </div>

                  <div style={styles.formGrid}>
                    <div>
                      <label style={styles.label}>Ticket Numbers</label>
                      <input
                        name="ticketNumbers"
                        defaultValue={stop.ticketNumbers || ""}
                        placeholder="Ticket #, scale #"
                        style={styles.input}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Inspection Status</label>
                      <select
                        name="inspectionStatus"
                        defaultValue={stop.inspectionStatus || ""}
                        style={styles.input}
                      >
                        <option value="">Not completed</option>
                        <option value="Passed">Passed</option>
                        <option value="Needs review">Needs review</option>
                        <option value="Blocked">Blocked</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={styles.label}>Photo Links / Ticket Photo References</label>
                    <textarea
                      name="photoUrls"
                      defaultValue={stop.photoUrls || ""}
                      rows={3}
                      placeholder="Paste links or file references, one per line"
                      style={styles.textarea}
                    />
                  </div>

                  <div style={styles.checklistGrid}>
                    <label style={styles.checkboxLabel}>
                      <input type="checkbox" name="siteSafe" /> Site safe
                    </label>
                    <label style={styles.checkboxLabel}>
                      <input type="checkbox" name="loadMatchesTicket" /> Load matches ticket
                    </label>
                    <label style={styles.checkboxLabel}>
                      <input type="checkbox" name="customerConfirmedPlacement" /> Placement confirmed
                    </label>
                    <label style={styles.checkboxLabel}>
                      <input type="checkbox" name="photosTaken" /> Photos taken
                    </label>
                  </div>

                  <div>
                    <label style={styles.label}>Signature / Checklist Notes</label>
                    <input
                      name="signatureData"
                      defaultValue={stop.signatureData || ""}
                      placeholder="Typed signature confirmation or device note"
                      style={styles.input}
                    />
                  </div>

                  <div>
                    <label style={styles.label}>Custom Checklist Notes</label>
                    <textarea
                      name="customChecklist"
                      rows={3}
                      placeholder="Inspection findings, placement notes, blocked access, etc."
                      style={styles.textarea}
                    />
                  </div>

                  <div>
                    <label style={styles.label}>Proof Notes</label>
                    <input
                      name="proofNotes"
                      defaultValue={stop.proofNotes || ""}
                      style={styles.input}
                    />
                  </div>
                </Form>
              </article>
            ))
          )}
        </main>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    padding: "16px 14px 34px",
    fontFamily:
      '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } as const,
  shell: {
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 14,
  } as const,
  loginCard: {
    maxWidth: 460,
    margin: "12vh auto 0",
    padding: 20,
    borderRadius: 10,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.12)",
  } as const,
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 10,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
  } as const,
  headerActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  },
  kicker: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  title: {
    margin: "4px 0 0",
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 900,
    letterSpacing: 0,
  },
  subtle: {
    margin: "6px 0 0",
    color: "#64748b",
    lineHeight: 1.45,
  },
  ghostButton: {
    minHeight: 40,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 13,
  } as const,
  routePicker: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  } as const,
  routeChip: {
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr) auto",
    gap: 8,
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    color: "#0f172a",
    textDecoration: "none",
    fontWeight: 900,
  } as const,
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  } as const,
  summaryCard: {
    display: "grid",
    gap: 4,
    padding: 14,
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
  } as const,
  stopList: {
    display: "grid",
    gap: 12,
  } as const,
  stopCard: {
    padding: 14,
    borderRadius: 10,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.07)",
  } as const,
  stopTop: {
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
  } as const,
  stopNumber: {
    width: 36,
    height: 36,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 900,
  } as const,
  stopTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: 0,
  },
  stopAddress: {
    margin: "3px 0 0",
    color: "#475569",
    lineHeight: 1.35,
  },
  statusPill: {
    minHeight: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 10px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap" as const,
  },
  stopMeta: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginTop: 10,
    color: "#334155",
    fontSize: 13,
    fontWeight: 700,
  } as const,
  notes: {
    margin: "10px 0 0",
    padding: 10,
    borderRadius: 8,
    background: "#f1f5f9",
    color: "#334155",
    lineHeight: 1.45,
  },
  stopForm: {
    display: "grid",
    gap: 10,
    marginTop: 12,
  } as const,
  statusButtons: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 8,
  } as const,
  statusButton: {
    minHeight: 44,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
  } as const,
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  } as const,
  label: {
    display: "block",
    marginBottom: 6,
    color: "#475569",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  input: {
    width: "100%",
    minHeight: 42,
    boxSizing: "border-box" as const,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    padding: "10px 11px",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box" as const,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    padding: "10px 11px",
    fontSize: 14,
    resize: "vertical" as const,
  },
  checklistGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  } as const,
  checkboxLabel: {
    minHeight: 38,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#334155",
    fontWeight: 800,
    fontSize: 12,
  } as const,
  primaryButton: {
    minHeight: 44,
    borderRadius: 8,
    border: "none",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  } as const,
  success: {
    padding: 12,
    borderRadius: 8,
    background: "#dcfce7",
    border: "1px solid #86efac",
    color: "#166534",
    fontWeight: 800,
  } as const,
  warning: {
    padding: 12,
    borderRadius: 8,
    background: "#fef3c7",
    border: "1px solid #facc15",
    color: "#854d0e",
    fontWeight: 800,
  } as const,
  error: {
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    border: "1px solid #fca5a5",
    color: "#991b1b",
    fontWeight: 800,
  } as const,
  empty: {
    padding: 18,
    borderRadius: 10,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    color: "#64748b",
    fontWeight: 800,
    textAlign: "center" as const,
  },
};
