import { useEffect, useMemo, useRef, useState } from "react";
import { Form, useActionData, useLoaderData, useLocation } from "react-router";
import { data, redirect } from "react-router";
import {
  adminQuoteCookie,
  hasAdminQuotePermissionAccess,
} from "../lib/admin-quote-auth.server";
import {
  getCurrentUser,
  userAuthCookie,
  type AppUserProfile,
} from "../lib/user-auth.server";
import { sendDeliveryConfirmationEmail } from "../lib/delivery-confirmation-email.server";
import {
  buildEnrouteTextMessage,
  sendCustomerEnrouteText,
} from "../lib/customer-text.server";
import {
  ensureSeedDispatchEmployees,
  ensureSeedDispatchOrders,
  ensureSeedDispatchRoutes,
  ensureSeedDispatchTrucks,
  getDispatchOrders,
  getDispatchRoutes,
  resetDispatchRoutesForNewDay,
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
  return pathname.startsWith("/app/") ? "/app/classic" : "/classic";
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

type NativeDispatchLocationPlugin = {
  startTracking: (options: {
    endpoint: string;
    routeId: string;
    orderId?: string | null;
    driverId?: string | null;
    driverName?: string;
    truck?: string;
  }) => Promise<{ ok?: boolean; message?: string }>;
  stopTracking?: () => Promise<{ ok?: boolean; message?: string }>;
  status?: () => Promise<Record<string, unknown>>;
};

function getNativeDispatchLocationPlugin() {
  if (typeof window === "undefined") return null;
  const nativeWindow = window as typeof window & {
    Capacitor?: {
      Plugins?: {
        DispatchLocation?: NativeDispatchLocationPlugin;
      };
    };
  };

  return nativeWindow.Capacitor?.Plugins?.DispatchLocation || null;
}

function getOrderDisplayNumber(order: DispatchOrder) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}

function extractPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

function formatPhone(value?: string | null) {
  const phone = extractPhone(value);
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone || "Not captured";
}

function getOneWayTravelMinutes(order: DispatchOrder) {
  const roundTripMinutes = Number(order.travelMinutes || 0);
  if (!Number.isFinite(roundTripMinutes) || roundTripMinutes <= 0) return 0;
  return Math.max(1, Math.round(roundTripMinutes / 2));
}

function getCustomerEtaText(order: DispatchOrder) {
  const oneWayMinutes = getOneWayTravelMinutes(order);
  return oneWayMinutes ? `${oneWayMinutes} minute${oneWayMinutes === 1 ? "" : "s"}` : "soon";
}

function getReleaseDelayMs(order: DispatchOrder) {
  const oneWayMinutes = getOneWayTravelMinutes(order);
  return Math.max(0, oneWayMinutes - 5) * 60 * 1000;
}

function getReleaseRemainingMs(order: DispatchOrder, nowMs: number) {
  if (order.status === "delivered" || order.deliveryStatus === "delivered") return 0;
  if (order.deliveryStatus !== "en_route" || !order.departedAt) return null;

  const departedMs = new Date(order.departedAt).getTime();
  if (Number.isNaN(departedMs)) return null;
  return Math.max(0, getReleaseDelayMs(order) - (nowMs - departedMs));
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildChecklistJson(form: FormData) {
  const existing = parseChecklistJson(String(form.get("customChecklist") || ""));
  return JSON.stringify({
    ...existing,
    loadedQuantity: String(form.get("loadedQuantity") || "").trim(),
    siteSafe: form.get("siteSafe") === "on",
    loadMatchesTicket: form.get("loadMatchesTicket") === "on",
    customerConfirmedPlacement: form.get("customerConfirmedPlacement") === "on",
    photosTaken: form.get("photosTaken") === "on",
    customChecklist: String(form.get("customChecklist") || "").trim(),
  });
}

function parseChecklistJson(value?: string | null) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getLoadedQuantity(order: DispatchOrder) {
  const checklist = parseChecklistJson(order.checklistJson);
  return String(checklist.loadedQuantity || "").trim();
}

function canViewAllDriverRoutes(user: AppUserProfile | null) {
  if (!user) return true;
  return user.role === "admin" || user.permissions.includes("manageDispatch");
}

function filterDriverStateForUser(
  state: Awaited<ReturnType<typeof loadDriverState>>,
  user: AppUserProfile | null,
) {
  if (canViewAllDriverRoutes(user)) return state;

  const employeeId = user?.driverEmployeeId || "";
  if (!employeeId) {
    return {
      ...state,
      routes: [],
      orders: [],
      driverScopeMessage: "No driver employee is assigned to this login yet. Ask an admin to match this user to an employee in Settings.",
    };
  }

  const routes = state.routes.filter((route) => route.driverId === employeeId);
  const routeIds = new Set(routes.map((route) => route.id));
  return {
    ...state,
    routes,
    orders: state.orders.filter((order) => order.assignedRouteId && routeIds.has(order.assignedRouteId)),
    driverScopeMessage: routes.length
      ? null
      : "No active routes are assigned to your driver employee yet.",
  };
}

async function loadDriverStateForRequest(request: Request) {
  const currentUser = await getCurrentUser(request);
  const state = await loadDriverState();
  return {
    currentUser,
    ...filterDriverStateForUser(state, currentUser),
  };
}

async function loadDriverState() {
  try {
    await ensureSeedDispatchTrucks();
    await ensureSeedDispatchEmployees();
    await ensureSeedDispatchOrders();
    await ensureSeedDispatchRoutes();
    if (process.env.DISPATCH_AUTO_DAILY_RESET === "true") {
      await resetDispatchRoutesForNewDay();
    }

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
      headers: [
        ["Set-Cookie", await userAuthCookie.serialize("", { maxAge: 0 })],
        ["Set-Cookie", await adminQuoteCookie.serialize("", { maxAge: 0 })],
      ],
    });
  }

  const allowed = await hasAdminQuotePermissionAccess(request, "driver");
  if (!allowed) {
    return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }

  return data({
    allowed: true,
    ...(await loadDriverStateForRequest(request)),
  });
}

