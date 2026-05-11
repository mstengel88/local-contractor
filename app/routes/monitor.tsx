import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useActionData, useLoaderData, useLocation } from "react-router";
import {
  action as dispatchAction,
  loader as dispatchLoader,
} from "./dispatch";
import type {
  DispatchDriverLocation,
  DispatchOrder,
  DispatchRoute,
} from "../lib/dispatch.server";

export const loader = dispatchLoader;
export const action = dispatchAction;

const MONITOR_VIEWPORT_KEY = "dispatchMonitorMapViewport";
const MONITOR_HIDDEN_ROUTES_KEY = "dispatchMonitorHiddenRoutes";
const MONITOR_SELECTED_DATE_KEY = "dispatchMonitorSelectedDate";
const MONITOR_DATE_FILTER_KEY = "dispatchMonitorDateFilter";
const MONITOR_COMPACT_ROUTES_KEY = "dispatchMonitorCompactRoutes";
const DISPATCH_NAV_COLLAPSED_KEY = "dispatchNavCollapsed";

let monitorGoogleMapsLoader: Promise<void> | null = null;

function loadMonitorGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (monitorGoogleMapsLoader) return monitorGoogleMapsLoader;

  monitorGoogleMapsLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-monitor-google-maps="true"], script[data-classic-google-maps="true"], script[data-dispatch-google-maps="true"]',
    );

    if (existing) {
      if ((window as any).google?.maps) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.monitorGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return monitorGoogleMapsLoader;
}

function getOrderNumber(order: DispatchOrder) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}

function getOrderAddress(order: DispatchOrder) {
  return [order.address, order.city].filter(Boolean).join(", ");
}

function getLoadLabel(order: DispatchOrder) {
  return [order.quantity, order.unit, order.material].filter(Boolean).join(" ");
}

