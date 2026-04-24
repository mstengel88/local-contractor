import { useMemo } from "react";
import { Form, useActionData, useLoaderData, useLocation } from "react-router";
import { data, redirect } from "react-router";
import {
  adminQuoteCookie,
  getAdminQuotePassword,
  hasAdminQuoteAccess,
} from "../lib/admin-quote-auth.server";
import {
  createDispatchRoute,
  createDispatchOrder,
  ensureSeedDispatchOrders,
  ensureSeedDispatchRoutes,
  getDispatchOrders,
  getDispatchRoutes,
  type DispatchOrder,
  type DispatchRoute,
  seedDispatchOrders,
  seedDispatchRoutes,
  updateDispatchOrder,
} from "../lib/dispatch.server";

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
      <div
        style={{
          color: "#94a3b8",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 28,
          fontWeight: 800,
          color: "#f8fafc",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function getDispatchPath(url: URL) {
  return url.pathname.startsWith("/app/") ? "/app/dispatch" : "/dispatch";
}

async function loadDispatchState() {
  try {
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
      error instanceof Error ? error.message : "Unable to load dispatch storage";
    console.error("[DISPATCH STORAGE ERROR]", message);
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
  const dispatchPath = getDispatchPath(url);

  if (url.searchParams.get("logout") === "1") {
    return redirect(dispatchPath, {
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

  const dispatchState = await loadDispatchState();

  return data({
    allowed: true,
    ...dispatchState,
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

    const dispatchState = await loadDispatchState();

    return data(
      {
        allowed: true,
        loginError: null,
        ...dispatchState,
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

  try {
    if (intent === "create-order") {
      const customer = String(form.get("customer") || "").trim();
      const address = String(form.get("address") || "").trim();
      const material = String(form.get("material") || "").trim();

      if (!customer || !address || !material) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Customer, jobsite address, and material are required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const created = await createDispatchOrder({
        source: "manual",
        customer,
        contact: String(form.get("contact") || "").trim(),
        address,
        city: String(form.get("city") || "").trim(),
        material,
        quantity: String(form.get("quantity") || "").trim(),
        unit: String(form.get("unit") || "TonS").trim() || "TonS",
        requestedWindow: String(form.get("requestedWindow") || "").trim(),
        truckPreference: String(form.get("truckPreference") || "").trim(),
        notes: String(form.get("notes") || "").trim(),
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Added ${created.customer} to the dispatch queue.`,
        selectedOrderId: created.id,
        ...dispatchState,
      });
    }

    if (intent === "create-route") {
      const code = String(form.get("code") || "").trim();
      const truck = String(form.get("truck") || "").trim();
      const driver = String(form.get("driver") || "").trim();

      if (!code || !truck || !driver) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Route code, truck, and driver are required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const created = await createDispatchRoute({
        code,
        truck,
        driver,
        helper: String(form.get("helper") || "").trim(),
        color: String(form.get("color") || "#38bdf8").trim(),
        shift: String(form.get("shift") || "").trim(),
        region: String(form.get("region") || "").trim(),
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Added ${created.truck} to the route board.`,
        ...dispatchState,
      });
    }

    if (intent === "assign-order") {
      const orderId = String(form.get("orderId") || "").trim();
      const routeId = String(form.get("routeId") || "").trim();

      if (!orderId || !routeId) {
        throw new Error("Missing order or route assignment details");
      }

      await updateDispatchOrder(orderId, {
        status: "scheduled",
        assignedRouteId: routeId,
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Order assigned to route.",
        selectedOrderId: orderId,
        ...dispatchState,
      });
    }

    if (intent === "hold-order") {
      const orderId = String(form.get("orderId") || "").trim();
      if (!orderId) throw new Error("Missing order selection");

      await updateDispatchOrder(orderId, {
        status: "hold",
        assignedRouteId: null,
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Order moved to hold.",
        selectedOrderId: orderId,
        ...dispatchState,
      });
    }

    if (intent === "unassign-order") {
      const orderId = String(form.get("orderId") || "").trim();
      if (!orderId) throw new Error("Missing order selection");

      await updateDispatchOrder(orderId, {
        status: "new",
        assignedRouteId: null,
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Order moved back to inbox.",
        selectedOrderId: orderId,
        ...dispatchState,
      });
    }

    return data(
      { allowed: true, ok: false, message: "Unknown dispatch action." },
      { status: 400 },
    );
  } catch (error) {
    const dispatchState = await loadDispatchState();
    const message =
      error instanceof Error ? error.message : "Dispatch action failed";

    return data(
      {
        allowed: true,
        ok: false,
        message,
        ...dispatchState,
      },
      { status: 500 },
    );
  }
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
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const dispatchRoutes = (actionData?.routes ?? loaderData.routes ?? []) as DispatchRoute[];
  const storageReady = actionData?.storageReady ?? loaderData.storageReady ?? false;
  const storageError = actionData?.storageError ?? loaderData.storageError ?? null;

  const querySelectedOrderId = new URLSearchParams(location.search).get("order");
  const selectedOrderId = actionData?.selectedOrderId || querySelectedOrderId || orders[0]?.id;

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId],
  );

  const routes = useMemo(
    () =>
      dispatchRoutes.map((route) => {
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
    [dispatchRoutes, orders],
  );

  const inboxOrders = orders.filter((order) => !order.assignedRouteId && order.status === "new");
  const holdOrders = orders.filter((order) => order.status === "hold");
  const scheduledOrders = orders.filter((order) => order.assignedRouteId);

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

              <button
                type="submit"
                style={{ ...styles.primaryButton, width: "100%", marginTop: 16 }}
              >
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
              Contractor-only dispatch slice with persistent intake, truck assignment,
              route boards, and the first foundation for email-driven scheduling.
            </p>
          </div>

          <div style={styles.heroActions}>
            <a href={mobileHref} style={styles.ghostButton}>Dashboard</a>
            <a href={quoteHref} style={styles.ghostButton}>Quote Tool</a>
            <a href={reviewHref} style={styles.ghostButton}>Review Quotes</a>
            <a href={logoutHref} style={styles.ghostButton}>Log Out</a>
          </div>
        </div>

        {!storageReady ? (
          <div style={styles.statusWarn}>
            Dispatch storage is not ready yet. Run
            {" "}
            <strong>`dispatch_schema.sql`</strong>
            {" "}
            in Supabase SQL Editor, then refresh. Until then, you are seeing seed data.
            {storageError ? ` Storage error: ${storageError}` : ""}
          </div>
        ) : null}

        {actionData?.message ? (
          <div style={actionData.ok ? styles.statusOk : styles.statusErr}>
            {actionData.message}
          </div>
        ) : null}

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
                    <a
                      key={order.id}
                      href={`${dispatchHref}?order=${encodeURIComponent(order.id)}`}
                      style={{
                        ...styles.queueCard,
                        borderColor: active ? "#38bdf8" : "rgba(51, 65, 85, 0.92)",
                        boxShadow: active
                          ? "0 0 0 1px rgba(56, 189, 248, 0.45)"
                          : "none",
                        textDecoration: "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <div style={styles.queueTitle}>{order.customer}</div>
                          <div style={styles.queueMeta}>
                            {order.address}, {order.city}
                          </div>
                        </div>
                        <div style={styles.badge(order.status)}>{order.status}</div>
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
                    </a>
                  );
                })}
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Manual Intake</h2>
                  <p style={styles.panelSub}>
                    Start the GoCanvas-style capture flow by typing in the order details dispatch needs to track.
                  </p>
                </div>
              </div>

              <Form method="post" style={{ display: "grid", gap: 12 }}>
                <input type="hidden" name="intent" value="create-order" />

                <div style={styles.formGridTwo}>
                  <div>
                    <label style={styles.label}>Customer</label>
                    <input name="customer" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Contact / Email</label>
                    <input name="contact" style={styles.input} />
                  </div>
                </div>

                <div style={styles.formGridTwo}>
                  <div>
                    <label style={styles.label}>Jobsite Address</label>
                    <input name="address" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>City</label>
                    <input name="city" style={styles.input} />
                  </div>
                </div>

                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Material</label>
                    <input name="material" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Quantity</label>
                    <input name="quantity" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Unit</label>
                    <select name="unit" style={styles.input}>
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
                      name="requestedWindow"
                      placeholder="Today 1:00p - 3:00p"
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Truck Preference</label>
                    <input
                      name="truckPreference"
                      placeholder="Walking floor, tri-axle, etc."
                      style={styles.input}
                    />
                  </div>
                </div>

                <div>
                  <label style={styles.label}>Dispatch Notes</label>
                  <textarea
                    name="notes"
                    rows={4}
                    style={{ ...styles.input, resize: "vertical" }}
                  />
                </div>

                <button type="submit" style={styles.primaryButton}>
                  Add To Dispatch Queue
                </button>
              </Form>
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
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={styles.routeColor(route.color)} />
                          <div style={styles.routeCode}>{route.code}</div>
                          <div style={styles.routeRegion}>{route.region}</div>
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            color: "#e2e8f0",
                            fontWeight: 700,
                          }}
                        >
                          {route.truck} · {route.driver} / {route.helper}
                        </div>
                      </div>
                      {selectedOrder ? (
                        <Form method="post">
                          <input type="hidden" name="intent" value="assign-order" />
                          <input type="hidden" name="orderId" value={selectedOrder.id} />
                          <input type="hidden" name="routeId" value={route.id} />
                          <button type="submit" style={styles.assignButton}>
                            Assign Selected
                          </button>
                        </Form>
                      ) : null}
                    </div>

                    <div style={styles.routeStats}>
                      <span>{route.shift}</span>
                      <span>{route.stops} stops</span>
                      <span>{route.loadSummary || "No assigned loads yet"}</span>
                    </div>
                  </div>
                ))}
              </div>

              <Form method="post" style={styles.routeCreateForm}>
                <input type="hidden" name="intent" value="create-route" />

                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Route Code</label>
                    <input name="code" placeholder="R-22" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Truck</label>
                    <input name="truck" placeholder="Truck 22" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Color</label>
                    <input
                      type="color"
                      name="color"
                      defaultValue="#38bdf8"
                      style={styles.colorInput}
                    />
                  </div>
                </div>

                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Driver</label>
                    <input name="driver" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Helper</label>
                    <input name="helper" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Shift</label>
                    <input name="shift" placeholder="7:00a - 4:00p" style={styles.input} />
                  </div>
                </div>

                <div style={styles.formGridTwo}>
                  <div>
                    <label style={styles.label}>Region</label>
                    <input name="region" placeholder="North / Menomonee Falls" style={styles.input} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button type="submit" style={{ ...styles.primaryButton, width: "100%" }}>
                      Add Route
                    </button>
                  </div>
                </div>
              </Form>
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
                    <div
                      key={route.id}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
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
                    <Form method="post">
                      <input type="hidden" name="intent" value="unassign-order" />
                      <input type="hidden" name="orderId" value={selectedOrder.id} />
                      <button type="submit" style={styles.secondaryButton}>
                        Move Back To Inbox
                      </button>
                    </Form>

                    <Form method="post">
                      <input type="hidden" name="intent" value="hold-order" />
                      <input type="hidden" name="orderId" value={selectedOrder.id} />
                      <button type="submit" style={styles.secondaryButton}>
                        Put On Hold
                      </button>
                    </Form>
                  </div>
                </div>
              ) : (
                <div style={{ color: "#94a3b8" }}>
                  Select an order to view dispatch detail.
                </div>
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
                  "Email parser to read the order inbox and prefill dispatch cards",
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
    gridTemplateColumns:
      "minmax(320px, 0.95fr) minmax(420px, 1.2fr) minmax(320px, 0.82fr)",
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
  colorInput: {
    width: "100%",
    boxSizing: "border-box" as const,
    minHeight: 48,
    padding: 6,
    borderRadius: 14,
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.94)",
    cursor: "pointer",
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
    width: "100%",
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
      background:
        "linear-gradient(145deg, rgba(2, 6, 23, 0.86), rgba(15, 23, 42, 0.98))",
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
  routeCreateForm: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid rgba(51, 65, 85, 0.82)",
    display: "grid",
    gap: 12,
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
  statusOk: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(22, 163, 74, 0.15)",
    border: "1px solid rgba(34, 197, 94, 0.5)",
    color: "#dcfce7",
    fontWeight: 700,
  } as const,
  statusWarn: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(234, 179, 8, 0.14)",
    border: "1px solid rgba(250, 204, 21, 0.35)",
    color: "#fef3c7",
    fontWeight: 600,
    lineHeight: 1.6,
  } as const,
  statusErr: {
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
        ? {
            color: "#bbf7d0",
            border: "rgba(34, 197, 94, 0.35)",
            bg: "rgba(34, 197, 94, 0.12)",
          }
        : status === "hold"
        ? {
            color: "#fde68a",
            border: "rgba(234, 179, 8, 0.35)",
            bg: "rgba(234, 179, 8, 0.12)",
          }
        : {
            color: "#fed7aa",
            border: "rgba(249, 115, 22, 0.35)",
            bg: "rgba(249, 115, 22, 0.12)",
          };

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
