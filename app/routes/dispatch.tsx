import { type FormEvent, useMemo, useState } from "react";
import { Form, useActionData, useLoaderData, useLocation } from "react-router";
import { data, redirect } from "react-router";
import {
  adminQuoteCookie,
  getAdminQuotePassword,
  hasAdminQuoteAccess,
} from "../lib/admin-quote-auth.server";

type DispatchOrder = {
  id: string;
  source: "email" | "manual";
  customer: string;
  contact: string;
  address: string;
  city: string;
  material: string;
  quantity: string;
  unit: string;
  requestedWindow: string;
  truckPreference?: string;
  notes: string;
  status: "new" | "scheduled" | "hold";
  assignedRouteId?: string;
};

type DispatchRoute = {
  id: string;
  code: string;
  truck: string;
  driver: string;
  helper: string;
  color: string;
  shift: string;
  region: string;
};

const seedRoutes: DispatchRoute[] = [
  {
    id: "route-north",
    code: "R-12",
    truck: "Truck 12",
    driver: "Paul",
    helper: "Manny",
    color: "#f97316",
    shift: "6:30a - 3:30p",
    region: "North / Menomonee Falls",
  },
  {
    id: "route-west",
    code: "R-18",
    truck: "Truck 18",
    driver: "Peter",
    helper: "Luis",
    color: "#06b6d4",
    shift: "7:00a - 4:00p",
    region: "West / Waukesha",
  },
  {
    id: "route-south",
    code: "R-05",
    truck: "Truck 05",
    driver: "Andrew",
    helper: "Nate",
    color: "#22c55e",
    shift: "6:00a - 2:30p",
    region: "South / Oak Creek",
  },
];

const seedOrders: DispatchOrder[] = [
  {
    id: "D-24081",
    source: "email",
    customer: "Oak Creek Plaza",
    contact: "shipping@oakcreekplaza.com",
    address: "2543 W Applebrook Lane",
    city: "Oak Creek, WI",
    material: "Coarse Torpedo Sand",
    quantity: "12",
    unit: "TonS",
    requestedWindow: "Today 9:00a - 11:00a",
    notes: "Forklift on site. Call before arrival.",
    status: "new",
  },
  {
    id: "D-24082",
    source: "email",
    customer: "Merton Build Group",
    contact: "dispatch@mertonbuild.com",
    address: "N67W28345 Silver Spring Dr",
    city: "Sussex, WI",
    material: "Premium Mulch",
    quantity: "22",
    unit: "YardS",
    requestedWindow: "Today 10:30a - 1:00p",
    truckPreference: "Walking floor",
    notes: "Back alley drop. Need photo after unload.",
    status: "scheduled",
    assignedRouteId: "route-west",
  },
  {
    id: "D-24083",
    source: "manual",
    customer: "Village of Men Falls",
    contact: "yard@menfalls.gov",
    address: "W156N8480 Pilgrim Rd",
    city: "Menomonee Falls, WI",
    material: "Road Salt",
    quantity: "8",
    unit: "TonS",
    requestedWindow: "Tomorrow 7:00a - 9:00a",
    notes: "Municipal account. Ticket copy required.",
    status: "hold",
  },
  {
    id: "D-24084",
    source: "email",
    customer: "Lakeview Landscape",
    contact: "ops@lakeviewlandscape.com",
    address: "2211 Scenic Ridge Rd",
    city: "Delafield, WI",
    material: "Screened Topsoil",
    quantity: "16",
    unit: "YardS",
    requestedWindow: "Today 1:00p - 3:00p",
    notes: "Split delivery with second stop if needed.",
    status: "scheduled",
    assignedRouteId: "route-north",
  },
];

function metricCard(label: string, value: string, accent: string) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: "16px 18px",
        background: "rgba(15, 23, 42, 0.92)",
        border: `1px solid ${accent}33`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#f8fafc" }}>
        {value}
      </div>
    </div>
  );
}