function parseRequestedDate(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed || /needs scheduling|unavailable|unknown/i.test(trimmed)) return null;

  const today = new Date();
  if (/\btoday\b/i.test(trimmed)) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
  if (/\btomorrow\b/i.test(trimmed)) {
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));

  const slashDate = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slashDate) {
    const year = slashDate[3].length === 2 ? 2000 + Number(slashDate[3]) : Number(slashDate[3]);
    return new Date(year, Number(slashDate[1]) - 1, Number(slashDate[2]));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function dateKey(date: Date | null) {
  if (!date) return "unscheduled";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatDateLabel(date: Date | null) {
  if (!date) return "Needs scheduling";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getTravelMinutes(order: DispatchOrder) {
  const minutes = Number(order.travelMinutes || 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function formatTravel(minutes: number) {
  if (!minutes) return "No travel time";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function readStorageJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function MonitorMap({
  googleMapsApiKey,
  originAddress,
  routes,
  driverLocations,
  hiddenRouteIds,
  selectedDateKey,
  filterByDate,
}: {
  googleMapsApiKey: string;
  originAddress: string;
  routes: Array<DispatchRoute & { orders: DispatchOrder[] }>;
  driverLocations: DispatchDriverLocation[];
  hiddenRouteIds: string[];
  selectedDateKey: string;
  filterByDate: boolean;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeObjectsRef = useRef<any[]>([]);
  const driverMarkersRef = useRef<any[]>([]);
  const [status, setStatus] = useState("");
  const visibleRouteIds = useMemo(
    () => new Set(routes.map((route) => route.id).filter((id) => !hiddenRouteIds.includes(id))),
    [routes, hiddenRouteIds],
  );
  const routeColorById = useMemo(
    () => new Map(routes.map((route) => [route.id, route.color || "#f97316"])),
    [routes],
  );
  const routePlan = useMemo(
    () =>
      routes
        .filter((route) => route.orders.length && visibleRouteIds.has(route.id))
        .map((route) => {
          const orders = filterByDate
            ? route.orders.filter((order) => dateKey(parseRequestedDate(order.requestedWindow)) === selectedDateKey)
            : route.orders;
          return {
            id: route.id,
            code: route.code,
            truck: route.truck,
            color: route.color || "#f97316",
            stops: orders
              .map((order) => ({
                address: getOrderAddress(order),
                customer: order.customer,
                label: getOrderNumber(order),
                load: getLoadLabel(order),
              }))
              .filter((stop) => stop.address),
          };
        })
        .filter((route) => route.stops.length),
    [filterByDate, routes, selectedDateKey, visibleRouteIds],
  );
  const routePlanKey = useMemo(
    () =>
      JSON.stringify(
        routePlan.map((route) => ({
          id: route.id,
          color: route.color,
          stops: route.stops.map((stop) => stop.address),
        })),
      ),
    [routePlan],
  );

  useEffect(() => {
    let cancelled = false;

    async function drawRoutes() {
      if (!mapRef.current) return;
      if (!googleMapsApiKey || !originAddress) {
        setStatus("Google Maps is not configured.");
        return;
      }

      try {
        await loadMonitorGoogleMaps(googleMapsApiKey);
        if (cancelled || !mapRef.current) return;

        const google = (window as any).google;
        const savedViewport = readStorageJson<{
          center?: { lat: number; lng: number };
          zoom?: number;
          mapTypeId?: string;
        } | null>(MONITOR_VIEWPORT_KEY, null);
        const map =
          mapInstanceRef.current ||
          new google.maps.Map(mapRef.current, {
            center: savedViewport?.center || { lat: 43.1789, lng: -88.1173 },
            zoom: savedViewport?.zoom || 9,
            mapTypeId: savedViewport?.mapTypeId || "roadmap",
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
          });

        mapInstanceRef.current = map;
        const saveViewport = () => {
          const center = map.getCenter();
          if (!center) return;
          window.localStorage.setItem(
            MONITOR_VIEWPORT_KEY,
            JSON.stringify({
              center: { lat: center.lat(), lng: center.lng() },
              zoom: map.getZoom(),
              mapTypeId: map.getMapTypeId(),
            }),
          );
        };
        google.maps.event.clearListeners(map, "idle");
        map.addListener("idle", saveViewport);

        routeObjectsRef.current.forEach((object) => object.setMap?.(null));
        routeObjectsRef.current = [];

        const bounds = new google.maps.LatLngBounds();
        const directionsService = new google.maps.DirectionsService();
        let yardMarkerAdded = false;

        for (const route of routePlan.slice(0, 8)) {
          for (const [stopIndex, stop] of route.stops.entries()) {
            await new Promise<void>((resolve) => {
              const renderer = new google.maps.DirectionsRenderer({
                map,
                preserveViewport: true,
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: route.color,
                  strokeOpacity: 0.8,
                  strokeWeight: 5,
                },
              });
              routeObjectsRef.current.push(renderer);

              directionsService.route(
                {
                  origin: originAddress,
                  destination: originAddress,
                  waypoints: [{ location: stop.address, stopover: true }],
                  optimizeWaypoints: false,
                  travelMode: google.maps.TravelMode.DRIVING,
                },
                (result: any, routeStatus: string) => {
                  if (cancelled) {
                    resolve();
                    return;
                  }
                  if (result && routeStatus === "OK") {
                    renderer.setDirections(result);
                    const legs = result.routes?.[0]?.legs || [];
                    const outboundLeg = legs[0];
                    const returnLeg = legs[1];
                    if (outboundLeg?.start_location) {
                      bounds.extend(outboundLeg.start_location);
                      if (!yardMarkerAdded) {
                        const yardMarker = new google.maps.Marker({
                          map,
                          position: outboundLeg.start_location,
                          label: "Y",
                          title: "Green Hills Supply",
                        });
                        routeObjectsRef.current.push(yardMarker);
                        yardMarkerAdded = true;
                      }
                    }
                    if (outboundLeg?.end_location) {
                      bounds.extend(outboundLeg.end_location);
                      const marker = new google.maps.Marker({
                        map,
                        position: outboundLeg.end_location,
                        label: String(stopIndex + 1),
                        title: `${route.code} ${stop.label} · ${stop.customer} · ${stop.load}`,
                      });
                      routeObjectsRef.current.push(marker);
                    }
                    if (returnLeg?.end_location) bounds.extend(returnLeg.end_location);
                  } else {
                    console.warn("[MONITOR MAP ROUTE ERROR]", route.code, stop.address, routeStatus);
                  }
                  resolve();
                },
              );
            });
          }
        }

        if (!savedViewport && !bounds.isEmpty()) map.fitBounds(bounds);
        setStatus(routePlan.length ? "" : "No visible route stops for this view.");
      } catch (error) {
        console.warn("[MONITOR MAP ERROR]", error);
        setStatus("Google map unavailable.");
      }
    }

    void drawRoutes();
    return () => {
      cancelled = true;
      routeObjectsRef.current.forEach((object) => object.setMap?.(null));
      routeObjectsRef.current = [];
    };
  }, [googleMapsApiKey, originAddress, routePlanKey]);

  useEffect(() => {
    let cancelled = false;

    async function drawDriverMarkers() {
      if (!googleMapsApiKey || !mapInstanceRef.current) return;
      await loadMonitorGoogleMaps(googleMapsApiKey);
      if (cancelled || !mapInstanceRef.current) return;

      const google = (window as any).google;
      const map = mapInstanceRef.current;
      driverMarkersRef.current.forEach((marker) => marker.setMap?.(null));
      driverMarkersRef.current = [];

      for (const location of driverLocations.filter(
        (item) =>
          item.routeId &&
          visibleRouteIds.has(item.routeId) &&
          Number.isFinite(item.latitude) &&
          Number.isFinite(item.longitude),
      )) {
        const routeColor = routeColorById.get(location.routeId || "") || "#22c55e";
        const marker = new google.maps.Marker({
          map,
          position: { lat: location.latitude, lng: location.longitude },
          title: `${location.truck || "Driver"} · ${location.driverName || "Driver"}`,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 7,
            fillColor: routeColor,
            fillOpacity: 1,
            strokeColor: "#020617",
            strokeWeight: 2,
            rotation: Number.isFinite(Number(location.heading)) ? Number(location.heading) : 0,
          },
          label: {
            text: location.truck || "DRV",
            color: "#020617",
            fontWeight: "900",
            fontSize: "11px",
          },
        });
        driverMarkersRef.current.push(marker);
      }
    }

    void drawDriverMarkers();
    return () => {
      cancelled = true;
      driverMarkersRef.current.forEach((marker) => marker.setMap?.(null));
      driverMarkersRef.current = [];
    };
  }, [driverLocations, googleMapsApiKey, routeColorById, visibleRouteIds]);

  return (
    <section style={styles.mapPanel}>
      <div ref={mapRef} style={styles.mapCanvas} />
      {status ? <div style={styles.mapStatus}>{status}</div> : null}
    </section>
  );
}

export default function DispatchMonitorPage() {
  const loaderData = useLoaderData() as any;
  const actionData = useActionData() as any;
  const location = useLocation();
  const allowed = actionData?.allowed ?? loaderData.allowed;
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const baseRoutes = (actionData?.routes ?? loaderData.routes ?? []) as DispatchRoute[];
  const initialDriverLocations = (actionData?.driverLocations ?? loaderData.driverLocations ?? []) as DispatchDriverLocation[];
  const [driverLocations, setDriverLocations] = useState<DispatchDriverLocation[]>(initialDriverLocations);
  const [filterByDate, setFilterByDate] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(MONITOR_DATE_FILTER_KEY) === "1";
  });
  const [selectedDateKey] = useState(() => {
    if (typeof window === "undefined") return dateKey(new Date());
    return window.localStorage.getItem(MONITOR_SELECTED_DATE_KEY) || dateKey(new Date());
  });
  const [hiddenRouteIds, setHiddenRouteIds] = useState<string[]>(() =>
    readStorageJson<string[]>(MONITOR_HIDDEN_ROUTES_KEY, []),
  );
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISPATCH_NAV_COLLAPSED_KEY) === "1";
  });
  const [compactRoutes, setCompactRoutes] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(MONITOR_COMPACT_ROUTES_KEY) === "1";
  });

  const currentUser = actionData?.currentUser ?? loaderData.currentUser ?? null;
  const googleMapsApiKey = actionData?.googleMapsApiKey ?? loaderData.googleMapsApiKey ?? "";
  const mapOriginAddress = actionData?.mapOriginAddress ?? loaderData.mapOriginAddress ?? "";
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const classicHref = isEmbeddedRoute ? "/app/classic" : "/classic";
  const monitorHref = isEmbeddedRoute ? "/app/monitor" : "/monitor";
  const calendarHref = isEmbeddedRoute ? "/app/calendar" : "/calendar";
  const allotmentHref = isEmbeddedRoute ? "/app/allotment" : "/allotment";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const quoteHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const mobileHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const dispatchViewHref = (view: string) => `${dispatchHref}?view=${view}`;
  const logoutHref = currentUser ? "/login?logout=1" : `${dispatchHref}?logout=1`;
  const canAccess = (permission: string) =>
    !currentUser || currentUser.permissions?.includes(permission);

  useEffect(() => {
    setDriverLocations(initialDriverLocations);
  }, [initialDriverLocations]);

  useEffect(() => {
    let cancelled = false;
    async function loadDriverLocations() {
      try {
        const response = await fetch("/api/dispatch-driver-location");
        const result = await response.json().catch(() => null);
        if (!cancelled && response.ok && result?.ok !== false) {
          setDriverLocations(result.locations || []);
        }
      } catch {
        // Keep the last known markers if a refresh misses.
      }
    }
    const timer = window.setInterval(loadDriverLocations, 60000);
    void loadDriverLocations();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const routes = useMemo(
    () =>
      baseRoutes.map((route) => {
        const routeOrders = orders
          .filter(
            (order) =>
              order.assignedRouteId === route.id &&
              order.status !== "delivered" &&
              order.deliveryStatus !== "delivered",
          )
          .sort((a, b) => Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999));
        return { ...route, orders: routeOrders };
      }),
    [baseRoutes, orders],
  );
  const activeRoutes = routes.filter((route) => route.orders.length);
  const visibleRouteOrders = activeRoutes.map((route) => {
    const routeOrders = filterByDate
      ? route.orders.filter((order) => dateKey(parseRequestedDate(order.requestedWindow)) === selectedDateKey)
      : route.orders;
    return {
      ...route,
      orders: routeOrders,
      totalTravelMinutes: routeOrders.reduce((sum, order) => sum + getTravelMinutes(order), 0),
    };
  });
  const visibleRouteOrderCount = visibleRouteOrders.reduce(
    (sum, route) => sum + route.orders.length,
    0,
  );

  function toggleNavCollapsed() {
    setNavCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(DISPATCH_NAV_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  function toggleDateFilter() {
    setFilterByDate((current) => {
      const next = !current;
      window.localStorage.setItem(MONITOR_DATE_FILTER_KEY, next ? "1" : "0");
      return next;
    });
  }

  function toggleCompactRoutes() {
    setCompactRoutes((current) => {
      const next = !current;
      window.localStorage.setItem(MONITOR_COMPACT_ROUTES_KEY, next ? "1" : "0");
      return next;
    });
  }

  function toggleRoute(routeId: string) {
    setHiddenRouteIds((current) => {
      const next = current.includes(routeId)
        ? current.filter((id) => id !== routeId)
        : [...current, routeId];
      window.localStorage.setItem(MONITOR_HIDDEN_ROUTES_KEY, JSON.stringify(next));
      return next;
    });
  }

  function resetMapView() {
    window.localStorage.removeItem(MONITOR_VIEWPORT_KEY);
    window.location.reload();
  }

  if (!allowed) {
    return (
      <main style={styles.loginPage}>
        <section style={styles.loginCard}>
          <h1 style={styles.loginTitle}>Dispatch Monitor</h1>
          <p style={styles.muted}>Open Dispatch first, then return to this monitor page.</p>
          <Link to={dispatchHref} style={styles.primaryLink}>Open Dispatch</Link>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <aside style={{ ...styles.sideRail, width: navCollapsed ? 56 : 250, padding: navCollapsed ? "12px 8px" : "16px 14px" }}>
        <button type="button" onClick={toggleNavCollapsed} style={styles.navToggle}>
          {navCollapsed ? ">" : "<"}
        </button>
        <div style={styles.brand}>
          <img src="/green-hills-logo.png" alt="Green Hills Supply" style={styles.logo} />
          <div style={navCollapsed ? styles.hidden : undefined}>
            <div style={styles.brandTitle}>Contractor</div>
            <div style={styles.brandSub}>Monitor</div>
          </div>
        </div>
        <nav style={navCollapsed ? styles.hidden : styles.nav}>
          <Link to={classicHref} style={styles.navLink}>Classic</Link>
          <Link to={monitorHref} style={styles.navLinkActive}>Monitor</Link>
          <Link to={calendarHref} style={styles.navLink}>Calendar</Link>
          <Link to={allotmentHref} style={styles.navLink}>Allotment</Link>
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("orders")} style={styles.navLink}>Orders</Link> : null}
          <Link to={dispatchViewHref("scheduled")} style={styles.navLink}>Scheduled</Link>
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("routes")} style={styles.navLink}>Routes</Link> : null}
          <Link to={dispatchViewHref("delivered")} style={styles.navLink}>Delivered</Link>
          <a href="https://www.ghstickets.info" style={styles.navLink}>Ticket Creator</a>
        </nav>
        <div style={{ flex: 1 }} />
        <div style={navCollapsed ? styles.hidden : styles.footerNav}>
          {canAccess("driver") ? <Link to={driverHref} style={styles.utility}>Driver Route</Link> : null}
          {canAccess("quoteTool") ? <Link to={quoteHref} style={styles.utility}>Quote Tool</Link> : null}
          <Link to={mobileHref} style={styles.utility}>Mobile</Link>
          <Link to={logoutHref} style={styles.utility}>Log Out</Link>
        </div>
      </aside>

      <section style={styles.monitorGrid}>
        <section style={styles.orderPane}>
          <header style={styles.header}>
            <p style={styles.kicker}>Dispatch Monitor</p>
            <h1 style={styles.title}>Orders by Truck</h1>
            <p style={styles.muted}>Map zoom, position, route visibility, and filters stay saved after refresh.</p>
          </header>
          <div style={styles.controls}>
            <button type="button" onClick={toggleDateFilter} style={filterByDate ? styles.activeButton : styles.ghostButton}>
              {filterByDate ? "Showing selected date" : "Showing all active routes"}
            </button>
            <button type="button" onClick={toggleCompactRoutes} style={compactRoutes ? styles.activeButton : styles.ghostButton}>
              {compactRoutes ? "Compact on" : "Compact routes"}
            </button>
            <button type="button" onClick={resetMapView} style={styles.ghostButton}>Reset map view</button>
          </div>
          <div style={styles.summaryBar}>
            <strong>{visibleRouteOrderCount} active load{visibleRouteOrderCount === 1 ? "" : "s"}</strong>
            {filterByDate ? <span>{formatDateLabel(parseRequestedDate(selectedDateKey))}</span> : <span>All scheduled route loads</span>}
          </div>
          <div style={styles.truckList}>
            {visibleRouteOrders.map((route) => (
              <section key={route.id} style={compactRoutes ? styles.truckCardCompact : styles.truckCard}>
                <div style={compactRoutes ? styles.truckHeaderCompact : styles.truckHeader}>
                  <span style={{ ...styles.routeDot, background: route.color || "#f97316" }} />
                  <div>
                    <strong>{route.code} · {route.truck || "No truck"}</strong>
                    <small>{route.driver || "No driver"} · {route.orders.length} stop{route.orders.length === 1 ? "" : "s"} · {formatTravel(route.totalTravelMinutes)}</small>
                  </div>
                </div>
                <div style={compactRoutes ? styles.truckOrdersCompact : styles.truckOrders}>
                  {route.orders.map((order, index) => (
                    <Link
                      key={order.id}
                      to={`${dispatchHref}?view=orders&order=${encodeURIComponent(order.id)}&returnTo=${encodeURIComponent(monitorHref)}`}
                      style={compactRoutes ? styles.orderCardCompact : styles.orderCard}
                    >
                      <span style={compactRoutes ? styles.stopBadgeCompact : styles.stopBadge}>{order.stopSequence || index + 1}</span>
                      <div style={compactRoutes ? styles.orderTextCompact : styles.orderText}>
                        <strong>{getOrderNumber(order)} {order.customer}</strong>
                        {compactRoutes ? (
                          <span>{getLoadLabel(order)}</span>
                        ) : (
                          <>
                            <span>{getLoadLabel(order)}</span>
                            <small>{getOrderAddress(order)}</small>
                          </>
                        )}
                      </div>
                    </Link>
                  ))}
                  {!route.orders.length ? <div style={styles.empty}>No loads for this filter.</div> : null}
                </div>
              </section>
            ))}
            {!visibleRouteOrders.length ? <div style={styles.empty}>No active routes yet.</div> : null}
          </div>
        </section>

        <section style={styles.mapSide}>
          <div style={styles.routeLegend}>
            {activeRoutes.map((route) => {
              const hidden = hiddenRouteIds.includes(route.id);
              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => toggleRoute(route.id)}
                  style={hidden ? styles.routeButtonHidden : styles.routeButton}
                >
                  <span style={{ ...styles.routeDot, background: route.color || "#f97316" }} />
                  {route.code} {route.truck || ""}
                </button>
              );
            })}
          </div>
          <MonitorMap
            googleMapsApiKey={googleMapsApiKey}
            originAddress={mapOriginAddress}
            routes={routes}
            driverLocations={driverLocations}
            hiddenRouteIds={hiddenRouteIds}
            selectedDateKey={selectedDateKey}
            filterByDate={filterByDate}
          />
        </section>
      </section>
    </main>
  );
}

