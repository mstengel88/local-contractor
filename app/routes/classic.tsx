import { type DragEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, useActionData, useLoaderData, useLocation, useSubmit } from "react-router";
import {
  action as dispatchAction,
  loader as dispatchLoader,
} from "./dispatch";
import type {
  DispatchEmployee,
  DispatchDriverLocation,
  DispatchOrder,
  DispatchRoute,
  DispatchTruck,
} from "../lib/dispatch.server";
import {
  classicColumnOptions,
  defaultClassicColumnSettings,
  type ClassicColumnSettings,
} from "../lib/classic-columns";

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

function getStatusTone(order: DispatchOrder) {
  if (order.status === "delivered" || order.deliveryStatus === "delivered") return "delivered";
  if (order.status === "hold") return "hold";
  if (order.assignedRouteId || order.status === "scheduled") return "scheduled";
  return "unscheduled";
}

async function playDispatchChime() {
  if (typeof window === "undefined") return;

  const AudioContextClass =
    window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) return;

  const audio = dispatchChimeAudio || new AudioContextClass();
  dispatchChimeAudio = audio;

  if (audio.state === "suspended") {
    await audio.resume();
  }

  const now = audio.currentTime;
  const masterGain = audio.createGain();
  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-24, now);
  compressor.knee.setValueAtTime(30, now);
  compressor.ratio.setValueAtTime(8, now);
  compressor.attack.setValueAtTime(0.003, now);
  compressor.release.setValueAtTime(0.25, now);
  compressor.connect(audio.destination);
  masterGain.connect(compressor);
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.72, now + 0.025);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);

  [784, 1046.5, 1318.5].forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const noteGain = audio.createGain();
    const start = now + index * 0.16;
    const end = start + 0.55;

    oscillator.type = index === 1 ? "triangle" : "square";
    oscillator.frequency.setValueAtTime(frequency, start);
    noteGain.gain.setValueAtTime(0.0001, start);
    noteGain.gain.exponentialRampToValueAtTime(0.4, start + 0.025);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(noteGain);
    noteGain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(end);
  });

  navigator.vibrate?.([80, 40, 80]);
}

function dateSearchValues(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const normalized = raw.replace(/\s+/g, " ");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ||
    normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (!match) return [normalized];

  const isIso = match[1].length === 4;
  const year = isIso ? match[1] : match[3];
  const month = isIso ? match[2] : match[1];
  const day = isIso ? match[3] : match[2];
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const date = new Date(Number(year), monthNumber - 1, dayNumber);
  const monthName = Number.isFinite(date.getTime())
    ? date.toLocaleString("en-US", { month: "long" })
    : "";
  const shortMonthName = Number.isFinite(date.getTime())
    ? date.toLocaleString("en-US", { month: "short" })
    : "";

  return [
    normalized,
    `${year}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`,
    `${monthNumber}/${dayNumber}/${year}`,
    `${String(monthNumber).padStart(2, "0")}/${String(dayNumber).padStart(2, "0")}/${year}`,
    `${monthName} ${dayNumber} ${year}`,
    `${shortMonthName} ${dayNumber} ${year}`,
  ].filter(Boolean);
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
    ...dateSearchValues(order.requestedWindow),
    order.eta,
    ...dateSearchValues(order.eta),
    order.arrivedAt,
    ...dateSearchValues(order.arrivedAt),
    order.departedAt,
    ...dateSearchValues(order.departedAt),
    order.deliveredAt,
    ...dateSearchValues(order.deliveredAt),
    order.timePreference,
    order.notes,
    order.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

type ClassicSortDirection = "asc" | "desc";
type ClassicSortTable = "routes" | "sites" | "orders" | "unscheduled";
type ClassicSortConfig = {
  key: string;
  direction: ClassicSortDirection;
};
type ClassicColumnWidths = Partial<Record<ClassicSortTable, Record<string, number>>>;
type ClassicPanelLayout = {
  mainLeft: number;
  leftRows: [number, number, number];
  rightRows: [number, number, number];
};

const CLASSIC_COLUMN_WIDTHS_KEY = "classicDispatchColumnWidths";
const CLASSIC_PANEL_LAYOUT_KEY = "classicDispatchPanelLayout";
const CLASSIC_SELECTED_ROUTE_KEY = "classicDispatchSelectedRouteId";
const DISPATCH_NAV_COLLAPSED_KEY = "dispatchNavCollapsed";
const DISPATCH_CHIME_ENABLED_KEY = "dispatchChimeEnabled";
const MIN_CLASSIC_COLUMN_WIDTH = 48;
const DEFAULT_CLASSIC_PANEL_LAYOUT: ClassicPanelLayout = {
  mainLeft: 50,
  leftRows: [25, 31, 44],
  rightRows: [55, 27, 18],
};
const defaultColumnWidths: Record<ClassicSortTable, Record<string, number>> = {
  routes: {
    code: 90,
    driver: 170,
    status: 90,
    weight: 80,
    start: 95,
    finish: 95,
    distance: 110,
  },
  sites: {
    stop: 60,
    orderNo: 95,
    customer: 160,
    product: 180,
    quantity: 80,
    unit: 80,
    address: 220,
    requested: 130,
    timePreference: 150,
    arrived: 95,
    departed: 95,
    eta: 110,
    miles: 70,
  },
  orders: {
    type: 55,
    orderNo: 95,
    date: 100,
    client: 160,
    address: 220,
    weight: 80,
    volume: 85,
    status: 105,
    material: 180,
    timePreference: 150,
    route: 100,
  },
  unscheduled: {
    orderNo: 95,
    date: 100,
    client: 160,
    address: 220,
    product: 180,
    weight: 80,
    volume: 85,
    timePreference: 150,
    notes: 220,
    route: 100,
  },
};

let dispatchChimeAudio: AudioContext | null = null;

function normalizeSortValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return value;

  const text = String(value).trim();
  const numeric = Number(text.replace(/[^0-9.-]/g, ""));
  if (text && !Number.isNaN(numeric) && /[0-9]/.test(text)) return numeric;

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime()) && /[0-9]/.test(text)) {
    return parsedDate.getTime();
  }

  return text.toLowerCase();
}

function normalizeRows(
  rows: readonly number[],
  fallback: ClassicPanelLayout["leftRows"],
): [number, number, number] {
  if (rows.length !== 3 || rows.some((row) => !Number.isFinite(row))) {
    return [...fallback] as [number, number, number];
  }

  const clamped = rows.map((row) => Math.max(12, row));
  const total = clamped.reduce((sum, row) => sum + row, 0) || 100;
  const normalized = clamped.map((row) => (row / total) * 100);
  return [normalized[0], normalized[1], normalized[2]];
}