export async function action({ request }: any) {
  const url = new URL(request.url);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  const allowed = await hasAdminQuotePermissionAccess(request, "driver");
  if (!allowed) {
    return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }

  if (intent !== "update-stop-status") {
    return data(
      {
        allowed: true,
        ok: false,
        message: "Unknown driver action.",
        ...(await loadDriverStateForRequest(request)),
      },
      { status: 400 },
    );
  }

  const orderId = String(form.get("orderId") || "").trim();
  const routeId = String(form.get("routeId") || "").trim();
  const loadedQuantity = String(form.get("loadedQuantity") || "").trim();
  const rawStatus = String(form.get("deliveryStatus") || "").trim();
  const deliveryStatus: DispatchDeliveryStatus =
    rawStatus === "en_route" ||
    rawStatus === "delivered" ||
    rawStatus === "not_started"
      ? rawStatus
      : "not_started";

  if (!orderId) {
    return data(
      {
        allowed: true,
        ok: false,
        message: "Missing stop selection.",
        selectedRouteId: routeId || null,
        ...(await loadDriverStateForRequest(request)),
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const currentState = await loadDriverState();
  const currentUser = await getCurrentUser(request);
  const scopedState = filterDriverStateForUser(currentState, currentUser);
  const currentOrder =
    scopedState.orders.find((order: DispatchOrder) => order.id === orderId) || null;
  const currentRoute =
    scopedState.routes.find((route: DispatchRoute) => route.id === (routeId || currentOrder?.assignedRouteId)) ||
    null;

  if (!currentOrder || !currentRoute) {
    return data(
      {
        allowed: true,
        ok: false,
        message: "That stop is not assigned to your driver route.",
        selectedRouteId: routeId || null,
        ...(await loadDriverStateForRequest(request)),
      },
      { status: 403 },
    );
  }

  if (deliveryStatus === "en_route" && !loadedQuantity) {
    return data(
      {
        allowed: true,
        ok: false,
        message: "Enter the quantity loaded before marking the stop enroute.",
        selectedRouteId: routeId || currentRoute.id || null,
        selectedOrderId: orderId,
        ...(await loadDriverStateForRequest(request)),
      },
      { status: 400 },
    );
  }

  const patch: Parameters<typeof updateDispatchOrder>[1] = {
    deliveryStatus,
    proofName: String(form.get("proofName") || "").trim() || null,
    proofNotes: String(form.get("proofNotes") || "").trim() || null,
    signatureName: String(form.get("signatureName") || "").trim() || null,
    signatureData: String(form.get("signatureData") || "").trim() || null,
    photoUrls: String(form.get("photoUrls") || "").trim() || null,
    inspectionStatus: String(form.get("inspectionStatus") || "").trim() || null,
    checklistJson: buildChecklistJson(form),
  };

  if (deliveryStatus === "en_route") patch.departedAt = now;
  if (deliveryStatus === "delivered") {
    patch.status = "delivered";
    patch.departedAt = patch.departedAt || now;
    patch.deliveredAt = now;
  }

  const updatedOrder = await updateDispatchOrder(orderId, patch);

  let smsNote = "";
  if (deliveryStatus === "en_route") {
    try {
      const smsResult = await sendCustomerEnrouteText({
        order: updatedOrder,
        route: currentRoute,
      });
      if (smsResult.sent) {
        const textMessage = buildEnrouteTextMessage({ order: updatedOrder, route: currentRoute });
        smsNote = ` Customer enroute text sent with Kenect to ${textMessage.to}.`;
      } else {
        smsNote = ` Customer enroute text skipped: ${smsResult.reason}`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown text message error.";
      smsNote = ` Customer enroute text failed: ${message}`;
    }
  }

  let emailNote = "";
  if (deliveryStatus === "delivered") {
    try {
      const emailResult = await sendDeliveryConfirmationEmail({
        order: updatedOrder,
        route: currentRoute,
      });
      emailNote = emailResult.sent
        ? " Delivery confirmation email sent."
        : ` Delivery confirmation email skipped: ${emailResult.reason}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email error.";
      emailNote = ` Delivery confirmation email failed: ${message}`;
    }
  }

  return data({
    allowed: true,
    ok: true,
    message: `Stop marked ${getStatusLabel(deliveryStatus).toLowerCase()}.${smsNote}${emailNote}`,
    selectedRouteId: routeId || null,
    selectedOrderId: orderId,
    ...(await loadDriverStateForRequest(request)),
  });
}

export default function DispatchDriverPage() {
  const loaderData = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const location = useLocation();
  const allowed = actionData?.allowed ?? loaderData.allowed;
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const detailHref = isEmbeddedRoute
    ? "/app/dispatch/driver/detail"
    : "/dispatch/driver/detail";
  const dispatchHref = getDispatchPath(location.pathname);
  const logoutHref = `${driverHref}?logout=1`;
  const loginHref = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const routes = (actionData?.routes ?? loaderData.routes ?? []) as DispatchRoute[];
  const storageReady = actionData?.storageReady ?? loaderData.storageReady ?? false;
  const storageError = actionData?.storageError ?? loaderData.storageError ?? null;
  const driverScopeMessage = actionData?.driverScopeMessage ?? loaderData.driverScopeMessage ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const searchParams = new URLSearchParams(location.search);
  const selectedRouteId =
    actionData?.selectedRouteId || searchParams.get("route") || routes[0]?.id || "";

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || routes[0] || null;
  const routeStops = useMemo(
    () =>
      selectedRoute
        ? orders
            .filter(
              (order) =>
                order.assignedRouteId === selectedRoute.id &&
                order.status !== "delivered" &&
                order.deliveryStatus !== "delivered",
            )
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
  const visibleStopCount = routeStops.reduce((count, stop, index) => {
    if (index === 0) return Math.max(count, 1);
    const previousStop = routeStops[index - 1];
    const previousRemainingMs = getReleaseRemainingMs(previousStop, nowMs);
    const previousReleased =
      previousStop.status === "delivered" ||
      previousStop.deliveryStatus === "delivered" ||
      previousRemainingMs === 0;
    return previousReleased ? index + 1 : count;
  }, 0);
  const visibleStops = routeStops.slice(0, Math.max(visibleStopCount, routeStops.length ? 1 : 0));
  const nextLockedStopCount = Math.max(routeStops.length - visibleStops.length, 0);
  const activeCountdownStop = visibleStops.find((stop) => {
    const remainingMs = getReleaseRemainingMs(stop, nowMs);
    return remainingMs !== null && remainingMs > 0;
  });
  const activeCountdownMs = activeCountdownStop
    ? getReleaseRemainingMs(activeCountdownStop, nowMs) || 0
    : 0;
  const trackingStop =
    visibleStops.find((stop) => stop.deliveryStatus === "en_route") ||
    visibleStops[0] ||
    routeStops[0] ||
    null;

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!allowed) {
    return (
      <div style={styles.page}>
        <div style={styles.loginCard}>
          <h1 style={styles.title}>Driver Route</h1>
          <p style={styles.subtle}>Sign in with your contractor user account to open route stops.</p>
          <a
            href={loginHref}
            style={{
              ...styles.primaryButton,
              marginTop: 18,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
            }}
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>
        {`
          @media (max-width: 760px) {
            .driver-shell {
              max-width: none !important;
              width: 100% !important;
              gap: 12px !important;
            }

            .driver-header {
              display: grid !important;
              grid-template-columns: minmax(0, 1fr) !important;
              padding: 14px !important;
            }

            .driver-header-actions {
              justify-content: stretch !important;
            }

            .driver-header-actions > a {
              flex: 1 1 120px !important;
            }

            .driver-route-picker {
              display: flex !important;
              overflow-x: auto !important;
              padding-bottom: 4px !important;
              scroll-snap-type: x proximity;
            }

            .driver-route-picker > a {
              min-width: 175px !important;
              scroll-snap-align: start;
            }

            .driver-summary-grid {
              grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
              gap: 8px !important;
            }

            .driver-summary-grid > div {
              padding: 11px !important;
            }

            .driver-stop-card {
              padding: 14px !important;
              border-radius: 16px !important;
            }

            .driver-stop-top {
              grid-template-columns: 36px minmax(0, 1fr) !important;
              align-items: start !important;
            }

            .driver-status-pill {
              grid-column: 1 / -1 !important;
              justify-self: start !important;
              margin-left: 46px !important;
            }

            .driver-sheet-grid,
            .driver-loaded-panel,
            .driver-proof-grid {
              grid-template-columns: minmax(0, 1fr) !important;
            }

            .driver-utility-row {
              justify-content: stretch !important;
            }

            .driver-utility-row > a,
            .driver-utility-row > button {
              flex: 1 1 150px !important;
            }
          }
        `}
      </style>
      <div className="driver-shell" style={styles.shell}>
        <header className="driver-header" style={styles.header}>
          <div>
            <div style={styles.kicker}>Driver Mode</div>
            <h1 style={styles.title}>{selectedRoute?.truck || "Driver Route"}</h1>
            <p style={styles.subtle}>
              {selectedRoute
                ? `${selectedRoute.driver}${selectedRoute.helper ? ` / ${selectedRoute.helper}` : ""} · ${selectedRoute.shift || "Shift not set"}`
                : "No active route selected"}
            </p>
          </div>
          <div className="driver-header-actions" style={styles.headerActions}>
            <a href={dispatchHref} style={styles.ghostButton}>Dispatch</a>
            <a href={logoutHref} style={styles.ghostButton}>Log Out</a>
          </div>
        </header>

        {selectedRoute ? (
          <DriverLiveTracking
            route={selectedRoute}
            activeStop={trackingStop}
          />
        ) : null}

        {!storageReady ? (
          <div style={styles.warning}>
            Run `dispatch_schema.sql` in Supabase, then refresh.
            {storageError ? ` Storage error: ${storageError}` : ""}
          </div>
        ) : null}

        {driverScopeMessage ? (
          <div style={styles.warning}>{driverScopeMessage}</div>
        ) : null}

        {actionData?.message ? (
          <div style={actionData.ok ? styles.success : styles.error}>
            {actionData.message}
          </div>
        ) : null}

        <section className="driver-route-picker" style={styles.routePicker}>
          {routes.map((route) => (
            <a
              key={route.id}
              href={`${driverHref}?route=${encodeURIComponent(route.id)}`}
              style={{
                ...styles.routeChip,
                borderColor:
                  route.id === selectedRoute?.id ? route.color : "rgba(203, 213, 225, 0.28)",
                background:
                  route.id === selectedRoute?.id ? `${route.color}22` : "#0f172a",
              }}
            >
              <span style={{ ...styles.routeDot, background: route.color }} />
              <span>{route.code}</span>
              <small>{route.truck}</small>
            </a>
          ))}
        </section>

        <section className="driver-summary-grid" style={styles.summaryGrid}>
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
            <>
            {activeCountdownStop ? (
              <div style={styles.countdownPanel}>
                <span>Next stop releases in</span>
                <strong>{formatCountdown(activeCountdownMs)}</strong>
                <small>
                  Based on {getCustomerEtaText(activeCountdownStop)} travel time minus 5 minutes.
                </small>
              </div>
            ) : null}
            {nextLockedStopCount ? (
              <div style={styles.lockedNotice}>
                {nextLockedStopCount} later stop{nextLockedStopCount === 1 ? "" : "s"} hidden until the route timer releases them.
              </div>
            ) : null}
            {visibleStops.map((stop) => (
              <article key={stop.id} className="driver-stop-card" style={styles.stopCard}>
                <div className="driver-stop-top" style={styles.stopTop}>
                  <div style={styles.stopNumber}>{stop.stopSequence || "-"}</div>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={styles.stopTitle}>{stop.customer}</h2>
                    <p style={styles.stopAddress}>{stop.address}, {stop.city}</p>
                  </div>
                  <span
                    className="driver-status-pill"
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

                <div className="driver-sheet-grid" style={styles.sheetGrid}>
                  <section style={styles.sheetSection}>
                    <h3 style={styles.sheetTitle}>Driver & Truck</h3>
                    <SheetLine label="Truck" value={selectedRoute?.truck || "Not set"} />
                    <SheetLine label="Driver" value={selectedRoute?.driver || "Not set"} />
                    <SheetLine label="Order Number" value={getOrderDisplayNumber(stop)} />
                    <SheetLine label="Requested Date" value={stop.requestedWindow || "Not set"} />
                  </section>

                  <section style={styles.sheetSection}>
                    <h3 style={styles.sheetTitle}>Ordered Product</h3>
                    <SheetLine label="Product Ordered" value={stop.material || "Not set"} />
                    <SheetLine label="Product Type" value={stop.unit || "Not set"} />
                    <SheetLine label="Quantity Ordered" value={`${stop.quantity || "-"} ${stop.unit || ""}`.trim()} />
                    <SheetLine label="Truck Load" value={`${stop.quantity || "-"} ${stop.unit || ""}`.trim()} />
                  </section>

                  <section style={styles.sheetSection}>
                    <h3 style={styles.sheetTitle}>Customer Information</h3>
                    <SheetLine label="Customer Name" value={stop.customer || "Not set"} />
                    <SheetLine label="Phone" value={formatPhone(stop.contact)} />
                    <SheetLine label="Contact" value={stop.contact || "Not captured"} />
                    <SheetLine label="Address" value={`${stop.address}, ${stop.city}`} />
                    <SheetLine label="ETA" value={stop.eta || "Not set"} />
                  </section>
                </div>

                {stop.notes ? <p style={styles.notes}>{stop.notes}</p> : null}

                <StopDeliveryForm
                  stop={stop}
                  routeId={selectedRoute?.id || ""}
                  driverName={selectedRoute?.driver || ""}
                  detailHref={detailHref}
                />
              </article>
            ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function DriverLiveTracking({
  route,
  activeStop,
}: {
  route: DispatchRoute;
  activeStop: DispatchOrder | null;
}) {
  const [trackingEnabled, setTrackingEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("dispatchDriverGpsEnabled") === "true";
  });
  const [trackingStatus, setTrackingStatus] = useState(
    trackingEnabled ? "Starting GPS tracking..." : "Live GPS is off on this device.",
  );
  const [lastPing, setLastPing] = useState("");
  const routeRef = useRef(route);
  const activeStopRef = useRef(activeStop);
  const latestPositionRef = useRef<GeolocationPosition | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    routeRef.current = route;
    activeStopRef.current = activeStop;
  }, [activeStop, route]);

  useEffect(() => {
    if (!trackingEnabled) return;

    const nativeLocation = getNativeDispatchLocationPlugin();
    if (!nativeLocation) return;

    nativeLocation
      .startTracking({
        endpoint: `${window.location.origin}/api/dispatch-driver-location`,
        routeId: route.id,
        orderId: activeStop?.id || null,
        driverId: route.driverId || null,
        driverName: route.driver || "",
        truck: route.truck || route.code,
      })
      .then((result) => {
        if (result?.ok !== false) {
          setTrackingStatus("Native background GPS tracking active.");
        }
      })
      .catch((error) => {
        setTrackingStatus(
          error instanceof Error
            ? error.message
            : "Native GPS could not start; using browser GPS while the page is open.",
        );
      });
  }, [activeStop?.id, route.code, route.driver, route.driverId, route.id, route.truck, trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled) return;

    if (!navigator.geolocation) {
      setTrackingStatus("Live GPS is not available on this device.");
      return;
    }

    let cancelled = false;
    let lastSentAt = 0;
    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    };

    async function requestWakeLock() {
      const wakeLock = (navigator as Navigator & {
        wakeLock?: {
          request: (type: "screen") => Promise<{ release: () => Promise<void> }>;
        };
      }).wakeLock;

      if (!wakeLock || wakeLockRef.current) return;

      try {
        wakeLockRef.current = await wakeLock.request("screen");
      } catch {
        // Some browsers do not support wake lock. GPS still runs while the page is active.
      }
    }

    async function sendLocation(position: GeolocationPosition, force = false) {
      const now = Date.now();
      if (!force && now - lastSentAt < 10000) return;
      lastSentAt = now;
      latestPositionRef.current = position;

      const { latitude, longitude, accuracy, heading, speed } = position.coords;
      const currentRoute = routeRef.current;
      const currentStop = activeStopRef.current;
      setTrackingStatus("GPS tracking active for this route.");

      try {
        const response = await fetch("/api/dispatch-driver-location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: currentRoute.id,
            orderId: currentStop?.id || null,
            driverId: currentRoute.driverId || null,
            driverName: currentRoute.driver || "",
            truck: currentRoute.truck || currentRoute.code,
            latitude,
            longitude,
            accuracy,
            heading,
            speed,
            capturedAt: new Date().toISOString(),
          }),
        });

        const result = await response.json().catch(() => null);
        if (!response.ok || result?.ok === false) {
          throw new Error(result?.message || "Unable to save GPS location.");
        }

        if (!cancelled) {
          setLastPing(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
        }
      } catch (error) {
        if (!cancelled) {
          setTrackingStatus(error instanceof Error ? error.message : "Unable to save GPS location.");
        }
      }
    }

    function requestFreshPosition(force = false) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void sendLocation(position, force);
        },
        (error) => {
          if (!cancelled) {
            setTrackingStatus(error.message || "Unable to refresh GPS location.");
          }
        },
        geoOptions,
      );
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        void sendLocation(position);
      },
      (error) => {
        setTrackingStatus(error.message || "Unable to start GPS tracking.");
      },
      geoOptions,
    );

    const heartbeatId = window.setInterval(() => {
      if (latestPositionRef.current) {
        void sendLocation(latestPositionRef.current, true);
      } else {
        requestFreshPosition(true);
      }
    }, 30000);

    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
        requestFreshPosition(true);
      }
    };

    document.addEventListener("visibilitychange", visibilityHandler);
    void requestWakeLock();
    requestFreshPosition(true);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", visibilityHandler);
      navigator.geolocation.clearWatch(watchId);
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => undefined);
        wakeLockRef.current = null;
      }
    };
  }, [trackingEnabled]);

  function enableTracking() {
    if (!navigator.geolocation) {
      setTrackingStatus("Live GPS is not available on this device.");
      return;
    }

    setTrackingStatus("Requesting location access...");
    navigator.geolocation.getCurrentPosition(
      () => {
        window.localStorage.setItem("dispatchDriverGpsEnabled", "true");
        setTrackingEnabled(true);
        setTrackingStatus("GPS tracking active.");
      },
      (error) => {
        window.localStorage.removeItem("dispatchDriverGpsEnabled");
        setTrackingEnabled(false);
        setTrackingStatus(error.message || "Location access was not allowed.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  return (
    <section style={styles.trackingPanel}>
      <div>
        <span style={styles.trackingLabel}>Live GPS</span>
        <strong>{trackingStatus}</strong>
      </div>
      {trackingEnabled ? (
        <small>{lastPing ? `Last map update ${lastPing}` : "Waiting for the first GPS update."}</small>
      ) : (
        <button type="button" style={styles.trackingButton} onClick={enableTracking}>
          Enable Live GPS
        </button>
      )}
    </section>
  );
}

function SheetLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.sheetLine}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function isImageProof(value: string) {
  return /^data:image\//i.test(value) || /^https?:\/\/.+\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i.test(value);
}

function readCompressedImageDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read selected photo."));
    reader.onload = () => {
      const originalDataUrl = String(reader.result || "");
      const image = new Image();
      image.onerror = () => resolve(originalDataUrl);
      image.onload = () => {
        const maxDimension = 1280;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function StopDeliveryForm({
  stop,
  routeId,
  driverName,
  detailHref,
}: {
  stop: DispatchOrder;
  routeId: string;
  driverName: string;
  detailHref: string;
}) {
  const [photoProof, setPhotoProof] = useState(stop.photoUrls || "");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(
    stop.photoUrls && isImageProof(stop.photoUrls) ? stop.photoUrls : "",
  );
  const [gpsProof, setGpsProof] = useState(stop.signatureData || "");
  const [gpsStatus, setGpsStatus] = useState("");
  const [loadedQuantity, setLoadedQuantity] = useState(getLoadedQuantity(stop));

  useEffect(() => {
    return () => {
      if (photoPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  function captureGps() {
    if (!navigator.geolocation) {
      setGpsStatus("GPS is not available on this device.");
      return;
    }

    setGpsStatus("Getting GPS location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const capturedAt = new Date().toLocaleString();
        setGpsProof(
          `GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} accuracy ${Math.round(
            accuracy,
          )}m captured ${capturedAt}`,
        );
        setGpsStatus("GPS location captured.");
      },
      (error) => {
        setGpsStatus(error.message || "Unable to capture GPS location.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  return (
    <Form method="post" style={styles.stopForm}>
      <input type="hidden" name="intent" value="update-stop-status" />
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="orderId" value={stop.id} />

      <section className="driver-loaded-panel" style={styles.loadedQuantityPanel}>
        <div>
          <label style={styles.label}>Qty Loaded On Truck</label>
          <input
            name="loadedQuantity"
            value={loadedQuantity}
            onChange={(event) => setLoadedQuantity(event.currentTarget.value)}
            placeholder={`Example: ${stop.quantity || "10"} ${stop.unit || ""}`.trim()}
            style={styles.input}
            inputMode="decimal"
          />
        </div>
        <button
          type="submit"
          name="deliveryStatus"
          value="en_route"
          style={{
            ...styles.enrouteButton,
            ...(!loadedQuantity.trim() ? styles.disabledButton : null),
          }}
          disabled={!loadedQuantity.trim()}
          title={!loadedQuantity.trim() ? "Enter qty loaded before going enroute." : "Mark this stop enroute"}
        >
          Enroute
        </button>
      </section>

      <section style={styles.capturePanel}>
        <div>
          <div style={styles.captureTitle}>Delivery Proof</div>
          <p style={styles.captureHelp}>
            Capture the delivery photo and GPS before submitting the stop as delivered.
          </p>
        </div>

        <div style={styles.captureGrid}>
          <label style={styles.cameraButton}>
            Take Picture
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  readCompressedImageDataUrl(file)
                    .then((dataUrl) => {
                      setPhotoPreviewUrl((currentPreviewUrl) => {
                        if (currentPreviewUrl.startsWith("blob:")) {
                          URL.revokeObjectURL(currentPreviewUrl);
                        }
                        return dataUrl;
                      });
                      setPhotoProof(dataUrl);
                    })
                    .catch((error) => {
                      setPhotoProof(error instanceof Error ? error.message : "Unable to load photo.");
                    });
                }
              }}
            />
          </label>

          <button type="button" style={styles.gpsButton} onClick={captureGps}>
            Capture GPS
          </button>
        </div>

        <div style={styles.proofStatusGrid}>
          <div style={styles.proofStatusBox}>
            <span>Photo</span>
            {photoPreviewUrl ? (
              <img
                src={photoPreviewUrl}
                alt="Delivery proof preview"
                style={styles.photoPreview}
              />
            ) : (
              <strong>Not captured</strong>
            )}
          </div>
          <div style={styles.proofStatusBox}>
            <span>GPS</span>
            <strong>{gpsProof || gpsStatus || "Not captured"}</strong>
          </div>
        </div>
      </section>

      <div className="driver-proof-grid" style={styles.proofGrid}>
        <div>
          <label style={styles.label}>Driver Signature / Name</label>
          <input
            name="signatureName"
            defaultValue={stop.signatureName || driverName}
            placeholder="Driver name"
            style={styles.input}
          />
        </div>
      </div>

      <div>
        <label style={styles.label}>Driver Notes Upon Delivery</label>
        <textarea
          name="proofNotes"
          defaultValue={stop.proofNotes || ""}
          rows={3}
          placeholder="Gate code, placement note, blocked access, customer request..."
          style={styles.textarea}
        />
      </div>

      <input type="hidden" name="proofName" value={driverName || stop.proofName || ""} />
      <input type="hidden" name="signatureData" value={gpsProof} />
      <input type="hidden" name="photoUrls" value={photoProof} />
      <input type="hidden" name="inspectionStatus" value={stop.inspectionStatus || ""} />
      <input type="hidden" name="customChecklist" value={stop.checklistJson || ""} />

      <div className="driver-utility-row" style={styles.utilityRow}>
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(`${stop.address}, ${stop.city}`)}`}
          target="_blank"
          rel="noreferrer"
          style={styles.mapButton}
        >
          Open Map
        </a>
        <button
          type="button"
          style={styles.detailButton}
          onClick={() => {
            const url = `${detailHref}?order=${encodeURIComponent(stop.id)}`;
            window.open(
              url,
              `dispatch-stop-${stop.id}`,
              "width=720,height=860,menubar=no,toolbar=no,location=no,status=no",
            );
          }}
        >
          Full Detail
        </button>
      </div>

      <button
        type="submit"
        name="deliveryStatus"
        value="delivered"
        style={styles.deliveredButton}
      >
        Submit Delivery
      </button>
    </Form>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#020617",
    color: "#f8fafc",
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
    background: "#0f172a",
    border: "1px solid #334155",
    boxShadow: "0 18px 45px rgba(0, 0, 0, 0.28)",
  } as const,
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 10,
    background: "#0f172a",
    border: "1px solid #334155",
  } as const,
  headerActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  },
  kicker: {
    color: "#38bdf8",
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
    color: "#94a3b8",
    lineHeight: 1.45,
  },
  ghostButton: {
    minHeight: 40,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#111827",
    color: "#f8fafc",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 13,
  } as const,
  routePicker: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  } as const,
  trackingPanel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(34, 197, 94, 0.34)",
    background: "linear-gradient(135deg, rgba(20, 83, 45, 0.5), rgba(15, 23, 42, 0.96))",
    color: "#dcfce7",
    flexWrap: "wrap" as const,
  } as const,
  trackingLabel: {
    display: "block",
    marginBottom: 4,
    color: "#86efac",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
  },
  trackingButton: {
    minHeight: 38,
    borderRadius: 999,
    border: "1px solid rgba(34, 197, 94, 0.55)",
    background: "#22c55e",
    color: "#052e16",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  } as const,
  routeChip: {
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr) auto",
    gap: 8,
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #334155",
    color: "#f8fafc",
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
    background: "#0f172a",
    border: "1px solid #334155",
  } as const,
  stopList: {
    display: "grid",
    gap: 12,
  } as const,
  countdownPanel: {
    display: "grid",
    gap: 4,
    padding: 16,
    borderRadius: 14,
    background: "rgba(249, 115, 22, 0.14)",
    border: "1px solid rgba(249, 115, 22, 0.38)",
    color: "#fed7aa",
  } as const,
  lockedNotice: {
    padding: 14,
    borderRadius: 12,
    background: "rgba(56, 189, 248, 0.12)",
    border: "1px solid rgba(56, 189, 248, 0.34)",
    color: "#7dd3fc",
    fontWeight: 900,
  } as const,
  stopCard: {
    padding: 16,
    borderRadius: 14,
    background: "#0f172a",
    border: "1px solid #334155",
    boxShadow: "0 14px 28px rgba(0, 0, 0, 0.24)",
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
    color: "#94a3b8",
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
  detailButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(56, 189, 248, 0.45)",
    background: "rgba(56, 189, 248, 0.16)",
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    padding: "0 12px",
    whiteSpace: "nowrap" as const,
  } as const,
  mapButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(34, 197, 94, 0.45)",
    background: "rgba(34, 197, 94, 0.16)",
    color: "#86efac",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    padding: "0 14px",
    whiteSpace: "nowrap" as const,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
  } as const,
  sheetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 14,
  } as const,
  sheetSection: {
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#0b1220",
    padding: 12,
  } as const,
  sheetTitle: {
    margin: "0 0 10px",
    paddingBottom: 8,
    borderBottom: "2px solid #334155",
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
  },
  sheetLine: {
    display: "grid",
    gridTemplateColumns: "minmax(100px, 0.8fr) minmax(0, 1.2fr)",
    gap: 10,
    alignItems: "baseline",
    padding: "7px 0",
    borderBottom: "1px solid #334155",
    color: "#94a3b8",
    fontSize: 12,
  } as const,
  stopMeta: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginTop: 10,
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 700,
  } as const,
  notes: {
    margin: "12px 0 0",
    padding: 12,
    borderRadius: 8,
    background: "rgba(249, 115, 22, 0.14)",
    border: "1px solid rgba(249, 115, 22, 0.38)",
    color: "#fed7aa",
    lineHeight: 1.45,
  },
  stopForm: {
    display: "grid",
    gap: 12,
    marginTop: 12,
  } as const,
  loadedQuantityPanel: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(150px, 220px)",
    gap: 10,
    alignItems: "end",
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(249, 115, 22, 0.38)",
    background: "rgba(249, 115, 22, 0.12)",
  } as const,
  statusButtons: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
    gap: 8,
  } as const,
  statusButton: {
    minHeight: 52,
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#111827",
    color: "#f8fafc",
    fontWeight: 900,
    cursor: "pointer",
  } as const,
  enrouteButton: {
    minHeight: 52,
    borderRadius: 10,
    border: "1px solid #ea580c",
    background: "linear-gradient(135deg, #f97316, #fb923c)",
    color: "#431407",
    fontWeight: 950,
    cursor: "pointer",
  } as const,
  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed",
    filter: "grayscale(0.65)",
  } as const,
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  } as const,
  proofGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  } as const,
  capturePanel: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    border: "1px solid #334155",
    background: "linear-gradient(145deg, #0b1220, #111827)",
  } as const,
  captureTitle: {
    fontSize: 16,
    fontWeight: 950,
    color: "#f8fafc",
  },
  captureHelp: {
    margin: "4px 0 0",
    color: "#94a3b8",
    lineHeight: 1.4,
    fontSize: 13,
  },
  captureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  } as const,
  cameraButton: {
    minHeight: 52,
    borderRadius: 10,
    border: "1px solid #0284c7",
    background: "#0ea5e9",
    color: "#ffffff",
    fontWeight: 950,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
  } as const,
  gpsButton: {
    minHeight: 52,
    borderRadius: 10,
    border: "1px solid #16a34a",
    background: "#22c55e",
    color: "#052e16",
    fontWeight: 950,
    cursor: "pointer",
  } as const,
  proofStatusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  } as const,
  proofStatusBox: {
    minHeight: 58,
    display: "grid",
    gap: 4,
    alignContent: "center",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#cbd5e1",
    fontSize: 12,
  } as const,
  photoPreview: {
    width: "100%",
    maxHeight: 260,
    borderRadius: 10,
    objectFit: "cover" as const,
    border: "1px solid #334155",
    background: "#111827",
  },
  utilityRow: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    flexWrap: "wrap" as const,
  } as const,
  label: {
    display: "block",
    marginBottom: 6,
    color: "#cbd5e1",
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
    border: "1px solid #334155",
    background: "#020617",
    color: "#f8fafc",
    padding: "10px 11px",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box" as const,
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#020617",
    color: "#f8fafc",
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
    border: "1px solid #334155",
    background: "#111827",
    color: "#cbd5e1",
    fontWeight: 800,
    fontSize: 12,
  } as const,
  primaryButton: {
    minHeight: 44,
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  } as const,
  deliveredButton: {
    minHeight: 58,
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #16a34a, #22c55e)",
    color: "#052e16",
    fontWeight: 950,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(22, 163, 74, 0.24)",
  } as const,
  success: {
    padding: 12,
    borderRadius: 8,
    background: "rgba(34, 197, 94, 0.14)",
    border: "1px solid rgba(34, 197, 94, 0.38)",
    color: "#86efac",
    fontWeight: 800,
  } as const,
  warning: {
    padding: 12,
    borderRadius: 8,
    background: "rgba(245, 158, 11, 0.16)",
    border: "1px solid rgba(245, 158, 11, 0.38)",
    color: "#fde68a",
    fontWeight: 800,
  } as const,
  error: {
    padding: 12,
    borderRadius: 8,
    background: "rgba(127, 29, 29, 0.35)",
    border: "1px solid rgba(248, 113, 113, 0.4)",
    color: "#fecaca",
    fontWeight: 800,
  } as const,
  empty: {
    padding: 18,
    borderRadius: 10,
    background: "#0f172a",
    border: "1px solid #334155",
    color: "#94a3b8",
    fontWeight: 800,
    textAlign: "center" as const,
  },
};