const navBase: CSSProperties = {
  borderRadius: 8,
  color: "#e5e7eb",
  fontWeight: 800,
  padding: "14px 16px",
  textDecoration: "none",
};

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    background: "#020617",
    color: "#f8fafc",
    fontFamily: "Verdana, Geneva, Tahoma, sans-serif",
    fontSize: 12,
  },
  loginPage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#020617",
    color: "#f8fafc",
    padding: 24,
  },
  loginCard: {
    width: "100%",
    maxWidth: 460,
    padding: 28,
    borderRadius: 14,
    border: "1px solid #334155",
    background: "#0f172a",
  },
  loginTitle: { margin: "0 0 8px", fontSize: 30 },
  primaryLink: {
    display: "inline-flex",
    marginTop: 18,
    padding: "12px 18px",
    borderRadius: 999,
    background: "#ff7a1a",
    color: "#fff",
    fontWeight: 900,
    textDecoration: "none",
  },
  sideRail: {
    minHeight: "100vh",
    position: "sticky",
    top: 0,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    borderRight: "1px solid #1e293b",
    background: "#020617",
    overflow: "hidden",
    transition: "width 160ms ease, padding 160ms ease",
  },
  navToggle: {
    width: 34,
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#ff7a1a",
    fontWeight: 900,
    cursor: "pointer",
  },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  logo: { width: 52, height: 52, objectFit: "contain" },
  brandTitle: { fontSize: 18, fontWeight: 900 },
  brandSub: { color: "#cbd5e1", fontWeight: 800 },
  hidden: { display: "none" },
  nav: { display: "grid", gap: 8 },
  navLink: navBase,
  navLinkActive: { ...navBase, background: "#1e293b", color: "#ff7a1a" },
  footerNav: { display: "grid", gap: 8 },
  utility: { ...navBase, border: "1px solid #334155", padding: "11px 14px" },
  monitorGrid: {
    flex: 1,
    minWidth: 0,
    height: "100vh",
    display: "grid",
    gridTemplateColumns: "420px minmax(0, 1fr)",
  },
  orderPane: {
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto auto auto minmax(0, 1fr)",
    gap: 12,
    padding: 14,
    borderRight: "1px solid #334155",
    overflow: "hidden",
  },
  header: {
    padding: 16,
    border: "1px solid #334155",
    background: "#0f172a",
  },
  kicker: {
    margin: 0,
    color: "#ff7a1a",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: { margin: "4px 0 4px", fontSize: 28 },
  muted: { margin: 0, color: "#94a3b8" },
  controls: { display: "flex", gap: 8, flexWrap: "wrap" },
  ghostButton: {
    minHeight: 34,
    padding: "0 13px",
    borderRadius: 999,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e5e7eb",
    fontWeight: 900,
    cursor: "pointer",
  },
  activeButton: {
    minHeight: 34,
    padding: "0 13px",
    borderRadius: 999,
    border: "1px solid #ff7a1a",
    background: "#ff7a1a",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  summaryBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e5e7eb",
  },
  truckList: {
    minHeight: 0,
    display: "grid",
    alignContent: "start",
    gap: 10,
    overflow: "auto",
    paddingRight: 4,
  },
  truckCard: {
    border: "1px solid #334155",
    background: "#0f172a",
    overflow: "hidden",
  },
  truckCardCompact: {
    border: "1px solid #334155",
    background: "#0f172a",
    overflow: "hidden",
  },
  truckHeader: {
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    padding: 12,
    borderBottom: "1px solid #334155",
  },
  truckHeaderCompact: {
    display: "grid",
    gridTemplateColumns: "10px minmax(0, 1fr)",
    gap: 8,
    alignItems: "center",
    padding: "6px 8px",
    borderBottom: "1px solid #334155",
  },
  truckOrders: {
    display: "grid",
    gap: 8,
    padding: 10,
  },
  truckOrdersCompact: {
    display: "grid",
    gap: 4,
    padding: 6,
  },
  orderCard: {
    display: "grid",
    gridTemplateColumns: "30px minmax(0, 1fr)",
    alignItems: "start",
    gap: 4,
    padding: 10,
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#111827",
    color: "#f8fafc",
    textDecoration: "none",
  },
  orderCardCompact: {
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr)",
    alignItems: "center",
    gap: 5,
    padding: "4px 6px",
    borderRadius: 7,
    border: "1px solid #263449",
    background: "#111827",
    color: "#f8fafc",
    textDecoration: "none",
    fontSize: 11,
  },
  stopBadge: {
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "#1e293b",
    color: "#38bdf8",
    fontWeight: 900,
  },
  stopBadgeCompact: {
    width: 20,
    height: 20,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "#1e293b",
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: 900,
  },
  orderText: {
    minWidth: 0,
    display: "grid",
    gap: 3,
  },
  orderTextCompact: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 8,
    alignItems: "center",
  },
  empty: { color: "#94a3b8", padding: 12 },
  mapSide: {
    minWidth: 0,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    background: "#020617",
  },
  routeLegend: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    padding: 10,
    borderBottom: "1px solid #334155",
    background: "#0f172a",
  },
  routeButton: {
    minHeight: 32,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    border: "1px solid #334155",
    background: "#111827",
    color: "#f8fafc",
    fontWeight: 900,
    cursor: "pointer",
  },
  routeButtonHidden: {
    minHeight: 32,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    border: "1px solid #1e293b",
    background: "#020617",
    color: "#64748b",
    fontWeight: 900,
    cursor: "pointer",
    opacity: 0.65,
  },
  routeDot: { width: 10, height: 10, borderRadius: "50%" },
  mapPanel: { position: "relative", minHeight: 0 },
  mapCanvas: { width: "100%", height: "100%" },
  mapStatus: {
    position: "absolute",
    top: 14,
    left: 14,
    zIndex: 2,
    padding: "9px 12px",
    borderRadius: 10,
    background: "rgba(15, 23, 42, 0.9)",
    border: "1px solid #334155",
    color: "#e5e7eb",
    fontWeight: 900,
  },
};