function normalizePanelLayout(value: unknown): ClassicPanelLayout {
  const layout = value as Partial<ClassicPanelLayout> | null | undefined;
  const mainLeft =
    typeof layout?.mainLeft === "number" && Number.isFinite(layout.mainLeft)
      ? Math.min(68, Math.max(32, layout.mainLeft))
      : DEFAULT_CLASSIC_PANEL_LAYOUT.mainLeft;

  return {
    mainLeft,
    leftRows: normalizeRows(
      Array.isArray(layout?.leftRows) ? layout.leftRows : DEFAULT_CLASSIC_PANEL_LAYOUT.leftRows,
      DEFAULT_CLASSIC_PANEL_LAYOUT.leftRows,
    ),
    rightRows: normalizeRows(
      Array.isArray(layout?.rightRows) ? layout.rightRows : DEFAULT_CLASSIC_PANEL_LAYOUT.rightRows,
      DEFAULT_CLASSIC_PANEL_LAYOUT.rightRows,
    ),
  };
}

function compareSortValues(left: unknown, right: unknown, direction: ClassicSortDirection) {
  const leftValue = normalizeSortValue(left);
  const rightValue = normalizeSortValue(right);
  const modifier = direction === "asc" ? 1 : -1;

  if (leftValue === rightValue) return 0;
  if (leftValue === "") return 1;
  if (rightValue === "") return -1;
  return leftValue > rightValue ? modifier : -modifier;
}