export async function loader({ request }: any) {
  const url = new URL(request.url);
  const dispatchPath = url.pathname.startsWith("/app/") ? "/app/dispatch" : "/dispatch";

  if (url.searchParams.get("logout") === "1") {
    return redirect(dispatchPath, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("", { maxAge: 0 }),
      },
    });
  }

  return data({ allowed: await hasAdminQuoteAccess(request) });
}

export async function action({ request }: any) {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent !== "login") {
    return data({ allowed: false, loginError: "Invalid request" }, { status: 400 });
  }

  const password = String(form.get("password") || "");
  const expected = getAdminQuotePassword();

  if (!expected || password !== expected) {
    return data(
      { allowed: false, loginError: "Invalid password" },
      { status: 401 },
    );
  }

  return data(
    { allowed: true, loginError: null },
    {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("ok"),
      },
    },
  );
}

export default function DispatchPage() {
  const loaderData = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const location = useLocation();
  const allowed = actionData?.allowed ?? loaderData.allowed;
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const quoteHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const reviewHref = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  const mobileHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const logoutHref = `${dispatchHref}?logout=1`;

  const [orders, setOrders] = useState<DispatchOrder[]>(seedOrders);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(seedOrders[0]?.id || "");
  const [draftOrder, setDraftOrder] = useState({
    customer: "",
    contact: "",
    address: "",
    city: "",
    material: "",
    quantity: "",
    unit: "TonS",
    requestedWindow: "",
    truckPreference: "",
    notes: "",
  });

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId],
  );

  const routes = useMemo(
    () =>
      seedRoutes.map((route) => {
        const routeOrders = orders.filter((order) => order.assignedRouteId === route.id);
        return {
          ...route,
          stops: routeOrders.length,
          loadSummary: routeOrders
            .map((order) => `${order.quantity} ${order.unit} ${order.material}`)
            .slice(0, 2)
            .join(" • "),
          orders: routeOrders,
        };
      }),
    [orders],
  );

  const inboxOrders = orders.filter((order) => !order.assignedRouteId && order.status === "new");
  const holdOrders = orders.filter((order) => order.status === "hold");
  const scheduledOrders = orders.filter((order) => order.assignedRouteId);

  function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
  }

  function assignOrder(routeId: string) {
    if (!selectedOrder) return;

    setOrders((current) =>
      current.map((order) =>
        order.id === selectedOrder.id
          ? { ...order, assignedRouteId: routeId, status: "scheduled" }
          : order,
      ),
    );
  }

  function moveToHold() {
    if (!selectedOrder) return;

    setOrders((current) =>
      current.map((order) =>
        order.id === selectedOrder.id
          ? { ...order, assignedRouteId: undefined, status: "hold" }
          : order,
      ),
    );
  }

  function unassignOrder() {
    if (!selectedOrder) return;

    setOrders((current) =>
      current.map((order) =>
        order.id === selectedOrder.id
          ? { ...order, assignedRouteId: undefined, status: "new" }
          : order,
      ),
    );
  }

  function addManualOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draftOrder.customer || !draftOrder.address || !draftOrder.material) {
      return;
    }

    const nextOrder: DispatchOrder = {
      id: `D-${24090 + orders.length}`,
      source: "manual",
      customer: draftOrder.customer,
      contact: draftOrder.contact,
      address: draftOrder.address,
      city: draftOrder.city,
      material: draftOrder.material,
      quantity: draftOrder.quantity || "0",
      unit: draftOrder.unit,
      requestedWindow: draftOrder.requestedWindow || "Needs scheduling",
      truckPreference: draftOrder.truckPreference || undefined,
      notes: draftOrder.notes,
      status: "new",
    };

    setOrders((current) => [nextOrder, ...current]);
    setSelectedOrderId(nextOrder.id);
    setDraftOrder({
      customer: "",
      contact: "",
      address: "",
      city: "",
      material: "",
      quantity: "",
      unit: "TonS",
      requestedWindow: "",
      truckPreference: "",
      notes: "",
    });
  }

  if (!allowed) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.shell, maxWidth: 520 }}>
          <div style={styles.loginCard}>
            <h1 style={styles.title}>Dispatch</h1>
            <p style={styles.subtitle}>
              Enter the admin password to open the contractor dispatch workspace.
            </p>

            <Form method="post" autoComplete="off" style={{ marginTop: 22 }}>
              <input type="hidden" name="intent" value="login" />
              <label style={styles.label}>Admin Password</label>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                style={styles.input}
              />

              {actionData?.loginError ? (
                <div style={styles.statusErr}>{actionData.loginError}</div>
              ) : null}

              <button type="submit" style={{ ...styles.primaryButton, width: "100%", marginTop: 16 }}>
                Open Dispatch
              </button>
            </Form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.hero}>
          <div>
            <div style={styles.kicker}>Dispatch Workspace</div>
            <h1 style={styles.title}>Plan, intake, and assign deliveries</h1>
            <p style={styles.subtitle}>
              First contractor-only dispatch slice with email/manual intake, truck and driver
              assignment, route boards, and a Track-POD-inspired planning surface.
            </p>
          </div>

          <div style={styles.heroActions}>
            <a href={mobileHref} style={styles.ghostButton}>Dashboard</a>
            <a href={quoteHref} style={styles.ghostButton}>Quote Tool</a>
            <a href={reviewHref} style={styles.ghostButton}>Review Quotes</a>
            <a href={logoutHref} style={styles.ghostButton}>Log Out</a>
          </div>
        </div>

        <div style={styles.metricsGrid}>
          {metricCard("Inbox", String(inboxOrders.length), "#f97316")}
          {metricCard("Scheduled", String(scheduledOrders.length), "#22c55e")}
          {metricCard("On Hold", String(holdOrders.length), "#eab308")}
          {metricCard("Active Trucks", String(routes.length), "#38bdf8")}
        </div>

        <div style={styles.workspaceGrid}>
          <div style={styles.leftColumn}>
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Email Intake Queue</h2>
                  <p style={styles.panelSub}>
                    Orders that came in by email or were typed in manually can be reviewed and routed here.
                  </p>
                </div>
                <div style={styles.headerPill}>Today</div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {orders.map((order) => {
                  const active = order.id === selectedOrder?.id;
                  const route = routes.find((entry) => entry.id === order.assignedRouteId);
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => selectOrder(order.id)}
                      style={{
                        ...styles.queueCard,
                        borderColor: active ? "#38bdf8" : "rgba(51, 65, 85, 0.92)",
                        boxShadow: active
                          ? "0 0 0 1px rgba(56, 189, 248, 0.45)"
                          : "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <div style={styles.queueTitle}>{order.customer}</div>
                          <div style={styles.queueMeta}>
                            {order.address}, {order.city}
                          </div>
                        </div>
                        <div style={styles.badge(order.status)}>
                          {order.status}
                        </div>
                      </div>

                      <div style={styles.queueDetails}>
                        <span>{order.id}</span>
                        <span>{order.quantity} {order.unit}</span>
                        <span>{order.material}</span>
                      </div>

                      <div style={styles.queueFooter}>
                        <span>{order.requestedWindow}</span>
                        <span>
                          {route ? `${route.truck} / ${route.driver}` : "Unassigned"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Manual Intake</h2>
                  <p style={styles.panelSub}>
                    Start the GoCanvas-style capture flow by typing in the order details you need dispatch to track.
                  </p>
                </div>
              </div>

              <form onSubmit={addManualOrder} style={{ display: "grid", gap: 12 }}>
                <div style={styles.formGridTwo}>
                  <div>
                    <label style={styles.label}>Customer</label>
                    <input
                      value={draftOrder.customer}
                      onChange={(event) =>
                        setDraftOrder((current) => ({ ...current, customer: event.target.value }))
                      }
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Contact / Email</label>
                    <input
                      value={draftOrder.contact}
                      onChange={(event) =>
                        setDraftOrder((current) => ({ ...current, contact: event.target.value }))
                      }
                      style={styles.input}
                    />
                  </div>
                </div>

                <div style={styles.formGridTwo}>
                  <div>
                    <label style={styles.label}>Jobsite Address</label>
                    <input
                      value={draftOrder.address}
                      onChange={(event) =>
                        setDraftOrder((current) => ({ ...current, address: event.target.value }))
                      }
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>City</label>
                    <input
                      value={draftOrder.city}
                      onChange={(event) =>
                        setDraftOrder((current) => ({ ...current, city: event.target.value }))
                      }
                      style={styles.input}
                    />
                  </div>
                </div>

                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Material</label>
                    <input
                      value={draftOrder.material}
                      onChange={(event) =>
                        setDraftOrder((current) => ({ ...current, material: event.target.value }))
                      }
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Quantity</label>
                    <input
                      value={draftOrder.quantity}
                      onChange={(event) =>
                        setDraftOrder((current) => ({ ...current, quantity: event.target.value }))
                      }
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Unit</label>
                    <select
                      value={draftOrder.unit}
                      onChange={(event) =>
                        setDraftOrder((current) => ({ ...current, unit: event.target.value }))
                      }
                      style={styles.input}
                    >
                      <option>TonS</option>
                      <option>YardS</option>
                      <option>GallonS</option>
                    </select>
                  </div>
                </div>

                <div style={styles.formGridTwo}>
                  <div>
                    <label style={styles.label}>Requested Window</label>
                    <input
                      value={draftOrder.requestedWindow}
                      onChange={(event) =>
                        setDraftOrder((current) => ({
                          ...current,
                          requestedWindow: event.target.value,
                        }))
                      }
                      placeholder="Today 1:00p - 3:00p"
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Truck Preference</label>
                    <input
                      value={draftOrder.truckPreference}
                      onChange={(event) =>
                        setDraftOrder((current) => ({
                          ...current,
                          truckPreference: event.target.value,
                        }))
                      }
                      placeholder="Walking floor, tri-axle, etc."
                      style={styles.input}
                    />
                  </div>
                </div>

                <div>
                  <label style={styles.label}>Dispatch Notes</label>
                  <textarea
                    value={draftOrder.notes}
                    onChange={(event) =>
                      setDraftOrder((current) => ({ ...current, notes: event.target.value }))
                    }
                    rows={4}
                    style={{ ...styles.input, resize: "vertical" as const }}
                  />
                </div>

                <button type="submit" style={styles.primaryButton}>
                  Add To Dispatch Queue
                </button>
              </form>
            </div>
          </div>

          <div style={styles.centerColumn}>
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Routes & Fleet</h2>
                  <p style={styles.panelSub}>
                    Active trucks, crew assignments, and current stop counts.
                  </p>
                </div>
                <div style={styles.headerPill}>Live Board</div>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {routes.map((route) => (
                  <div key={route.id} style={styles.routeCard(route.color)}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={styles.routeColor(route.color)} />
                          <div style={styles.routeCode}>{route.code}</div>
                          <div style={styles.routeRegion}>{route.region}</div>
                        </div>
                        <div style={{ marginTop: 8, color: "#e2e8f0", fontWeight: 700 }}>
                          {route.truck} · {route.driver} / {route.helper}
                        </div>
                      </div>
                      <button type="button" onClick={() => assignOrder(route.id)} style={styles.assignButton}>
                        Assign Selected
                      </button>
                    </div>

                    <div style={styles.routeStats}>
                      <span>{route.shift}</span>
                      <span>{route.stops} stops</span>
                      <span>{route.loadSummary || "No assigned loads yet"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Route Map Preview</h2>
                  <p style={styles.panelSub}>
                    Visual route planning mockup for the first dispatch tab. We can wire live geocoding and stop sequencing next.
                  </p>
                </div>
              </div>

              <div style={styles.mapStage}>
                <div style={styles.mapGrid} />
                <div style={styles.mapWater} />
                {routes.map((route, index) => (
                  <div
                    key={route.id}
                    style={{
                      ...styles.mapRoute(route.color),
                      top: 70 + index * 80,
                      left: 40 + index * 90,
                      width: 180 + index * 15,
                    }}
                  />
                ))}
                {routes.flatMap((route, routeIndex) =>
                  route.orders.map((order, orderIndex) => (
                    <div
                      key={`${route.id}-${order.id}`}
                      title={`${order.customer} · ${route.truck}`}
                      style={{
                        ...styles.mapStop(route.color),
                        top: 82 + routeIndex * 80 + orderIndex * 24,
                        left: 90 + routeIndex * 92 + orderIndex * 34,
                      }}
                    >
                      {orderIndex + 1}
                    </div>
                  )),
                )}
                <div style={styles.mapLegend}>
                  {routes.map((route) => (
                    <div key={route.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={styles.routeColor(route.color)} />
                      <span>{route.truck}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={styles.rightColumn}>
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Dispatch Detail</h2>
                  <p style={styles.panelSub}>
                    Review the selected order, then assign it to a truck and crew or place it on hold.
                  </p>
                </div>
              </div>

              {selectedOrder ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <div style={styles.detailId}>{selectedOrder.id}</div>
                    <div style={styles.detailTitle}>{selectedOrder.customer}</div>
                    <div style={styles.detailMeta}>{selectedOrder.contact}</div>
                  </div>

                  <div style={styles.detailGrid}>
                    <div>
                      <div style={styles.detailLabel}>Address</div>
                      <div style={styles.detailValue}>
                        {selectedOrder.address}, {selectedOrder.city}
                      </div>
                    </div>
                    <div>
                      <div style={styles.detailLabel}>Load</div>
                      <div style={styles.detailValue}>
                        {selectedOrder.quantity} {selectedOrder.unit} {selectedOrder.material}
                      </div>
                    </div>
                    <div>
                      <div style={styles.detailLabel}>Requested</div>
                      <div style={styles.detailValue}>{selectedOrder.requestedWindow}</div>
                    </div>
                    <div>
                      <div style={styles.detailLabel}>Truck Preference</div>
                      <div style={styles.detailValue}>
                        {selectedOrder.truckPreference || "No preference"}
                      </div>
                    </div>
                  </div>

                  <div style={styles.notesBlock}>
                    <div style={styles.detailLabel}>Notes</div>
                    <div style={{ color: "#e2e8f0", lineHeight: 1.55 }}>
                      {selectedOrder.notes || "No dispatch notes yet."}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <button type="button" onClick={unassignOrder} style={styles.secondaryButton}>
                      Move Back To Inbox
                    </button>
                    <button type="button" onClick={moveToHold} style={styles.secondaryButton}>
                      Put On Hold
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ color: "#94a3b8" }}>Select an order to view dispatch detail.</div>
              )}
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Phase 2 Targets</h2>
                  <p style={styles.panelSub}>
                    Next steps to expand this into the full dispatch + field execution system.
                  </p>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {[
                  "Email parser to read order inbox and prefill dispatch cards",
                  "Persistent trucks, employees, routes, and assigned stops in Supabase",
                  "Driver mobile workflow: arrive, depart, signature, photos, tickets",
                  "GoCanvas-style field forms for inspection, proof, and custom checklists",
                  "Route optimization and live map sequencing",
                ].map((item) => (
                  <div key={item} style={styles.todoItem}>
                    <span style={styles.todoDot} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(14, 165, 233, 0.14), transparent 26%), radial-gradient(circle at top right, rgba(249, 115, 22, 0.1), transparent 24%), linear-gradient(180deg, #09101d 0%, #0f172a 42%, #020617 100%)",
    color: "#f8fafc",
    padding: "24px 18px 42px",
    fontFamily:
      '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } as const,
  shell: {
    maxWidth: 1540,
    margin: "0 auto",
    display: "grid",
    gap: 20,
  } as const,
  loginCard: {
    background: "rgba(15, 23, 42, 0.92)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    borderRadius: 28,
    padding: 28,
    boxShadow: "0 30px 60px rgba(2, 6, 23, 0.46)",
  } as const,
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.8fr)",
    gap: 18,
    padding: 24,
    borderRadius: 30,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.92))",
    boxShadow: "0 30px 60px rgba(2, 6, 23, 0.45)",
  } as const,
  kicker: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.18em",
  },
  title: {
    margin: "10px 0 0",
    fontSize: "2.8rem",
    lineHeight: 1.04,
    letterSpacing: "-0.04em",
    fontWeight: 900,
  },
  subtitle: {
    margin: "12px 0 0",
    color: "#94a3b8",
    fontSize: 16,
    lineHeight: 1.65,
    maxWidth: 780,
  },
  heroActions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap" as const,
    alignContent: "flex-start",
    justifyContent: "flex-end",
  },
  ghostButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    padding: "0 16px",
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.9)",
    color: "#e2e8f0",
    textDecoration: "none",
    fontWeight: 700,
  } as const,
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 14,
  } as const,
  workspaceGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 0.95fr) minmax(420px, 1.2fr) minmax(320px, 0.82fr)",
    gap: 18,
    alignItems: "start",
  } as const,
  leftColumn: {
    display: "grid",
    gap: 18,
  } as const,
  centerColumn: {
    display: "grid",
    gap: 18,
  } as const,
  rightColumn: {
    display: "grid",
    gap: 18,
  } as const,
  panel: {
    borderRadius: 28,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.92)",
    padding: 22,
    boxShadow: "0 24px 50px rgba(2, 6, 23, 0.38)",
  } as const,
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 16,
  } as const,
  panelTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  panelSub: {
    margin: "6px 0 0",
    color: "#94a3b8",
    lineHeight: 1.55,
    fontSize: 14,
  },
  headerPill: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(56, 189, 248, 0.35)",
    color: "#7dd3fc",
    background: "rgba(14, 165, 233, 0.12)",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  queueCard: {
    width: "100%",
    textAlign: "left" as const,
    borderRadius: 18,
    border: "1px solid rgba(51, 65, 85, 0.92)",
    background: "rgba(2, 6, 23, 0.72)",
    padding: 16,
    color: "#f8fafc",
    cursor: "pointer",
  } as const,
  queueTitle: {
    fontSize: 16,
    fontWeight: 800,
  },
  queueMeta: {
    marginTop: 6,
    color: "#94a3b8",
    fontSize: 13,
  },
  queueDetails: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    flexWrap: "wrap" as const,
    color: "#cbd5e1",
    fontSize: 13,
  } as const,
  queueFooter: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#64748b",
    fontSize: 12,
  } as const,
  formGridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  } as const,
  formGridThree: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) 120px 140px",
    gap: 12,
  } as const,
  label: {
    display: "block",
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    color: "#cbd5e1",
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    minHeight: 48,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.94)",
    color: "#f8fafc",
    fontSize: 14,
    outline: "none",
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 15,
    border: "none",
    background: "linear-gradient(135deg, #f97316, #fb7185)",
    color: "#fff7ed",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  } as const,
  secondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.72)",
    color: "#e2e8f0",
    fontWeight: 700,
    cursor: "pointer",
  } as const,
  routeCard: (color: string) =>
    ({
      borderRadius: 20,
      padding: 18,
      border: `1px solid ${color}44`,
      background: "linear-gradient(145deg, rgba(2, 6, 23, 0.86), rgba(15, 23, 42, 0.98))",
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 18px 28px ${color}12`,
    }) as const,
  routeColor: (color: string) =>
    ({
      width: 12,
      height: 12,
      borderRadius: 999,
      background: color,
      boxShadow: `0 0 0 5px ${color}22`,
    }) as const,
  routeCode: {
    fontSize: 13,
    fontWeight: 800,
    color: "#f8fafc",
  },
  routeRegion: {
    fontSize: 12,
    color: "#94a3b8",
  },
  routeStats: {
    marginTop: 14,
    display: "flex",
    gap: 10,
    flexWrap: "wrap" as const,
    color: "#cbd5e1",
    fontSize: 13,
  } as const,
  assignButton: {
    minHeight: 42,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(34, 197, 94, 0.4)",
    background: "rgba(34, 197, 94, 0.12)",
    color: "#bbf7d0",
    fontWeight: 800,
    cursor: "pointer",
  } as const,
  mapStage: {
    position: "relative" as const,
    minHeight: 380,
    borderRadius: 24,
    overflow: "hidden",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background:
      "radial-gradient(circle at 10% 10%, rgba(255,255,255,0.08), transparent 18%), linear-gradient(180deg, #d6e4f2 0%, #bdd6ea 36%, #bed5d5 100%)",
  },
  mapGrid: {
    position: "absolute" as const,
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(15,23,42,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.08) 1px, transparent 1px)",
    backgroundSize: "58px 58px",
  },
  mapWater: {
    position: "absolute" as const,
    right: -20,
    top: 40,
    width: 220,
    height: 260,
    borderRadius: "54% 46% 42% 58% / 48% 58% 42% 52%",
    background: "rgba(56, 189, 248, 0.22)",
    filter: "blur(1px)",
  },
  mapRoute: (color: string) =>
    ({
      position: "absolute" as const,
      height: 0,
      borderTop: `8px solid ${color}`,
      borderRadius: 999,
      transform: "rotate(-12deg)",
      opacity: 0.88,
    }) as const,
  mapStop: (color: string) =>
    ({
      position: "absolute" as const,
      width: 28,
      height: 28,
      borderRadius: 999,
      background: color,
      color: "#fff",
      fontSize: 12,
      fontWeight: 900,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 8px 18px ${color}55`,
    }) as const,
  mapLegend: {
    position: "absolute" as const,
    left: 16,
    bottom: 16,
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: 16,
    background: "rgba(15, 23, 42, 0.88)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    color: "#e2e8f0",
    fontSize: 12,
  } as const,
  detailId: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
  },
  detailTitle: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 1.12,
  },
  detailMeta: {
    marginTop: 6,
    color: "#94a3b8",
  },
  detailGrid: {
    display: "grid",
    gap: 12,
  } as const,
  detailLabel: {
    color: "#64748b",
    fontSize: 12,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    fontWeight: 800,
  },
  detailValue: {
    marginTop: 4,
    color: "#f8fafc",
    fontWeight: 700,
    lineHeight: 1.5,
  },
  notesBlock: {
    borderRadius: 18,
    padding: 16,
    background: "rgba(2, 6, 23, 0.72)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
  } as const,
  todoItem: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    color: "#e2e8f0",
    lineHeight: 1.55,
  } as const,
  todoDot: {
    width: 8,
    height: 8,
    marginTop: 7,
    borderRadius: 999,
    background: "#38bdf8",
    boxShadow: "0 0 0 5px rgba(56, 189, 248, 0.15)",
    flex: "0 0 auto",
  } as const,
  statusErr: {
    marginTop: 16,
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(220, 38, 38, 0.15)",
    border: "1px solid rgba(248, 113, 113, 0.5)",
    color: "#fee2e2",
    fontWeight: 700,
  } as const,
  badge: (status: DispatchOrder["status"]) => {
    const palette =
      status === "scheduled"
        ? { color: "#bbf7d0", border: "rgba(34, 197, 94, 0.35)", bg: "rgba(34, 197, 94, 0.12)" }
        : status === "hold"
        ? { color: "#fde68a", border: "rgba(234, 179, 8, 0.35)", bg: "rgba(234, 179, 8, 0.12)" }
        : { color: "#fed7aa", border: "rgba(249, 115, 22, 0.35)", bg: "rgba(249, 115, 22, 0.12)" };

    return {
      minHeight: 30,
      padding: "0 10px",
      borderRadius: 999,
      border: `1px solid ${palette.border}`,
      background: palette.bg,
      color: palette.color,
      fontSize: 11,
      fontWeight: 800,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
    } as const;
  },
};
