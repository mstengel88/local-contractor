import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import {
  action as dispatchAction,
  loader as dispatchLoader,
} from "./dispatch";
import type {
  DispatchEmployee,
  DispatchOrder,
  DispatchRoute,
  DispatchTruck,
} from "../lib/dispatch.server";

export const loader = dispatchLoader;
export const action = dispatchAction;

function getOrderNumber(order: DispatchOrder) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}

function getOrderAddress(order: DispatchOrder) {
  return [order.address, order.city].filter(Boolean).join(", ");
}

function getTravelMinutes(order: DispatchOrder) {
  const minutes = Number(order.travelMinutes || 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function formatTime(minutes: number) {
  if (!minutes) return "-";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function statusLabel(order: DispatchOrder) {
  if (order.status === "delivered" || order.deliveryStatus === "delivered") return "Delivered";
  if (order.assignedRouteId || order.status === "scheduled") return "Scheduled";
  if (order.status === "hold") return "On hold";
  return "Unscheduled";
}

function buildSearchText(order: DispatchOrder) {
  return [
    order.id,
    order.orderNumber,
    order.customer,
    order.contact,
    order.address,
    order.city,
    order.material,
    order.quantity,
    order.unit,
    order.requestedWindow,
    order.timePreference,
    order.notes,
    order.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

let classicGoogleMapsLoader: Promise<void> | null = null;

function loadClassicGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (classicGoogleMapsLoader) return classicGoogleMapsLoader;

  classicGoogleMapsLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-classic-google-maps="true"]',
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.classicGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return classicGoogleMapsLoader;
}

function ClassicMapFallback({
  routes,
}: {
  routes: Array<DispatchRoute & { orders: DispatchOrder[] }>;
}) {
  const colors = ["#d93025", "#f97316", "#2563eb", "#0f9f9a", "#9333ea"];
  const activeRoutes = useMemo(
    () => routes.filter((route) => route.orders.length),
    [routes],
  );

  return (
    <div style={styles.mapCanvas}>
      <div style={styles.mapToolbar}>
        <button style={styles.mapToggle}>Map</button>
        <button style={styles.mapToggleMuted}>Hybrid</button>
      </div>
      <svg viewBox="0 0 720 430" preserveAspectRatio="none" style={styles.routeSvg}>
        <defs>
          <pattern id="classic-grid" width="42" height="42" patternUnits="userSpaceOnUse">
            <path d="M 42 0 L 0 0 0 42" fill="none" stroke="#d9e8d0" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="720" height="430" fill="#eef7e8" />
        <rect width="720" height="430" fill="url(#classic-grid)" opacity="0.85" />
        <path d="M0 290 C115 250 175 300 260 250 S430 175 720 215 L720 430 L0 430Z" fill="#b8dcff" opacity="0.9" />
        <path d="M80 80 C190 125 265 95 375 145 C500 205 560 125 665 170" stroke="#f3c478" strokeWidth="12" fill="none" opacity="0.8" />
        <path d="M50 250 C145 215 220 235 335 200 C455 165 550 210 680 160" stroke="#f3c478" strokeWidth="10" fill="none" opacity="0.75" />
        <path d="M165 30 C180 120 250 145 255 250 C260 330 350 360 500 385" stroke="#f3c478" strokeWidth="10" fill="none" opacity="0.75" />
        {activeRoutes.slice(0, 5).map((route, routeIndex) => {
          const color = route.color || colors[routeIndex % colors.length];
          const startY = 88 + routeIndex * 60;
          const path = `M ${78 + routeIndex * 12} ${startY} C ${180 + routeIndex * 22} ${45 + routeIndex * 52}, ${260 + routeIndex * 18} ${220 - routeIndex * 20}, ${370 + routeIndex * 28} ${160 + routeIndex * 44} S ${570 - routeIndex * 25} ${280 - routeIndex * 18}, ${650 - routeIndex * 18} ${120 + routeIndex * 56}`;
          return (
            <g key={route.id}>
              <path d={path} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {route.orders.slice(0, 8).map((order, stopIndex) => {
                const x = 90 + stopIndex * 72 + routeIndex * 10;
                const y = startY + Math.sin(stopIndex + routeIndex) * 54 + stopIndex * 18;
                return (
                  <g key={order.id}>
                    <circle cx={x} cy={y} r="13" fill="#fff" stroke={color} strokeWidth="5" />
                    <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#1f2937">
                      {stopIndex + 1}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div style={styles.mapLegend}>
        {activeRoutes.slice(0, 5).map((route) => (
          <span key={route.id} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: route.color }} />
            {route.code} {route.truck || "Unassigned"}
          </span>
        ))}
      </div>
    </div>
  );
}

function ClassicMap({
  googleMapsApiKey,
  originAddress,
  routes,
}: {
  googleMapsApiKey: string;
  originAddress: string;
  routes: Array<DispatchRoute & { orders: DispatchOrder[] }>;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObjectsRef = useRef<any[]>([]);
  const [status, setStatus] = useState("");
  const [useFallback, setUseFallback] = useState(false);
  const activeRoutes = routes.filter((route) => route.orders.length);
  const routePlan = useMemo(
    () =>
      activeRoutes
        .map((route) => ({
          id: route.id,
          code: route.code,
          truck: route.truck,
          color: route.color || "#f97316",
          stops: route.orders
            .map((order) => ({
              address: getOrderAddress(order),
              customer: order.customer,
              label: getOrderNumber(order),
            }))
            .filter((stop) => stop.address),
        }))
        .filter((route) => route.stops.length),
    [activeRoutes],
  );

  useEffect(() => {
    let cancelled = false;

    async function drawMap() {
      if (!mapRef.current) return;
      if (!googleMapsApiKey || !originAddress || !routePlan.length) {
        setUseFallback(true);
        return;
      }

      setStatus("Loading map...");
      setUseFallback(false);

      try {
        await loadClassicGoogleMaps(googleMapsApiKey);
        if (cancelled || !mapRef.current) return;

        const google = (window as any).google;
        mapObjectsRef.current.forEach((object) => object.setMap?.(null));
        mapObjectsRef.current = [];

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 43.1789, lng: -88.1173 },
          zoom: 9,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        });
        const bounds = new google.maps.LatLngBounds();
        const directionsService = new google.maps.DirectionsService();
        let yardMarkerAdded = false;

        await Promise.all(
          routePlan.slice(0, 6).map(
            (route) =>
              Promise.all(
                route.stops.map(
                  (stop, stopIndex) =>
                    new Promise<void>((resolve) => {
                      const renderer = new google.maps.DirectionsRenderer({
                        map,
                        preserveViewport: true,
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: route.color,
                          strokeOpacity: 0.78,
                          strokeWeight: 5,
                        },
                      });
                      mapObjectsRef.current.push(renderer);

                      directionsService.route(
                        {
                          origin: originAddress,
                          destination: originAddress,
                          waypoints: [
                            {
                              location: stop.address,
                              stopover: true,
                            },
                          ],
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
                                mapObjectsRef.current.push(yardMarker);
                                yardMarkerAdded = true;
                              }
                            }
                            if (outboundLeg?.end_location) {
                              bounds.extend(outboundLeg.end_location);
                              const marker = new google.maps.Marker({
                                map,
                                position: outboundLeg.end_location,
                                label: String(stopIndex + 1),
                                title: `${stop.label} · ${stop.customer}`,
                              });
                              mapObjectsRef.current.push(marker);
                            }
                            if (returnLeg?.end_location) bounds.extend(returnLeg.end_location);
                          } else {
                            console.warn("[CLASSIC MAP ROUND TRIP ERROR]", route.code, stop.address, routeStatus);
                          }
                          resolve();
                        },
                      );
                    }),
                ),
              ).then(() => undefined),
          ),
        );

        if (!bounds.isEmpty()) map.fitBounds(bounds);
        setStatus("");
      } catch (error) {
        console.warn("[CLASSIC MAP ERROR]", error);
        setStatus("Google map unavailable. Showing route preview.");
        setUseFallback(true);
      }
    }

    drawMap();

    return () => {
      cancelled = true;
      mapObjectsRef.current.forEach((object) => object.setMap?.(null));
      mapObjectsRef.current = [];
    };
  }, [googleMapsApiKey, originAddress, routePlan]);

  if (useFallback) {
    return (
      <div style={styles.mapCanvas}>
        <ClassicMapFallback routes={routes} />
        {status ? <div style={styles.classicMapStatus}>{status}</div> : null}
      </div>
    );
  }

  return (
    <div style={styles.mapCanvas}>
      <div ref={mapRef} style={styles.realMapCanvas} />
      {status ? <div style={styles.classicMapStatus}>{status}</div> : null}
      <div style={styles.mapLegend}>
        {activeRoutes.slice(0, 6).map((route) => (
          <span key={route.id} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: route.color }} />
            {route.code} {route.truck || "Unassigned"}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ClassicDispatchPage() {
  const loaderData = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const [query, setQuery] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [draggedOrderId, setDraggedOrderId] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [routeDrawerOpen, setRouteDrawerOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false);

  const allowed = actionData?.allowed ?? loaderData.allowed;
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const baseRoutes = (actionData?.routes ?? loaderData.routes ?? []) as DispatchRoute[];
  const trucks = (actionData?.trucks ?? loaderData.trucks ?? []) as DispatchTruck[];
  const employees = (actionData?.employees ?? loaderData.employees ?? []) as DispatchEmployee[];
  const materialOptions = (actionData?.materialOptions ?? loaderData.materialOptions ?? []) as string[];
  const message = actionData?.message || loaderData?.mailboxStatus?.message || "";
  const googleMapsApiKey = actionData?.googleMapsApiKey ?? loaderData.googleMapsApiKey ?? "";
  const mapOriginAddress = actionData?.mapOriginAddress ?? loaderData.mapOriginAddress ?? "";
  const drivers = employees.filter((employee) => employee.role === "driver");
  const helpers = employees.filter((employee) => employee.role === "helper");

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
        return {
          ...route,
          orders: routeOrders,
          weight: routeOrders.reduce((sum, order) => sum + Number(order.quantity || 0), 0),
          totalMinutes: routeOrders.reduce((sum, order) => sum + getTravelMinutes(order), 0),
        };
      }),
    [baseRoutes, orders],
  );
  const selectedRoute =
    routes.find((route) => route.id === selectedRouteId) || routes[0] || null;
  const pendingOrder = orders.find((order) => order.id === pendingOrderId) || null;
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;

  const search = query.trim().toLowerCase();
  const visibleOrders = useMemo(
    () =>
      search
        ? orders.filter((order) => buildSearchText(order).includes(search))
        : orders,
    [orders, search],
  );
  const unscheduledOrders = visibleOrders.filter(
    (order) =>
      !order.assignedRouteId &&
      order.status !== "delivered" &&
      order.deliveryStatus !== "delivered" &&
      order.status !== "scheduled",
  );
  const scheduledOrders = visibleOrders.filter(
    (order) =>
      order.assignedRouteId &&
      order.status !== "delivered" &&
      order.deliveryStatus !== "delivered",
  );
  const deliveredCount = orders.filter(
    (order) => order.status === "delivered" || order.deliveryStatus === "delivered",
  ).length;

  function beginOrderDrag(orderId: string) {
    setDraggedOrderId(orderId);
  }

  function allowRouteDrop(event: DragEvent<HTMLElement>) {
    if (!selectedRoute) return;
    event.preventDefault();
  }

  function dropOrderOnCurrentRoute(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!selectedRoute || !draggedOrderId) return;
    setPendingOrderId(draggedOrderId);
    setDraggedOrderId("");
  }

  if (!allowed) {
    return (
      <main style={styles.loginPage}>
        <Form method="post" style={styles.loginBox}>
          <h1 style={styles.loginTitle}>Classic Dispatch</h1>
          <p style={styles.muted}>Log in to open the light plan-and-track board.</p>
          <input type="hidden" name="intent" value="login" />
          <input name="password" type="password" placeholder="Password" style={styles.input} />
          <button type="submit" style={styles.orangeButton}>Log In</button>
        </Form>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <style>
        {`
          .classic-table th,
          .classic-table td {
            height: 28px;
            padding: 3px 8px;
            border-bottom: 1px solid #e2e2e2;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-align: left;
          }

          .classic-table th {
            background: #f6f6f6;
            color: #555;
            font-size: 12px;
            font-weight: 700;
          }

          .classic-table tr:hover td {
            background: #f7fbff;
          }
        `}
      </style>
      <aside style={styles.sideRail}>
        <div style={styles.railLogo}>≡</div>
        <Link to="/dispatch" style={styles.railIcon}>◇</Link>
        <Link to="/classic" style={styles.railIconActive}>▣</Link>
        <Link to="/dispatch?view=routes" style={styles.railIcon}>▥</Link>
        <Link to="/dispatch/driver" style={styles.railIcon}>▤</Link>
        <div style={{ flex: 1 }} />
        <Link to="/settings" style={styles.railIcon}>⚙</Link>
      </aside>

      <section style={styles.workspace}>
        <header style={styles.topBar}>
          <div style={styles.brandMark}>✓</div>
          <strong style={styles.brandText}>Plan & Track</strong>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by Order Number"
            style={styles.search}
          />
          <Form method="post" style={styles.topForm}>
            <input type="hidden" name="intent" value="poll-mailbox" />
            <button type="submit" style={styles.outlineButton}>Import Mail</button>
          </Form>
          <a href="#add-route" style={styles.outlineButton}>Add Route</a>
          <a href="#add-order" style={styles.orangeButton}>Add Order</a>
          <div style={styles.company}>Green Hills Dispatch</div>
        </header>

        {message ? (
          <div style={actionData?.ok === false ? styles.errorBanner : styles.messageBanner}>
            {message}
          </div>
        ) : null}

        <div style={styles.mainGrid}>
          <section style={styles.leftStack}>
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <strong>Routes {routes.length}</strong>
                <span>Today</span>
              </div>
              <table className="classic-table" style={styles.table}>
                <thead>
                  <tr>
                    <th />
                    <th>Code</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Weight</th>
                    <th>Start</th>
                    <th>Finish</th>
                    <th>Distance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {routes.map((route, index) => (
                    <tr key={route.id}>
                      <td><span style={{ ...styles.colorBar, background: route.color || "#f97316" }} /></td>
                      <td>
                        <button
                          type="button"
                          style={styles.rowRouteButton(selectedRoute?.id === route.id)}
                          onClick={() => {
                            setSelectedRouteId(route.id);
                            setRouteDrawerOpen(true);
                          }}
                        >
                          {route.code}
                        </button>
                      </td>
                      <td>{route.truck || "No truck"} ({route.driver || "No driver"})</td>
                      <td>{route.orders.length ? "Active" : "Open"}</td>
                      <td>{route.weight || "-"}</td>
                      <td>{route.shift?.split("-")[0]?.trim() || "6:00 am"}</td>
                      <td>{route.shift?.split("-")[1]?.trim() || formatTime(route.totalMinutes)}</td>
                      <td>{formatTime(route.totalMinutes)}</td>
                      <td>
                        <Form method="post" style={styles.inlineActions}>
                          <input type="hidden" name="routeId" value={route.id} />
                          <button name="intent" value="sequence-route" style={styles.iconButton} title="Optimize route">
                            ⟳
                          </button>
                          <button
                            name="intent"
                            value="delete-route"
                            style={styles.iconButton}
                            title="Delete route"
                            onClick={(event) => {
                              if (!window.confirm(`Delete route ${route.code}? Active orders must be moved first.`)) {
                                event.preventDefault();
                              }
                            }}
                          >
                            ×
                          </button>
                        </Form>
                      </td>
                    </tr>
                  ))}
                  {!routes.length ? (
                    <tr><td colSpan={9} style={styles.emptyCell}>No routes have been set up yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <strong>Sites {selectedRoute?.orders.length || 0}</strong>
                <span>{selectedRoute ? `${selectedRoute.code} · ${selectedRoute.truck || "No truck"}` : "Select a route"}</span>
              </div>
              <div
                style={draggedOrderId ? styles.dropZoneActive : styles.dropZone}
                onDragOver={allowRouteDrop}
                onDrop={dropOrderOnCurrentRoute}
              >
                Drag and Drop to the Current Route
              </div>
              <table className="classic-table" style={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Address</th>
                    <th>Arrived</th>
                    <th>Departed</th>
                    <th>ETA</th>
                    <th>mi</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(selectedRoute?.orders || []).slice(0, 9).map((order, index) => (
                    <tr key={order.id}>
                      <td>{order.stopSequence || index + 1}</td>
                      <td>{getOrderAddress(order)}</td>
                      <td>{order.arrivedAt ? new Date(order.arrivedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "-"}</td>
                      <td>{order.departedAt ? new Date(order.departedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "-"}</td>
                      <td>{order.eta || order.requestedWindow || "-"}</td>
                      <td>{order.travelMiles || "-"}</td>
                      <td>
                        <Form method="post">
                          <input type="hidden" name="intent" value="unassign-order" />
                          <input type="hidden" name="orderId" value={order.id} />
                          <button style={styles.linkButton}>Unassign</button>
                        </Form>
                      </td>
                    </tr>
                  ))}
                  {!selectedRoute?.orders.length ? (
                    <tr><td colSpan={7} style={styles.emptyCell}>Pick a route, then drag unscheduled orders here.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <strong>Orders {visibleOrders.length}</strong>
                <span>{deliveredCount} delivered</span>
              </div>
              <table className="classic-table" style={styles.table}>
                <thead>
                  <tr>
                    <th />
                    <th>Order No</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Weight</th>
                    <th>Volume</th>
                    <th>Status</th>
                    <th>Material</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.slice(0, 12).map((order) => (
                    <tr key={order.id}>
                      <td>D</td>
                      <td>
                        <button
                          type="button"
                          style={styles.rowOrderButton}
                          onClick={() => {
                            setSelectedOrderId(order.id);
                            setOrderDrawerOpen(true);
                            setRouteDrawerOpen(false);
                          }}
                        >
                          {getOrderNumber(order)}
                        </button>
                      </td>
                      <td>{order.requestedWindow || "-"}</td>
                      <td>{order.customer}</td>
                      <td>{order.quantity || "-"}</td>
                      <td>{order.unit}</td>
                      <td><span style={styles.statusPill}>{statusLabel(order)}</span></td>
                      <td>{order.material}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={styles.rightStack}>
            <ClassicMap
              googleMapsApiKey={googleMapsApiKey}
              originAddress={mapOriginAddress}
              routes={routes}
            />

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <strong>Unscheduled {unscheduledOrders.length}</strong>
                <span>Routing</span>
              </div>
              <table className="classic-table" style={styles.table}>
                <thead>
                  <tr>
                    <th>Order No</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Address</th>
                    <th>Weight</th>
                    <th>Volume</th>
                    <th>Route</th>
                  </tr>
                </thead>
                <tbody>
                  {unscheduledOrders.slice(0, 12).map((order) => (
                    <tr
                      key={order.id}
                      draggable
                      onDragStart={() => beginOrderDrag(order.id)}
                      onDragEnd={() => setDraggedOrderId("")}
                      style={styles.draggableRow}
                    >
                      <td>{getOrderNumber(order)}</td>
                      <td>{order.requestedWindow || "-"}</td>
                      <td>{order.customer}</td>
                      <td>{getOrderAddress(order)}</td>
                      <td>{order.quantity || "-"}</td>
                      <td>{order.unit}</td>
                      <td>
                        <Form method="post" style={styles.assignForm}>
                          <input type="hidden" name="intent" value="assign-order" />
                          <input type="hidden" name="orderId" value={order.id} />
                          <select name="routeId" style={styles.smallSelect} required>
                            <option value="">Route</option>
                            {routes.map((route) => (
                              <option key={route.id} value={route.id}>
                                {route.code}
                              </option>
                            ))}
                          </select>
                          <button style={styles.assignMini}>Assign</button>
                        </Form>
                      </td>
                    </tr>
                  ))}
                  {!unscheduledOrders.length ? (
                    <tr><td colSpan={7} style={styles.emptyCell}>No unscheduled orders match this search.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={styles.formGrid}>
              <Form id="add-route" method="post" style={styles.compactForm}>
                <input type="hidden" name="intent" value="create-route" />
                <strong>Add Route</strong>
                <input name="code" placeholder="R-22" style={styles.input} />
                <select name="truckId" style={styles.input}>
                  <option value="">Truck</option>
                  {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.label}</option>)}
                </select>
                <select name="driverId" style={styles.input}>
                  <option value="">Driver</option>
                  {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                </select>
                <select name="helperId" style={styles.input}>
                  <option value="">Helper</option>
                  {helpers.map((helper) => <option key={helper.id} value={helper.id}>{helper.name}</option>)}
                </select>
                <input name="shift" placeholder="6:00a - 2:30p" style={styles.input} />
                <input name="region" placeholder="Region" style={styles.input} />
                <input name="color" type="color" defaultValue="#f97316" style={styles.colorInput} />
                <button style={styles.orangeButton}>Add Route</button>
              </Form>

              <Form id="add-order" method="post" style={styles.compactForm}>
                <input type="hidden" name="intent" value="create-order" />
                <strong>Add Order</strong>
                <input name="orderNumber" placeholder="Order number" style={styles.input} />
                <input name="customer" placeholder="Customer" style={styles.input} />
                <input name="contact" placeholder="Contact / email" style={styles.input} />
                <input name="address" placeholder="Address" style={styles.input} />
                <input name="city" placeholder="City, ST ZIP" style={styles.input} />
                <input name="material" placeholder="Material" list="classic-materials" style={styles.input} />
                <datalist id="classic-materials">
                  {materialOptions.map((material) => <option key={material} value={material} />)}
                </datalist>
                <input name="quantity" placeholder="Qty" style={styles.input} />
                <input name="requestedWindow" type="date" style={styles.input} />
                <button style={styles.orangeButton}>Add Order</button>
              </Form>
            </div>
          </section>
        </div>
        {pendingOrder && selectedRoute ? (
          <div style={styles.confirmPopover}>
            <div style={styles.confirmCard}>
              <strong>{getOrderNumber(pendingOrder)}</strong>
              <span>{getOrderAddress(pendingOrder)}</span>
              <Form method="post" style={styles.confirmActions} onSubmit={() => setPendingOrderId("")}>
                <input type="hidden" name="intent" value="assign-order" />
                <input type="hidden" name="orderId" value={pendingOrder.id} />
                <input type="hidden" name="routeId" value={selectedRoute.id} />
                <button type="submit" style={styles.confirmLink}>
                  Add order(s) to current route
                </button>
              </Form>
              <button type="button" style={styles.cancelLink} onClick={() => setPendingOrderId("")}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {routeDrawerOpen && selectedRoute ? (
          <aside style={styles.routeDrawer}>
            <button type="button" style={styles.drawerClose} onClick={() => setRouteDrawerOpen(false)}>
              ×
            </button>
            <h2 style={styles.drawerTitle}>Route Attributes</h2>
            <div style={styles.drawerTabs}>
              <span style={styles.drawerTabActive}>Info</span>
              <span style={styles.drawerTab}>History</span>
            </div>
            <dl style={styles.drawerDetails}>
              <dt>Code</dt>
              <dd>{selectedRoute.code}</dd>
              <dt>Truck</dt>
              <dd>{selectedRoute.truck || "Unassigned"}</dd>
              <dt>Driver</dt>
              <dd>{selectedRoute.driver || "Unassigned"}</dd>
              <dt>Helper</dt>
              <dd>{selectedRoute.helper || "None"}</dd>
              <dt>Region</dt>
              <dd>{selectedRoute.region || "No region"}</dd>
              <dt>Stops</dt>
              <dd>{selectedRoute.orders.length}</dd>
              <dt>Total route time</dt>
              <dd>{formatTime(selectedRoute.totalMinutes)}</dd>
            </dl>
            <Form method="post" style={styles.drawerForm}>
              <input type="hidden" name="routeId" value={selectedRoute.id} />
              <button name="intent" value="sequence-route" style={styles.drawerButton}>
                Optimize / resequence route
              </button>
            </Form>
          </aside>
        ) : null}
        {orderDrawerOpen && selectedOrder ? (
          <aside style={styles.routeDrawer}>
            <button type="button" style={styles.drawerClose} onClick={() => setOrderDrawerOpen(false)}>
              ×
            </button>
            <h2 style={styles.drawerTitle}>Order Attributes</h2>
            <div style={styles.drawerTabs}>
              <span style={styles.drawerTabActive}>Info</span>
              <span style={styles.drawerTab}>History</span>
            </div>
            <dl style={styles.drawerDetails}>
              <dt>Order</dt>
              <dd>{getOrderNumber(selectedOrder)}</dd>
              <dt>Customer</dt>
              <dd>{selectedOrder.customer || "No customer"}</dd>
              <dt>Contact</dt>
              <dd>{selectedOrder.contact || "No contact"}</dd>
              <dt>Address</dt>
              <dd>{getOrderAddress(selectedOrder) || "No address"}</dd>
              <dt>Load</dt>
              <dd>{selectedOrder.quantity || "-"} {selectedOrder.unit} {selectedOrder.material}</dd>
              <dt>Requested</dt>
              <dd>{selectedOrder.requestedWindow || "Needs scheduling"}</dd>
              <dt>Status</dt>
              <dd>{statusLabel(selectedOrder)}</dd>
              <dt>Route</dt>
              <dd>{routes.find((route) => route.id === selectedOrder.assignedRouteId)?.code || "Unassigned"}</dd>
              <dt>Travel</dt>
              <dd>{selectedOrder.travelSummary || formatTime(getTravelMinutes(selectedOrder))}</dd>
            </dl>
            {selectedOrder.notes ? (
              <div style={styles.drawerNotes}>
                <strong>Notes</strong>
                <p>{selectedOrder.notes}</p>
              </div>
            ) : null}
            <div style={styles.drawerButtonGrid}>
              <a href={`/dispatch?view=orders&order=${encodeURIComponent(selectedOrder.id)}`} style={styles.drawerLinkButton}>
                Open in editor
              </a>
              {selectedOrder.assignedRouteId ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="unassign-order" />
                  <input type="hidden" name="orderId" value={selectedOrder.id} />
                  <button style={styles.drawerButton}>Unassign</button>
                </Form>
              ) : null}
            </div>
          </aside>
        ) : null}
      </section>
    </main>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "48px 1fr",
    background: "#e8e8e8",
    color: "#232323",
    fontFamily: "Verdana, Geneva, Tahoma, sans-serif",
    fontSize: 12,
  },
  sideRail: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    background: "#4a4a4a",
    borderRight: "1px solid #343434",
    padding: "10px 0",
  },
  railLogo: {
    width: 26,
    height: 26,
    display: "grid",
    placeItems: "center",
    borderRadius: 3,
    background: "#ff7a1a",
    color: "#fff",
    fontWeight: 900,
  },
  railIcon: {
    width: 46,
    height: 38,
    display: "grid",
    placeItems: "center",
    color: "#fff",
    textDecoration: "none",
    borderLeft: "3px solid transparent",
  },
  railIconActive: {
    width: 46,
    height: 38,
    display: "grid",
    placeItems: "center",
    color: "#ff7a1a",
    textDecoration: "none",
    borderLeft: "3px solid #ff7a1a",
    background: "#f7f7f7",
  },
  workspace: {
    minWidth: 0,
    overflow: "hidden",
  },
  topBar: {
    minHeight: 58,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    background: "#fff",
    borderBottom: "1px solid #d6d6d6",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  },
  brandMark: {
    width: 32,
    height: 32,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    color: "#ff7a1a",
    border: "3px solid #ff7a1a",
    fontWeight: 900,
  },
  brandText: { fontSize: 18, whiteSpace: "nowrap" },
  search: {
    width: 380,
    maxWidth: "34vw",
    height: 34,
    borderRadius: 999,
    border: "1px solid #d8d8d8",
    padding: "0 16px",
    outline: "none",
  },
  topForm: { marginLeft: "auto" },
  company: { marginLeft: 12, fontWeight: 800, whiteSpace: "nowrap" },
  outlineButton: {
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 16px",
    borderRadius: 999,
    border: "1px solid #f97316",
    background: "#fff",
    color: "#e85d04",
    textDecoration: "none",
    fontWeight: 800,
    cursor: "pointer",
  },
  orangeButton: {
    minHeight: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 16px",
    borderRadius: 999,
    border: "1px solid #ff7a1a",
    background: "linear-gradient(180deg, #ff9b25, #ff6b00)",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 900,
    cursor: "pointer",
  },
  messageBanner: {
    padding: "8px 14px",
    background: "#e8f7ff",
    borderBottom: "1px solid #b6e4f8",
    color: "#0f6384",
    fontWeight: 700,
  },
  errorBanner: {
    padding: "8px 14px",
    background: "#fff0f0",
    borderBottom: "1px solid #f3b0b0",
    color: "#a42525",
    fontWeight: 700,
  },
  mainGrid: {
    height: "calc(100vh - 58px)",
    display: "grid",
    gridTemplateColumns: "50% 50%",
    gap: 0,
    overflow: "hidden",
  },
  leftStack: {
    minWidth: 0,
    display: "grid",
    gridTemplateRows: "25% 31% 44%",
    borderRight: "1px solid #cfcfcf",
    overflow: "hidden",
  },
  rightStack: {
    minWidth: 0,
    display: "grid",
    gridTemplateRows: "55% 27% 18%",
    overflow: "hidden",
  },
  panel: {
    minHeight: 0,
    overflow: "auto",
    background: "#fff",
    borderBottom: "1px solid #cfcfcf",
  },
  panelHeader: {
    height: 34,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 10px",
    borderBottom: "1px solid #d7d7d7",
    background: "#fbfbfb",
    color: "#333",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  colorBar: {
    display: "inline-block",
    width: 8,
    height: 32,
    borderRadius: 2,
  },
  statusPill: {
    display: "inline-flex",
    padding: "3px 8px",
    borderRadius: 999,
    background: "#e9dcf2",
    color: "#6b4f8a",
    fontSize: 11,
    fontWeight: 800,
  },
  rowRouteButton: (active: boolean) => ({
    border: "none",
    background: "transparent",
    color: active ? "#f97316" : "#0ea5c6",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: active ? "underline" : "none",
  }),
  rowOrderButton: {
    border: "none",
    background: "transparent",
    color: "#0ea5c6",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "underline",
  },
  dropZone: {
    height: 24,
    display: "grid",
    placeItems: "center",
    borderBottom: "1px dashed #aaa",
    background: "#fafafa",
    color: "#777",
    fontSize: 11,
  },
  dropZoneActive: {
    height: 24,
    display: "grid",
    placeItems: "center",
    borderBottom: "1px dashed #f97316",
    background: "#fff7ed",
    color: "#c2410c",
    fontSize: 11,
    fontWeight: 900,
  },
  draggableRow: {
    cursor: "grab",
  },
  inlineActions: { display: "flex", gap: 4 },
  iconButton: {
    width: 25,
    height: 25,
    border: "1px solid #ccc",
    borderRadius: 4,
    background: "#fff",
    cursor: "pointer",
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#0ea5c6",
    fontWeight: 800,
    cursor: "pointer",
  },
  emptyCell: {
    padding: 18,
    color: "#777",
    textAlign: "center",
  },
  mapCanvas: {
    position: "relative",
    minHeight: 0,
    overflow: "hidden",
    background: "#dceecf",
    borderBottom: "1px solid #cfcfcf",
  },
  routeSvg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  realMapCanvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  classicMapStatus: {
    position: "absolute",
    left: 12,
    top: 12,
    zIndex: 3,
    padding: "7px 10px",
    borderRadius: 4,
    background: "rgba(255, 255, 255, 0.94)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
    color: "#444",
    fontWeight: 800,
  },
  mapToolbar: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2,
    display: "flex",
    border: "1px solid #aaa",
    background: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
  },
  mapToggle: {
    border: "none",
    background: "#e8eefb",
    padding: "8px 14px",
    fontWeight: 800,
  },
  mapToggleMuted: {
    border: "none",
    background: "#fff",
    padding: "8px 14px",
  },
  mapLegend: {
    position: "absolute",
    left: 12,
    bottom: 10,
    zIndex: 2,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    maxWidth: "70%",
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 8px",
    borderRadius: 4,
    background: "rgba(255,255,255,0.9)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.16)",
    fontWeight: 700,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
  },
  assignForm: { display: "flex", gap: 4 },
  smallSelect: {
    width: 78,
    height: 26,
    border: "1px solid #ccc",
    borderRadius: 4,
  },
  assignMini: {
    height: 26,
    border: "none",
    borderRadius: 4,
    background: "#22c55e",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    padding: 8,
    overflow: "auto",
    background: "#f8f8f8",
  },
  compactForm: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(100px, 1fr))",
    gap: 6,
    alignItems: "center",
    padding: 8,
    border: "1px solid #d7d7d7",
    borderRadius: 6,
    background: "#fff",
  },
  input: {
    width: "100%",
    minHeight: 32,
    boxSizing: "border-box",
    border: "1px solid #cfcfcf",
    borderRadius: 4,
    padding: "0 8px",
    background: "#fff",
    color: "#222",
  },
  colorInput: {
    width: "100%",
    height: 32,
    border: "1px solid #cfcfcf",
    borderRadius: 4,
    background: "#fff",
  },
  confirmPopover: {
    position: "absolute",
    left: "17%",
    top: "48%",
    zIndex: 10,
    width: 320,
    borderRadius: 4,
    border: "1px solid #cfd8e3",
    background: "#fff",
    boxShadow: "0 12px 35px rgba(0,0,0,0.2)",
  },
  confirmCard: {
    display: "grid",
    gap: 8,
    padding: 12,
    color: "#333",
  },
  confirmActions: {
    display: "grid",
  },
  confirmLink: {
    border: "none",
    background: "transparent",
    color: "#0ea5c6",
    fontWeight: 900,
    cursor: "pointer",
    padding: 4,
  },
  cancelLink: {
    justifySelf: "center",
    border: "none",
    background: "transparent",
    color: "#777",
    cursor: "pointer",
    padding: 4,
  },
  routeDrawer: {
    position: "absolute",
    top: 58,
    right: 0,
    bottom: 0,
    zIndex: 9,
    width: 300,
    background: "#fff",
    borderLeft: "1px solid #d7d7d7",
    boxShadow: "-16px 0 35px rgba(0,0,0,0.18)",
    padding: 18,
    color: "#333",
  },
  drawerClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    border: "1px solid #ddd",
    borderRadius: "50%",
    background: "#fff",
    cursor: "pointer",
    fontSize: 18,
  },
  drawerTitle: {
    margin: "0 0 14px",
    fontSize: 18,
  },
  drawerTabs: {
    display: "flex",
    gap: 14,
    borderBottom: "1px solid #e5e7eb",
    marginBottom: 12,
  },
  drawerTabActive: {
    padding: "0 0 8px",
    color: "#f97316",
    borderBottom: "2px solid #f97316",
    fontWeight: 900,
  },
  drawerTab: {
    padding: "0 0 8px",
    color: "#777",
  },
  drawerDetails: {
    display: "grid",
    gridTemplateColumns: "100px 1fr",
    gap: "8px 10px",
    margin: 0,
  },
  drawerForm: {
    marginTop: 18,
  },
  drawerNotes: {
    marginTop: 18,
    padding: 10,
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    background: "#f9fafb",
  },
  drawerButtonGrid: {
    display: "grid",
    gap: 8,
    marginTop: 18,
  },
  drawerLinkButton: {
    minHeight: 36,
    display: "grid",
    placeItems: "center",
    borderRadius: 6,
    background: "#0ea5c6",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 900,
  },
  drawerButton: {
    width: "100%",
    minHeight: 36,
    border: "none",
    borderRadius: 6,
    background: "#22c55e",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  loginPage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f3f4f6",
    color: "#111827",
    fontFamily: "Verdana, Geneva, Tahoma, sans-serif",
  },
  loginBox: {
    width: 360,
    display: "grid",
    gap: 12,
    padding: 24,
    borderRadius: 10,
    background: "#fff",
    boxShadow: "0 18px 55px rgba(0,0,0,0.16)",
  },
  loginTitle: { margin: 0, fontSize: 24 },
  muted: { margin: 0, color: "#6b7280" },
};