function sortItems<T>(
  items: T[],
  sort: ClassicSortConfig,
  getValue: (item: T, key: string) => unknown,
) {
  return [...items].sort((left, right) =>
    compareSortValues(getValue(left, sort.key), getValue(right, sort.key), sort.direction),
  );
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
  driverLocations,
}: {
  googleMapsApiKey: string;
  originAddress: string;
  routes: Array<DispatchRoute & { orders: DispatchOrder[] }>;
  driverLocations: DispatchDriverLocation[];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapObjectsRef = useRef<any[]>([]);
  const driverMarkersRef = useRef<any[]>([]);
  const [status, setStatus] = useState("");
  const [useFallback, setUseFallback] = useState(false);
  const [hiddenRouteIds, setHiddenRouteIds] = useState<string[]>([]);
  const activeRoutes = useMemo(
    () => routes.filter((route) => route.orders.length),
    [routes],
  );
  const visibleRouteIds = useMemo(
    () => new Set(activeRoutes.map((route) => route.id).filter((id) => !hiddenRouteIds.includes(id))),
    [activeRoutes, hiddenRouteIds],
  );
  const routeColorById = useMemo(
    () =>
      new Map(
        routes.map((route) => [route.id, route.color || "#f97316"]),
      ),
    [routes],
  );
  const routePlan = useMemo(
    () =>
      routes
        .filter((route) => route.orders.length && visibleRouteIds.has(route.id))
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
    [routes, visibleRouteIds],
  );
  const routePlanKey = useMemo(
    () =>
      JSON.stringify(
        routePlan.map((route) => ({
          id: route.id,
          color: route.color,
          stops: route.stops.map((stop) => stop.address),
          hidden: hiddenRouteIds.includes(route.id),
        })),
      ),
    [routePlan, hiddenRouteIds],
  );

  function toggleRoute(routeId: string) {
    setHiddenRouteIds((current) =>
      current.includes(routeId)
        ? current.filter((id) => id !== routeId)
        : [...current, routeId],
    );
  }

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

        const map =
          mapInstanceRef.current ||
          new google.maps.Map(mapRef.current, {
            center: { lat: 43.1789, lng: -88.1173 },
            zoom: 9,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
          });
        mapInstanceRef.current = map;
        const bounds = new google.maps.LatLngBounds();
        const directionsService = new google.maps.DirectionsService();
        let yardMarkerAdded = false;

        for (const route of routePlan.slice(0, 6)) {
          for (const [stopIndex, stop] of route.stops.entries()) {
            await new Promise<void>((resolve) => {
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
            });
          }
        }

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
  }, [googleMapsApiKey, originAddress, routePlanKey]);

  useEffect(() => {
    let cancelled = false;

    async function drawDriverMarkers() {
      if (!googleMapsApiKey || !mapInstanceRef.current) return;

      try {
        await loadClassicGoogleMaps(googleMapsApiKey);
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
            title: `${location.truck || "Driver"} · ${location.driverName || "Driver"} · ${new Date(location.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
            icon: {
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 6,
              fillColor: routeColor,
              fillOpacity: 1,
              strokeColor: "#111827",
              strokeWeight: 2,
              rotation: Number.isFinite(Number(location.heading)) ? Number(location.heading) : 0,
            },
            label: {
              text: location.truck || "DRV",
              color: "#111827",
              fontWeight: "900",
              fontSize: "11px",
            },
          });
          driverMarkersRef.current.push(marker);
        }
      } catch (error) {
        console.warn("[CLASSIC DRIVER MARKER ERROR]", error);
      }
    }

    void drawDriverMarkers();

    return () => {
      cancelled = true;
      driverMarkersRef.current.forEach((marker) => marker.setMap?.(null));
      driverMarkersRef.current = [];
    };
  }, [driverLocations, googleMapsApiKey, routeColorById, visibleRouteIds]);

  if (useFallback) {
    return (
      <div style={styles.mapCanvas}>
        <ClassicMapFallback routes={routes.filter((route) => !hiddenRouteIds.includes(route.id))} />
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
          <button
            key={route.id}
            type="button"
            style={hiddenRouteIds.includes(route.id) ? styles.legendItemOff : styles.legendItem}
            onClick={() => toggleRoute(route.id)}
            title={`${hiddenRouteIds.includes(route.id) ? "Show" : "Hide"} ${route.code}`}
          >
            <span style={{ ...styles.legendDot, background: route.color }} />
            {route.code} {route.truck || "Unassigned"}
          </button>
        ))}
        {driverLocations.length ? (
          <span style={styles.driverLegendItem}>
            {driverLocations.slice(0, 4).map((location) => (
              <span
                key={`${location.id}-${location.routeId || "route"}`}
                style={{
                  ...styles.driverLegendDot,
                  borderBottomColor: routeColorById.get(location.routeId || "") || "#22c55e",
                }}
              />
            ))}
            {driverLocations.length} live driver{driverLocations.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function ClassicDispatchPage() {
  const loaderData = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const location = useLocation();
  const submit = useSubmit();
  const [query, setQuery] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(CLASSIC_SELECTED_ROUTE_KEY) || "";
  });
  const [draggedOrderId, setDraggedOrderId] = useState("");
  const [routeDrawerOpen, setRouteDrawerOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false);
  const [chimeStatus, setChimeStatus] = useState("");
  const [chimeEnabled, setChimeEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISPATCH_CHIME_ENABLED_KEY) === "1";
  });
  const lastChimeKey = useRef("");
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISPATCH_NAV_COLLAPSED_KEY) === "1";
  });
  const [tableSorts, setTableSorts] = useState<Record<ClassicSortTable, ClassicSortConfig>>({
    routes: { key: "weight", direction: "desc" },
    sites: { key: "stop", direction: "asc" },
    orders: { key: "date", direction: "asc" },
    unscheduled: { key: "date", direction: "asc" },
  });
  const [columnWidths, setColumnWidths] = useState<ClassicColumnWidths>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = window.localStorage.getItem(CLASSIC_COLUMN_WIDTHS_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [panelLayout, setPanelLayout] = useState<ClassicPanelLayout>(() => {
    if (typeof window === "undefined") return DEFAULT_CLASSIC_PANEL_LAYOUT;
    try {
      const stored = window.localStorage.getItem(CLASSIC_PANEL_LAYOUT_KEY);
      return normalizePanelLayout(stored ? JSON.parse(stored) : DEFAULT_CLASSIC_PANEL_LAYOUT);
    } catch {
      return DEFAULT_CLASSIC_PANEL_LAYOUT;
    }
  });

  const allowed = actionData?.allowed ?? loaderData.allowed;
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const baseRoutes = (actionData?.routes ?? loaderData.routes ?? []) as DispatchRoute[];
  const trucks = (actionData?.trucks ?? loaderData.trucks ?? []) as DispatchTruck[];
  const employees = (actionData?.employees ?? loaderData.employees ?? []) as DispatchEmployee[];
  const initialDriverLocations = (actionData?.driverLocations ??
    loaderData.driverLocations ??
    []) as DispatchDriverLocation[];
  const [driverLocations, setDriverLocations] = useState<DispatchDriverLocation[]>(
    initialDriverLocations,
  );
  const materialOptions = (actionData?.materialOptions ?? loaderData.materialOptions ?? []) as string[];
  const classicColumnSettings = (actionData?.classicColumnSettings ??
    loaderData.classicColumnSettings ??
    defaultClassicColumnSettings) as ClassicColumnSettings;
  const message = actionData?.message || loaderData?.mailboxStatus?.message || "";
  const mailboxStatus = actionData?.mailboxStatus || loaderData?.mailboxStatus || null;
  const googleMapsApiKey = actionData?.googleMapsApiKey ?? loaderData.googleMapsApiKey ?? "";
  const mapOriginAddress = actionData?.mapOriginAddress ?? loaderData.mapOriginAddress ?? "";
  const currentUser = actionData?.currentUser ?? loaderData.currentUser ?? null;
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const classicHref = isEmbeddedRoute ? "/app/classic" : "/classic";
  const monitorHref = isEmbeddedRoute ? "/app/monitor" : "/monitor";
  const calendarHref = isEmbeddedRoute ? "/app/calendar" : "/calendar";
  const allotmentHref = isEmbeddedRoute ? "/app/allotment" : "/allotment";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const quoteHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const mobileHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const editorHref = (orderId: string) =>
    `${dispatchHref}?view=orders&order=${encodeURIComponent(orderId)}&returnTo=${encodeURIComponent(classicHref)}`;
  const dispatchViewHref = (view: string) => `${dispatchHref}?view=${view}`;
  const canAccess = (permission: string) =>
    !currentUser || currentUser.permissions?.includes(permission);
  const logoutHref = currentUser ? "/login?logout=1" : `${dispatchHref}?logout=1`;
  const drivers = employees.filter((employee) => employee.role === "driver");
  const helpers = employees.filter((employee) => employee.role === "helper");
  const routeColumnKeys = classicColumnSettings.routes || defaultClassicColumnSettings.routes;
  const siteColumnKeys = classicColumnSettings.sites || defaultClassicColumnSettings.sites;
  const orderColumnKeys = classicColumnSettings.orders || defaultClassicColumnSettings.orders;
  const unscheduledColumnKeys =
    classicColumnSettings.unscheduled || defaultClassicColumnSettings.unscheduled;

  function toggleNavCollapsed() {
    setNavCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(DISPATCH_NAV_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // The nav still collapses even if browser storage is unavailable.
      }
      return next;
    });
  }

  async function testChime() {
    try {
      await playDispatchChime();
      setChimeEnabled(true);
      window.localStorage.setItem(DISPATCH_CHIME_ENABLED_KEY, "1");
      setChimeStatus("Chime armed");
      window.setTimeout(() => setChimeStatus(""), 2200);
    } catch {
      setChimeStatus("Click again or check browser sound");
      window.setTimeout(() => setChimeStatus(""), 3000);
    }
  }

  useEffect(() => {
    setDriverLocations(initialDriverLocations);
  }, [initialDriverLocations]);

  useEffect(() => {
    const imported = Number(mailboxStatus?.imported || 0);
    if (imported <= 0) return;

    const chimeKey = [
      mailboxStatus?.message || "",
      imported,
      mailboxStatus?.skipped || 0,
    ].join("|");

    if (!chimeKey || lastChimeKey.current === chimeKey) return;
    lastChimeKey.current = chimeKey;
    if (!chimeEnabled) {
      setChimeStatus("Press Test Chime once to enable alerts");
      window.setTimeout(() => setChimeStatus(""), 4200);
      return;
    }

    void playDispatchChime().catch(() => {
      // Some browsers require the Test Chime button before allowing sound.
    });
  }, [chimeEnabled, mailboxStatus]);

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
        // Keep the last known GPS markers if a refresh misses.
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
        return {
          ...route,
          orders: routeOrders,
          weight: routeOrders.length,
          totalMinutes: routeOrders.reduce((sum, order) => sum + getTravelMinutes(order), 0),
        };
      }),
    [baseRoutes, orders],
  );
  const sortedRoutes = useMemo(
    () =>
      sortItems(routes, tableSorts.routes, (route, key) => {
        if (key === "code") return route.code;
        if (key === "driver") return `${route.truck || ""} ${route.driver || ""}`;
        if (key === "status") return route.orders.length ? "Active" : "Open";
        if (key === "weight") return route.weight;
        if (key === "start") return route.shift?.split("-")[0]?.trim() || "6:00 am";
        if (key === "finish") return route.shift?.split("-")[1]?.trim() || formatTime(route.totalMinutes);
        if (key === "distance") return route.totalMinutes;
        return "";
      }),
    [routes, tableSorts.routes],
  );
  const selectedRoute =
    sortedRoutes.find((route) => route.id === selectedRouteId) || sortedRoutes[0] || null;
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;

  useEffect(() => {
    if (!sortedRoutes.length) return;
    if (selectedRouteId && sortedRoutes.some((route) => route.id === selectedRouteId)) return;

    setSelectedRouteId(sortedRoutes[0].id);
  }, [selectedRouteId, sortedRoutes]);

  useEffect(() => {
    if (!selectedRouteId) return;
    try {
      window.localStorage.setItem(CLASSIC_SELECTED_ROUTE_KEY, selectedRouteId);
    } catch {
      // Selecting routes still works if browser storage is unavailable.
    }
  }, [selectedRouteId]);

  const sortedSiteOrders = useMemo(
    () =>
      sortItems(selectedRoute?.orders || [], tableSorts.sites, (order, key) => {
        if (key === "stop") return order.stopSequence || 9999;
        if (key === "orderNo") return getOrderNumber(order);
        if (key === "address") return getOrderAddress(order);
        if (key === "customer") return order.customer;
        if (key === "product") return order.material;
        if (key === "quantity") return order.quantity || "";
        if (key === "unit") return order.unit || "";
        if (key === "requested") return order.requestedWindow || "";
        if (key === "timePreference") return order.timePreference || "";
        if (key === "arrived") return order.arrivedAt || "";
        if (key === "departed") return order.departedAt || "";
        if (key === "eta") return order.eta || order.requestedWindow || "";
        if (key === "miles") return order.travelMiles || "";
        return "";
      }),
    [selectedRoute, tableSorts.sites],
  );

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
  const sortedVisibleOrders = useMemo(
    () =>
      sortItems(visibleOrders, tableSorts.orders, (order, key) => {
        if (key === "orderNo") return getOrderNumber(order);
        if (key === "type") return order.source === "email" ? "D" : "M";
        if (key === "date") return order.requestedWindow || "";
        if (key === "client") return order.customer;
        if (key === "address") return getOrderAddress(order);
        if (key === "weight") return order.quantity || "";
        if (key === "volume") return order.unit;
        if (key === "status") return statusLabel(order);
        if (key === "material") return order.material;
        if (key === "timePreference") return order.timePreference || "";
        if (key === "route") return order.assignedRouteId || "";
        return "";
      }),
    [visibleOrders, tableSorts.orders],
  );
  const sortedUnscheduledOrders = useMemo(
    () =>
      sortItems(unscheduledOrders, tableSorts.unscheduled, (order, key) => {
        if (key === "orderNo") return getOrderNumber(order);
        if (key === "date") return order.requestedWindow || "";
        if (key === "client") return order.customer;
        if (key === "address") return getOrderAddress(order);
        if (key === "product") return order.material;
        if (key === "weight") return order.quantity || "";
        if (key === "volume") return order.unit;
        if (key === "timePreference") return order.timePreference || "";
        if (key === "notes") return order.notes || "";
        if (key === "route") return order.assignedRouteId || "";
        return "";
      }),
    [unscheduledOrders, tableSorts.unscheduled],
  );

  function updateTableSort(table: ClassicSortTable, key: string) {
    setTableSorts((current) => {
      const currentSort = current[table];
      return {
        ...current,
        [table]: {
          key,
          direction:
            currentSort.key === key && currentSort.direction === "asc" ? "desc" : "asc",
        },
      };
    });
  }

  function getColumnWidth(table: ClassicSortTable, key: string) {
    return columnWidths[table]?.[key] || defaultColumnWidths[table]?.[key] || 120;
  }

  function getTableMinWidth(
    table: ClassicSortTable,
    keys: string[],
    fixedWidth = 0,
  ) {
    return keys.reduce((sum, key) => sum + getColumnWidth(table, key), fixedWidth);
  }

  function persistColumnWidths(nextWidths: ClassicColumnWidths) {
    try {
      window.localStorage.setItem(CLASSIC_COLUMN_WIDTHS_KEY, JSON.stringify(nextWidths));
    } catch {
      // Keep resizing functional even if localStorage is unavailable.
    }
  }

  function resizeColumn(table: ClassicSortTable, key: string, nextWidth: number) {
    setColumnWidths((current) => {
      const next = {
        ...current,
        [table]: {
          ...(current[table] || {}),
          [key]: Math.max(MIN_CLASSIC_COLUMN_WIDTH, Math.round(nextWidth)),
        },
      };
      persistColumnWidths(next);
      return next;
    });
  }

  function savePanelLayout(nextLayout: ClassicPanelLayout) {
    const normalized = normalizePanelLayout(nextLayout);
    setPanelLayout(normalized);
    try {
      window.localStorage.setItem(CLASSIC_PANEL_LAYOUT_KEY, JSON.stringify(normalized));
    } catch {
      // Panel resizing still works for the current session if storage is blocked.
    }
  }

  function beginMainPanelResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startLeft = panelLayout.mainLeft;
    const container = event.currentTarget.parentElement;
    const containerWidth = container?.getBoundingClientRect().width || 1;

    function handleMouseMove(moveEvent: MouseEvent) {
      const deltaPercent = ((moveEvent.clientX - startX) / containerWidth) * 100;
      savePanelLayout({
        ...panelLayout,
        mainLeft: startLeft + deltaPercent,
      });
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function beginRowResize(
    stack: "leftRows" | "rightRows",
    dividerIndex: 0 | 1,
    event: ReactMouseEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    const startY = event.clientY;
    const startRows = [...panelLayout[stack]] as [number, number, number];
    const container = event.currentTarget.parentElement;
    const containerHeight = container?.getBoundingClientRect().height || 1;

    function handleMouseMove(moveEvent: MouseEvent) {
      const deltaPercent = ((moveEvent.clientY - startY) / containerHeight) * 100;
      const nextRows = [...startRows] as [number, number, number];
      nextRows[dividerIndex] = startRows[dividerIndex] + deltaPercent;
      nextRows[dividerIndex + 1] = startRows[dividerIndex + 1] - deltaPercent;
      savePanelLayout({
        ...panelLayout,
        [stack]: normalizeRows(nextRows, DEFAULT_CLASSIC_PANEL_LAYOUT[stack]),
      });
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function beginColumnResize(
    table: ClassicSortTable,
    key: string,
    event: ReactMouseEvent<HTMLSpanElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = getColumnWidth(table, key);

    function handleMouseMove(moveEvent: MouseEvent) {
      resizeColumn(table, key, startWidth + moveEvent.clientX - startX);
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function columnGroup(
    table: ClassicSortTable,
    keys: string[],
    leadingFixedColumns: number[] = [],
    trailingFixedColumns: number[] = [],
  ) {
    return (
      <colgroup>
        {leadingFixedColumns.map((width, index) => (
          <col key={`leading-${index}`} style={{ width }} />
        ))}
        {keys.map((key) => (
          <col key={key} style={{ width: getColumnWidth(table, key) }} />
        ))}
        {trailingFixedColumns.map((width, index) => (
          <col key={`trailing-${index}`} style={{ width }} />
        ))}
      </colgroup>
    );
  }

  function sortHeader(table: ClassicSortTable, key: string, label: string) {
    const active = tableSorts[table].key === key;
    const direction = tableSorts[table].direction === "asc" ? "↑" : "↓";
    return (
      <div style={styles.resizableHeader}>
        <button
          type="button"
          onClick={() => updateTableSort(table, key)}
          style={active ? styles.sortHeaderActive : styles.sortHeader}
          title={`Sort ${label}`}
        >
          {label} {active ? direction : ""}
        </button>
        <span
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize column"
          style={styles.columnResizeHandle}
          onMouseDown={(event) => beginColumnResize(table, key, event)}
        />
      </div>
    );
  }

  function columnLabel(table: ClassicSortTable, key: string) {
    return classicColumnOptions[table].find((option) => option.key === key)?.label || key;
  }

  function routeColumnValue(route: DispatchRoute & { orders: DispatchOrder[]; weight: number; totalMinutes: number }, key: string) {
    if (key === "code") {
      return (
        <button
          type="button"
          style={styles.rowRouteButton(selectedRoute?.id === route.id)}
          onClick={() => {
            setSelectedRouteId(route.id);
            setRouteDrawerOpen(false);
            setOrderDrawerOpen(false);
          }}
        >
          {route.code}
        </button>
      );
    }
    if (key === "driver") return `${route.truck || "No truck"} (${route.driver || "No driver"})`;
    if (key === "status") return route.orders.length ? "Active" : "Open";
    if (key === "weight") return route.orders.length || "-";
    if (key === "start") return route.shift?.split("-")[0]?.trim() || "6:00 am";
    if (key === "finish") return route.shift?.split("-")[1]?.trim() || formatTime(route.totalMinutes);
    if (key === "distance") return formatTime(route.totalMinutes);
    return "-";
  }

  function orderColumnValue(order: DispatchOrder, key: string, index = 0) {
    if (key === "type") return order.source === "email" ? "D" : "M";
    if (key === "stop") return order.stopSequence || index + 1;
    if (key === "orderNo") {
      return (
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
      );
    }
    if (key === "date" || key === "requested") return order.requestedWindow || "-";
    if (key === "client" || key === "customer") return order.customer || "-";
    if (key === "address") return getOrderAddress(order) || "-";
    if (key === "product" || key === "material") return order.material || "-";
    if (key === "quantity" || key === "weight") return order.quantity || "-";
    if (key === "unit" || key === "volume") return order.unit || "-";
    if (key === "timePreference") return order.timePreference || "-";
    if (key === "arrived") {
      return order.arrivedAt
        ? new Date(order.arrivedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "-";
    }
    if (key === "departed") {
      return order.departedAt
        ? new Date(order.departedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "-";
    }
    if (key === "eta") return order.eta || order.requestedWindow || "-";
    if (key === "miles") return order.travelMiles || "-";
    if (key === "status") {
      return <span style={styles.statusPill(getStatusTone(order))}>{statusLabel(order)}</span>;
    }
    if (key === "notes") return order.notes || "-";
    if (key === "route") return order.assignedRouteId || "Unassigned";
    return "-";
  }

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
    submit(
      {
        intent: "assign-order",
        orderId: draggedOrderId,
        routeId: selectedRoute.id,
      },
      { method: "post" },
    );
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
    <main
      className="classic-shell"
      style={{
        ...styles.page,
        gridTemplateColumns: navCollapsed ? "56px minmax(1420px, 1fr)" : "230px minmax(1420px, 1fr)",
      }}
    >
      <style>
        {`
          .classic-shell {
            color-scheme: dark;
            --classic-bg: #0f172a;
            --classic-text: #e5e7eb;
            --classic-rail-bg: #020617;
            --classic-rail-border: #1e293b;
            --classic-rail-link: #cbd5e1;
            --classic-rail-active-bg: #1e293b;
            --classic-panel-bg: #111827;
            --classic-panel-header-bg: #0b1220;
            --classic-border: #334155;
            --classic-soft-border: #263449;
            --classic-input-bg: #020617;
            --classic-muted: #94a3b8;
            --classic-table-head-bg: #0b1220;
            --classic-table-head-text: #cbd5e1;
            --classic-table-hover: #172033;
            --classic-drawer-bg: #0f172a;
            --classic-map-bg: #101827;
          }

          .classic-table th,
          .classic-table td {
            height: 28px;
            padding: 3px 8px;
            border-bottom: 1px solid var(--classic-soft-border);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-align: left;
          }

          .classic-table th {
            background: var(--classic-table-head-bg);
            color: var(--classic-table-head-text);
            font-size: 12px;
            font-weight: 700;
          }

          .classic-table tr:hover td {
            background: var(--classic-table-hover);
          }
        `}
      </style>
      <aside style={{ ...styles.sideRail, padding: navCollapsed ? "12px 8px" : "16px 14px" }}>
        <button
          type="button"
          onClick={toggleNavCollapsed}
          style={styles.navToggle}
          title={navCollapsed ? "Open navigation" : "Close navigation"}
        >
          {navCollapsed ? ">" : "<"}
        </button>
        <div style={styles.classicBrand}>
          <div style={styles.railLogo}>GH</div>
          <div style={navCollapsed ? styles.collapsedOnlyHidden : undefined}>
            <div style={styles.classicBrandTitle}>Contractor</div>
            <div style={styles.classicBrandSub}>Classic</div>
          </div>
        </div>
        <nav style={navCollapsed ? styles.collapsedOnlyHidden : styles.classicNav}>
          <Link to={classicHref} style={styles.classicNavLinkActive}>Classic</Link>
          <Link to={monitorHref} style={styles.classicNavLink}>Monitor</Link>
          <Link to={calendarHref} style={styles.classicNavLink}>Calendar</Link>
          <Link to={allotmentHref} style={styles.classicNavLink}>Allotment</Link>
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("orders")} style={styles.classicNavLink}>Orders</Link> : null}
          <Link to={dispatchViewHref("scheduled")} style={styles.classicNavLink}>Scheduled</Link>
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("routes")} style={styles.classicNavLink}>Routes</Link> : null}
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("trucks")} style={styles.classicNavLink}>Trucks</Link> : null}
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("employees")} style={styles.classicNavLink}>Employees</Link> : null}
          <Link to={dispatchViewHref("delivered")} style={styles.classicNavLink}>Delivered</Link>
        </nav>
        <div style={{ flex: 1 }} />
        <div style={navCollapsed ? styles.collapsedOnlyHidden : styles.classicFooterNav}>
          {canAccess("driver") ? <Link to={driverHref} style={styles.classicUtility}>Driver Route</Link> : null}
          {canAccess("quoteTool") ? <Link to={quoteHref} style={styles.classicUtility}>Quote Tool</Link> : null}
          <Link to={mobileHref} style={styles.classicUtility}>Mobile</Link>
          {canAccess("manageUsers") ? <Link to="/settings" style={styles.classicUtility}>Settings</Link> : null}
          {currentUser ? <Link to="/change-password" style={styles.classicUtility}>Change Password</Link> : null}
          <Link to={logoutHref} style={styles.classicUtility}>Log Out</Link>
        </div>
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
          <button type="button" style={styles.outlineButton} onClick={testChime}>
            Test Chime
          </button>
          {chimeStatus ? <span style={styles.chimeStatus}>{chimeStatus}</span> : null}
          <a href="#add-route" style={styles.outlineButton}>Add Route</a>
          <a href="#add-order" style={styles.orangeButton}>Add Order</a>
          <div style={styles.company}>Green Hills Dispatch</div>
        </header>

        {message ? (
          <div style={actionData?.ok === false ? styles.errorBanner : styles.messageBanner}>
            {message}
          </div>
        ) : null}

        <div
          style={{
            ...styles.mainGrid,
            gridTemplateColumns: `${panelLayout.mainLeft}fr 8px ${100 - panelLayout.mainLeft}fr`,
          }}
        >
          <section
            style={{
              ...styles.leftStack,
              gridTemplateRows: `${panelLayout.leftRows[0]}fr 8px ${panelLayout.leftRows[1]}fr 8px ${panelLayout.leftRows[2]}fr`,
            }}
          >
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <strong>Routes {routes.length}</strong>
                <span>Today</span>
              </div>
              <table
                className="classic-table"
                style={{
                  ...styles.table,
                  minWidth: getTableMinWidth("routes", routeColumnKeys, 104),
                }}
              >
                {columnGroup("routes", routeColumnKeys, [24], [80])}
                <thead>
                  <tr>
                    <th />
                    {routeColumnKeys.map((key) => (
                      <th key={key}>{sortHeader("routes", key, columnLabel("routes", key))}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedRoutes.map((route) => (
                    <tr key={route.id}>
                      <td><span style={{ ...styles.colorBar, background: route.color || "#f97316" }} /></td>
                      {routeColumnKeys.map((key) => (
                        <td key={key}>{routeColumnValue(route, key)}</td>
                      ))}
                      <td>
                        <Form method="post" style={styles.inlineActions}>
                          <input type="hidden" name="routeId" value={route.id} />
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
                    <tr><td colSpan={routeColumnKeys.length + 2} style={styles.emptyCell}>No routes have been set up yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div
              style={styles.rowResizeHandle}
              onMouseDown={(event) => beginRowResize("leftRows", 0, event)}
              title="Drag to resize Routes and Sites"
            />

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
              <table
                className="classic-table"
                style={{
                  ...styles.table,
                  minWidth: getTableMinWidth("sites", siteColumnKeys, 190),
                }}
              >
                {columnGroup("sites", siteColumnKeys, [], [190])}
                <thead>
                  <tr>
                    {siteColumnKeys.map((key) => (
                      <th key={key}>{sortHeader("sites", key, columnLabel("sites", key))}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedSiteOrders.slice(0, 9).map((order, index) => (
                    <tr key={order.id}>
                      {siteColumnKeys.map((key) => (
                        <td key={key}>{orderColumnValue(order, key, index)}</td>
                      ))}
                      <td>
                        <div style={styles.siteActions}>
                          <Form method="post" style={styles.reorderForm}>
                            <input type="hidden" name="intent" value="move-route-stop" />
                            <input type="hidden" name="routeId" value={selectedRoute?.id || ""} />
                            <input type="hidden" name="orderId" value={order.id} />
                            <button
                              name="direction"
                              value="up"
                              style={{
                                ...styles.reorderButton,
                                ...(index === 0 ? styles.reorderButtonDisabled : null),
                              }}
                              disabled={index === 0}
                            >
                              Up
                            </button>
                            <button
                              name="direction"
                              value="down"
                              style={{
                                ...styles.reorderButton,
                                ...(index === sortedSiteOrders.length - 1 ? styles.reorderButtonDisabled : null),
                              }}
                              disabled={index === sortedSiteOrders.length - 1}
                            >
                              Down
                            </button>
                          </Form>
                          <Form method="post">
                          <input type="hidden" name="intent" value="unassign-order" />
                          <input type="hidden" name="orderId" value={order.id} />
                          <button style={styles.linkButton}>Unassign</button>
                          </Form>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!selectedRoute?.orders.length ? (
                    <tr><td colSpan={siteColumnKeys.length + 1} style={styles.emptyCell}>Pick a route, then drag unscheduled orders here.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div
              style={styles.rowResizeHandle}
              onMouseDown={(event) => beginRowResize("leftRows", 1, event)}
              title="Drag to resize Sites and Orders"
            />

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <strong>Orders {visibleOrders.length}</strong>
                <span>{deliveredCount} delivered</span>
              </div>
              <table
                className="classic-table"
                style={{
                  ...styles.table,
                  minWidth: getTableMinWidth("orders", orderColumnKeys),
                }}
              >
                {columnGroup("orders", orderColumnKeys)}
                <thead>
                  <tr>
                    {orderColumnKeys.map((key) => (
                      <th key={key}>{sortHeader("orders", key, columnLabel("orders", key))}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedVisibleOrders.slice(0, 12).map((order) => (
                    <tr key={order.id}>
                      {orderColumnKeys.map((key) => (
                        <td key={key}>{orderColumnValue(order, key)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div
            style={styles.columnResizePanelHandle}
            onMouseDown={beginMainPanelResize}
            title="Drag to resize left and right work areas"
          />

          <section
            style={{
              ...styles.rightStack,
              gridTemplateRows: `${panelLayout.rightRows[0]}fr 8px ${panelLayout.rightRows[1]}fr 8px ${panelLayout.rightRows[2]}fr`,
            }}
          >
            <ClassicMap
              googleMapsApiKey={googleMapsApiKey}
              originAddress={mapOriginAddress}
              routes={routes}
              driverLocations={driverLocations}
            />

            <div
              style={styles.rowResizeHandle}
              onMouseDown={(event) => beginRowResize("rightRows", 0, event)}
              title="Drag to resize Map and Unscheduled"
            />

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <strong>Unscheduled {unscheduledOrders.length}</strong>
                <span>Routing</span>
              </div>
              <table
                className="classic-table"
                style={{
                  ...styles.table,
                  minWidth: getTableMinWidth("unscheduled", unscheduledColumnKeys, 160),
                }}
              >
                {columnGroup("unscheduled", unscheduledColumnKeys, [], [160])}
                <thead>
                  <tr>
                    {unscheduledColumnKeys.map((key) => (
                      <th key={key}>{sortHeader("unscheduled", key, columnLabel("unscheduled", key))}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedUnscheduledOrders.slice(0, 12).map((order) => (
                    <tr
                      key={order.id}
                      draggable
                      onDragStart={() => beginOrderDrag(order.id)}
                      onDragEnd={() => setDraggedOrderId("")}
                      style={styles.draggableRow}
                    >
                      {unscheduledColumnKeys.map((key) => (
                        <td key={key}>{orderColumnValue(order, key)}</td>
                      ))}
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
                    <tr><td colSpan={unscheduledColumnKeys.length + 1} style={styles.emptyCell}>No unscheduled orders match this search.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div
              style={styles.rowResizeHandle}
              onMouseDown={(event) => beginRowResize("rightRows", 1, event)}
              title="Drag to resize Unscheduled and Add forms"
            />

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
              <a href={editorHref(selectedOrder.id)} style={styles.drawerLinkButton}>
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
    background: "var(--classic-bg)",
    color: "var(--classic-text)",
    fontFamily: "Verdana, Geneva, Tahoma, sans-serif",
    fontSize: 12,
    overflowX: "auto",
    transition: "grid-template-columns 160ms ease",
  },
  sideRail: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "var(--classic-rail-bg)",
    borderRight: "1px solid var(--classic-rail-border)",
    overflow: "hidden",
    transition: "padding 160ms ease",
  },
  navToggle: {
    width: 34,
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    border: "1px solid var(--classic-rail-border)",
    background: "var(--classic-rail-active-bg)",
    color: "#ff7a1a",
    fontWeight: 900,
    cursor: "pointer",
  },
  collapsedOnlyHidden: {
    display: "none",
  },
  classicBrand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "var(--classic-rail-link)",
    paddingBottom: 10,
    borderBottom: "1px solid var(--classic-rail-border)",
  },
  classicBrandTitle: {
    fontWeight: 900,
    fontSize: 15,
  },
  classicBrandSub: {
    color: "var(--classic-muted)",
    fontSize: 11,
    fontWeight: 800,
  },
  railLogo: {
    width: 36,
    height: 36,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    background: "#ff7a1a",
    color: "#fff",
    fontWeight: 900,
  },
  classicNav: {
    display: "grid",
    gap: 6,
  },
  classicNavLink: {
    minHeight: 38,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    borderRadius: 8,
    color: "var(--classic-rail-link)",
    textDecoration: "none",
    fontWeight: 900,
  },
  classicNavLinkActive: {
    minHeight: 38,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    borderRadius: 8,
    color: "#ff7a1a",
    background: "var(--classic-rail-active-bg)",
    textDecoration: "none",
    fontWeight: 900,
  },
  classicFooterNav: {
    display: "grid",
    gap: 8,
  },
  classicUtility: {
    minHeight: 34,
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    borderRadius: 8,
    border: "1px solid var(--classic-rail-border)",
    color: "var(--classic-rail-link)",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 12,
  },
  workspace: {
    minWidth: 1420,
    overflow: "hidden",
  },
  topBar: {
    minHeight: 58,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    background: "var(--classic-panel-bg)",
    borderBottom: "1px solid var(--classic-border)",
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
    border: "1px solid var(--classic-border)",
    background: "var(--classic-input-bg)",
    color: "var(--classic-text)",
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
    background: "var(--classic-panel-bg)",
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
  chimeStatus: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  messageBanner: {
    padding: "8px 14px",
    background: "rgba(56, 189, 248, 0.16)",
    borderBottom: "1px solid rgba(56, 189, 248, 0.38)",
    color: "#e0f2fe",
    fontWeight: 700,
  },
  errorBanner: {
    padding: "8px 14px",
    background: "rgba(127, 29, 29, 0.35)",
    borderBottom: "1px solid rgba(248, 113, 113, 0.4)",
    color: "#fecaca",
    fontWeight: 700,
  },
  mainGrid: {
    height: "calc(100vh - 58px)",
    display: "grid",
    gap: 0,
    overflow: "hidden",
  },
  leftStack: {
    minWidth: 0,
    display: "grid",
    overflow: "hidden",
  },
  rightStack: {
    minWidth: 0,
    display: "grid",
    overflow: "hidden",
  },
  columnResizePanelHandle: {
    width: 8,
    height: "100%",
    cursor: "col-resize",
    background: "linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.25), transparent)",
    borderLeft: "1px solid var(--classic-border)",
    borderRight: "1px solid var(--classic-border)",
  },
  rowResizeHandle: {
    height: 8,
    cursor: "row-resize",
    background: "linear-gradient(180deg, transparent, rgba(56, 189, 248, 0.24), transparent)",
    borderTop: "1px solid var(--classic-border)",
    borderBottom: "1px solid var(--classic-border)",
  },
  panel: {
    minHeight: 0,
    overflow: "auto",
    background: "var(--classic-panel-bg)",
    borderBottom: "1px solid var(--classic-border)",
  },
  panelHeader: {
    height: 34,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 10px",
    borderBottom: "1px solid var(--classic-border)",
    background: "var(--classic-panel-header-bg)",
    color: "var(--classic-text)",
  },
  table: {
    width: "100%",
    minWidth: 620,
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  colorBar: {
    display: "inline-block",
    width: 8,
    height: 32,
    borderRadius: 2,
  },
  statusPill: (tone: string) => {
    const tones: Record<string, { background: string; border: string; color: string }> = {
      delivered: {
        background: "rgba(34, 197, 94, 0.18)",
        border: "rgba(34, 197, 94, 0.55)",
        color: "#86efac",
      },
      scheduled: {
        background: "rgba(14, 165, 233, 0.18)",
        border: "rgba(14, 165, 233, 0.55)",
        color: "#7dd3fc",
      },
      hold: {
        background: "rgba(245, 158, 11, 0.2)",
        border: "rgba(245, 158, 11, 0.58)",
        color: "#fcd34d",
      },
      unscheduled: {
        background: "rgba(249, 115, 22, 0.18)",
        border: "rgba(249, 115, 22, 0.55)",
        color: "#fdba74",
      },
    };
    const selected = tones[tone] || tones.unscheduled;
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 76,
      padding: "3px 8px",
      borderRadius: 999,
      border: `1px solid ${selected.border}`,
      background: selected.background,
      color: selected.color,
      fontSize: 11,
      fontWeight: 950,
      lineHeight: 1.2,
      textTransform: "uppercase" as const,
      letterSpacing: "0.035em",
    };
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
    borderBottom: "1px dashed var(--classic-border)",
    background: "var(--classic-panel-header-bg)",
    color: "var(--classic-muted)",
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
  siteActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
  },
  reorderForm: {
    display: "flex",
    gap: 4,
  },
  reorderButton: {
    minHeight: 24,
    border: "1px solid rgba(14, 165, 198, 0.5)",
    borderRadius: 4,
    background: "rgba(14, 165, 198, 0.1)",
    color: "#0ea5c6",
    fontSize: 10,
    fontWeight: 900,
    cursor: "pointer",
  },
  reorderButtonDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
  iconButton: {
    width: 25,
    height: 25,
    border: "1px solid var(--classic-border)",
    borderRadius: 4,
    background: "var(--classic-input-bg)",
    color: "var(--classic-text)",
    cursor: "pointer",
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#0ea5c6",
    fontWeight: 800,
    cursor: "pointer",
  },
  resizableHeader: {
    position: "relative",
    minHeight: 22,
    display: "flex",
    alignItems: "center",
    paddingRight: 8,
  },
  columnResizeHandle: {
    position: "absolute",
    top: -3,
    right: -7,
    width: 12,
    height: "calc(100% + 6px)",
    cursor: "col-resize",
    zIndex: 2,
  },
  sortHeader: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 800,
    padding: 0,
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  sortHeaderActive: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#f97316",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 900,
    padding: 0,
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  emptyCell: {
    padding: 18,
    color: "var(--classic-muted)",
    textAlign: "center",
  },
  mapCanvas: {
    position: "relative",
    minHeight: 0,
    overflow: "hidden",
    background: "var(--classic-map-bg)",
    borderBottom: "1px solid var(--classic-border)",
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
    background: "var(--classic-panel-bg)",
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
    background: "var(--classic-panel-bg)",
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
    border: "1px solid var(--classic-border)",
    background: "var(--classic-panel-bg)",
    color: "var(--classic-text)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.16)",
    fontWeight: 700,
    cursor: "pointer",
  },
  legendItemOff: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 8px",
    borderRadius: 4,
    border: "1px solid var(--classic-border)",
    background: "var(--classic-panel-bg)",
    color: "var(--classic-muted)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
    fontWeight: 700,
    opacity: 0.48,
    cursor: "pointer",
    textDecoration: "line-through",
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
  },
  driverLegendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 8px",
    borderRadius: 4,
    border: "1px solid rgba(34, 197, 94, 0.5)",
    background: "rgba(220, 252, 231, 0.96)",
    color: "#052e16",
    boxShadow: "0 1px 3px rgba(0,0,0,0.16)",
    fontWeight: 900,
  },
  driverLegendDot: {
    width: 0,
    height: 0,
    borderLeft: "6px solid transparent",
    borderRight: "6px solid transparent",
    borderBottom: "12px solid #22c55e",
  },
  assignForm: { display: "flex", gap: 4 },
  smallSelect: {
    width: 78,
    height: 26,
    border: "1px solid var(--classic-border)",
    background: "var(--classic-input-bg)",
    color: "var(--classic-text)",
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
    background: "var(--classic-panel-header-bg)",
  },
  compactForm: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(100px, 1fr))",
    gap: 6,
    alignItems: "center",
    padding: 8,
    border: "1px solid var(--classic-border)",
    borderRadius: 6,
    background: "var(--classic-panel-bg)",
  },
  input: {
    width: "100%",
    minHeight: 32,
    boxSizing: "border-box",
    border: "1px solid var(--classic-border)",
    borderRadius: 4,
    padding: "0 8px",
    background: "var(--classic-input-bg)",
    color: "var(--classic-text)",
  },
  colorInput: {
    width: "100%",
    height: 32,
    border: "1px solid var(--classic-border)",
    borderRadius: 4,
    background: "var(--classic-input-bg)",
  },
  routeDrawer: {
    position: "absolute",
    top: 58,
    right: 0,
    bottom: 0,
    zIndex: 9,
    width: 300,
    background: "var(--classic-drawer-bg)",
    borderLeft: "1px solid var(--classic-border)",
    boxShadow: "-16px 0 35px rgba(0,0,0,0.18)",
    padding: 18,
    color: "var(--classic-text)",
  },
  drawerClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    border: "1px solid var(--classic-border)",
    borderRadius: "50%",
    background: "var(--classic-panel-bg)",
    color: "var(--classic-text)",
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
    borderBottom: "1px solid var(--classic-border)",
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
    color: "var(--classic-muted)",
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
    border: "1px solid var(--classic-border)",
    borderRadius: 6,
    background: "var(--classic-panel-header-bg)",
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
