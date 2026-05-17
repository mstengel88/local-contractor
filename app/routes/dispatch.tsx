import { type DragEvent, type FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Form, useActionData, useFetcher, useLoaderData, useLocation } from "react-router";
import { data, redirect } from "react-router";
import {
  adminQuoteCookie,
  hasAdminQuotePermissionAccess,
} from "../lib/admin-quote-auth.server";
import { userAuthCookie } from "../lib/user-auth.server";
import { sendDeliveryConfirmationEmail } from "../lib/delivery-confirmation-email.server";
import { createLoaderNotification } from "../lib/loader-notifications.server";
import {
  fulfillDispatchOrderInShopify,
  markDispatchOrderDeliveredInShopify,
} from "../lib/dispatch-shopify-fulfillment.server";
import {
  createDispatchEmployee,
  createDispatchRoute,
  createDispatchTruck,
  createDispatchOrder,
  clearDispatchDriverLocations,
  deleteDispatchEmployee,
  deleteDispatchOrder,
  deleteDispatchRoute,
  deleteDispatchTruck,
  detectTimePreference,
  ensureSeedDispatchEmployees,
  ensureSeedDispatchOrders,
  ensureSeedDispatchRoutes,
  ensureSeedDispatchTrucks,
  getClassicColumnSettings,
  getDispatchEmployees,
  getLatestDispatchDriverLocations,
  getDispatchMaterialOptions,
  getDispatchOriginAddress,
  getDispatchProductDetailsForMaterials,
  getDispatchUnitForMaterial,
  getNextRouteStopSequence,
  getDispatchOrders,
  getDispatchRoutes,
  getDispatchTrucks,
  type DispatchEmployee,
  type DispatchOrder,
  type DispatchRoute,
  type DispatchTruck,
  parseDispatchEmail,
  resetDispatchRoutesForNewDay,
  seedDispatchEmployees,
  seedDispatchOrders,
  seedDispatchRoutes,
  seedDispatchTrucks,
  splitStreetAndCity,
  updateDispatchOrder,
  updateDispatchOrderDetails,
  updateDispatchEmployee,
  updateDispatchRoute,
  updateDispatchTruck,
} from "../lib/dispatch.server";
import {
  maybeAutoPollDispatchMailbox,
  pollDispatchMailbox,
} from "../lib/dispatch-mailbox.server";
import { importDispatchShopifyOrders } from "../lib/dispatch-shopify-orders.server";
import { attachAddressAutocomplete, loadGooglePlaces } from "../lib/google-places";
import { getCurrentUser, logAuditEvent } from "../lib/user-auth.server";

const DISPATCH_NAV_COLLAPSED_KEY = "dispatchNavCollapsed";
const DISPATCH_MANUAL_ROUTING_KEY = "dispatchManualRoutingMode";

function getDeliveryStatusLabel(status?: DispatchOrder["deliveryStatus"]) {
  if (status === "en_route") return "Enroute";
  if (status === "delivered") return "Delivered";
  return "Dispatched";
}

function getDeliveryStatusColor(status?: DispatchOrder["deliveryStatus"]) {
  if (status === "delivered") return "#22c55e";
  if (status === "en_route") return "#f97316";
  return "#38bdf8";
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

function suffixOrderNumber(orderNumber: string, index: number, total: number) {
  if (!orderNumber || total <= 1) return orderNumber;
  return `${orderNumber}${String.fromCharCode(97 + index)}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getRequestedDeliverySortValue(order: DispatchOrder) {
  const value = String(order.requestedWindow || "").trim();
  const lower = value.toLowerCase();
  const today = new Date();

  if (!value || /needs scheduling|unavailable|unknown/i.test(value)) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (/\btoday\b/.test(lower)) return startOfLocalDay(today);
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return startOfLocalDay(tomorrow);
  }

  const slashDate = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slashDate) {
    const year =
      slashDate[3].length === 2
        ? 2000 + Number(slashDate[3])
        : Number(slashDate[3]);
    return new Date(year, Number(slashDate[1]) - 1, Number(slashDate[2])).getTime();
  }

  const monthDate = value.match(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?/i,
  )?.[0];
  if (monthDate) {
    const parsed = new Date(
      /\d{4}/.test(monthDate) ? monthDate : `${monthDate}, ${today.getFullYear()}`,
    );
    if (!Number.isNaN(parsed.getTime())) return startOfLocalDay(parsed);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? Number.MAX_SAFE_INTEGER
    : startOfLocalDay(parsed);
}

function formatRequestedWindow(value: string) {
  const trimmed = value.trim();
  const dateInput = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!dateInput) return trimmed;

  return `${dateInput[2]}/${dateInput[3]}/${dateInput[1]}`;
}

function getTodayDateInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function getRequestedWindowDateInputValue(value?: string | null) {
  const trimmed = String(value || "").trim();
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return trimmed;

  const slashDate = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slashDate) {
    const year =
      slashDate[3].length === 2
        ? 2000 + Number(slashDate[3])
        : Number(slashDate[3]);
    return `${year}-${slashDate[1].padStart(2, "0")}-${slashDate[2].padStart(2, "0")}`;
  }

  const today = new Date();
  if (/\btoday\b/i.test(trimmed)) {
    return today.toISOString().slice(0, 10);
  }
  if (/\btomorrow\b/i.test(trimmed)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }

  return "";
}

function getOrderTravelMinutes(order: DispatchOrder) {
  const minutes = Number(order.travelMinutes || 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function formatTravelMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Not calculated";
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function buildDispatchOrderSearchText(
  order: DispatchOrder,
  routes: Array<DispatchRoute & { orders?: DispatchOrder[] }>,
) {
  const route = routes.find((entry) => entry.id === order.assignedRouteId);
  return [
    order.id,
    order.orderNumber,
    order.source,
    order.customer,
    order.contact,
    order.address,
    order.city,
    order.material,
    order.quantity,
    order.unit,
    order.requestedWindow,
    order.timePreference,
    order.truckPreference,
    order.notes,
    order.status,
    order.deliveryStatus,
    order.eta,
    order.travelMinutes,
    order.travelMiles,
    order.travelSummary,
    order.emailSubject,
    order.rawEmail,
    order.proofName,
    order.proofNotes,
    order.signatureName,
    order.inspectionStatus,
    route?.code,
    route?.truck,
    route?.driver,
    route?.helper,
    route?.region,
  ]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" ")
    .toLowerCase();
}

function buildRouteSearchText(
  route: DispatchRoute & { orders?: DispatchOrder[]; stops?: number; totalTravelMinutes?: number; loadSummary?: string },
  orders: DispatchOrder[],
) {
  const routeOrders = route.orders?.length
    ? route.orders
    : orders.filter((order) => order.assignedRouteId === route.id);

  return [
    route.id,
    route.code,
    route.truckId,
    route.truck,
    route.driverId,
    route.driver,
    route.helperId,
    route.helper,
    route.color,
    route.shift,
    route.region,
    route.stops,
    route.totalTravelMinutes,
    route.loadSummary,
    route.created_at,
    route.updated_at,
    ...routeOrders.map((order) => buildDispatchOrderSearchText(order, [route])),
  ]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" ")
    .toLowerCase();
}

function buildTruckSearchText(
  truck: DispatchTruck,
  routes: Array<DispatchRoute & { orders?: DispatchOrder[] }>,
  orders: DispatchOrder[],
) {
  const truckRoutes = routes.filter(
    (route) => route.truckId === truck.id || route.truck === truck.label,
  );

  return [
    truck.id,
    truck.label,
    truck.truckType,
    truck.tons,
    truck.yards,
    truck.capacity,
    truck.licensePlate,
    truck.created_at,
    truck.updated_at,
    ...truckRoutes.map((route) => buildRouteSearchText(route, orders)),
  ]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" ")
    .toLowerCase();
}

function buildEmployeeSearchText(
  employee: DispatchEmployee,
  routes: Array<DispatchRoute & { orders?: DispatchOrder[] }>,
  orders: DispatchOrder[],
) {
  const employeeRoutes = routes.filter(
    (route) =>
      route.driverId === employee.id ||
      route.helperId === employee.id ||
      route.driver === employee.name ||
      route.helper === employee.name,
  );

  return [
    employee.id,
    employee.name,
    employee.role,
    employee.phone,
    employee.email,
    employee.created_at,
    employee.updated_at,
    ...employeeRoutes.map((route) => buildRouteSearchText(route, orders)),
  ]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" ")
    .toLowerCase();
}

function getTruckCapacityForOrderUnit(truck: DispatchTruck, unit: string) {
  if (/tons?/i.test(unit)) return Number(truck.tons || 0);
  if (/yards?/i.test(unit)) return Number(truck.yards || 0);
  return 0;
}

function getTruckCapacityLabel(unit: string) {
  if (/tons?/i.test(unit)) return "tons";
  if (/yards?/i.test(unit)) return "yards";
  return "";
}

function getOrderCapacityUnit(order: DispatchOrder) {
  if (/tons?/i.test(order.unit)) return "tons";
  if (/yards?/i.test(order.unit)) return "yards";
  return "unitless";
}

function getCapacityError(order: DispatchOrder, truck?: DispatchTruck | null) {
  if (!truck) return "This route does not have a truck assigned yet.";

  const quantity = Number(order.quantity || 0);
  const capacity = getTruckCapacityForOrderUnit(truck, order.unit);
  const capacityLabel = getTruckCapacityLabel(order.unit);

  if (!quantity || !capacity || !capacityLabel) return "";
  if (quantity <= capacity) return "";

  return `${order.customer} needs ${quantity} ${capacityLabel}, but ${truck.label} is set to ${capacity} ${capacityLabel}.`;
}

function hasTruckCapacityForOrder(order: DispatchOrder, truck?: DispatchTruck | null, currentQty = 0) {
  if (!truck) return false;
  const quantity = Number(order.quantity || 0);
  const capacity = getTruckCapacityForOrderUnit(truck, order.unit);
  const capacityLabel = getTruckCapacityLabel(order.unit);
  if (!quantity || !capacityLabel) return true;
  if (!capacity) return false;
  return currentQty + quantity <= capacity;
}

function isYardOrder(order: DispatchOrder) {
  return /yards?/i.test(order.unit);
}

function getSplitCountFromForm(form: FormData) {
  const count = Number(String(form.get("splitCount") || "").trim());
  return Number.isFinite(count) ? Math.floor(count) : 0;
}

function getSplitSuffix(index: number) {
  let value = index;
  let suffix = "";
  do {
    suffix = String.fromCharCode(97 + (value % 26)) + suffix;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return suffix;
}

function getSplitBaseOrderNumber(order: DispatchOrder) {
  const base = String(order.orderNumber || order.id.replace(/^D-/, "")).trim();
  return base.replace(/[a-z]$/i, "");
}

function formatSplitQuantity(value: number) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");
}

function getSplitCapacityError(
  order: DispatchOrder,
  truck: DispatchTruck | null | undefined,
  splitCount: number,
) {
  if (!truck) return "This route does not have a truck assigned yet.";
  if (!isYardOrder(order)) return getCapacityError(order, truck);

  const quantity = Number(order.quantity || 0);
  const capacity = Number(truck.yards || 30);
  if (!quantity || !capacity || quantity <= capacity) return "";
  if (splitCount < 2) {
    return `${order.customer} needs ${quantity} yards, which is over ${truck.label}'s ${capacity} yard capacity. Split the order before assigning it.`;
  }

  const perLoad = quantity / splitCount;
  if (perLoad > capacity) {
    return `${splitCount} split tickets would still be ${formatSplitQuantity(perLoad)} yards each. Use at least ${Math.ceil(
      quantity / capacity,
    )} splits for ${truck.label}.`;
  }

  return "";
}

function attachLoaderNote(event: FormEvent<HTMLFormElement>) {
  const note = window.prompt("Add a loader note for this load. Leave blank if no note is needed.");
  if (note === null) {
    event.preventDefault();
    return;
  }

  let noteInput = event.currentTarget.querySelector<HTMLInputElement>('input[name="loaderNote"]');
  if (!noteInput) {
    noteInput = document.createElement("input");
    noteInput.type = "hidden";
    noteInput.name = "loaderNote";
    event.currentTarget.appendChild(noteInput);
  }
  noteInput.value = note.trim();
}

async function assignOrderToRoute({
  order,
  routeId,
  truck,
  splitCount,
  eta,
  route,
}: {
  order: DispatchOrder;
  routeId: string;
  truck?: DispatchTruck | null;
  splitCount: number;
  eta?: string | null;
  route?: DispatchRoute | null;
}) {
  const previousRouteId = order.assignedRouteId || null;
  const capacityError = getSplitCapacityError(order, truck, splitCount);
  if (capacityError) return { ok: false, message: capacityError, createdCount: 0 };

  const quantity = Number(order.quantity || 0);
  const truckYards = Number(truck?.yards || 30);
  const shouldSplit = isYardOrder(order) && quantity > truckYards && splitCount > 1;
  const firstStopSequence =
    previousRouteId === routeId && order.stopSequence
      ? order.stopSequence
      : await getNextRouteStopSequence(routeId);

  if (!shouldSplit) {
    const updatedOrder = await updateDispatchOrder(order.id, {
      status: "scheduled",
      assignedRouteId: routeId,
      stopSequence: firstStopSequence,
      deliveryStatus: "not_started",
      eta: eta || null,
    });
    await resequenceChangedRoutes([previousRouteId, routeId]);
    const shopifyResult = await fulfillDispatchOrderInShopify(updatedOrder, route);
    const shopifyNote = shopifyResult.skipped
      ? ""
      : shopifyResult.ok
        ? " Shopify marked fulfilled."
        : ` Shopify fulfillment failed: ${shopifyResult.message}`;
    return {
      ok: true,
      message: `Order assigned to route.${shopifyNote}`,
      createdCount: 1,
    };
  }

  const splitQuantity = formatSplitQuantity(quantity / splitCount);
  const baseOrderNumber = getSplitBaseOrderNumber(order);
  const splitNote = `Split from #${baseOrderNumber} into ${splitCount} loads.`;

  const updatedOriginal = await updateDispatchOrder(order.id, {
    orderNumber: `${baseOrderNumber}${getSplitSuffix(0)}`,
    quantity: splitQuantity,
    status: "scheduled",
    assignedRouteId: routeId,
    stopSequence: firstStopSequence,
    deliveryStatus: "not_started",
    eta: eta || null,
    notes: [order.notes, splitNote].filter(Boolean).join("\n"),
  });
  const shopifyResult = await fulfillDispatchOrderInShopify(
    { ...updatedOriginal, quantity: order.quantity },
    route,
  );
  const shopifyNote = shopifyResult.skipped
    ? ""
    : shopifyResult.ok
      ? " Shopify marked fulfilled."
      : ` Shopify fulfillment failed: ${shopifyResult.message}`;

  for (let index = 1; index < splitCount; index += 1) {
    const created = await createDispatchOrder({
      source: order.source,
      orderNumber: `${baseOrderNumber}${getSplitSuffix(index)}`,
      customer: order.customer,
      contact: order.contact,
      address: order.address,
      city: order.city,
      material: order.material,
      quantity: splitQuantity,
      unit: order.unit,
      requestedWindow: order.requestedWindow,
      timePreference: order.timePreference || "Anytime",
      truckPreference: order.truckPreference || "",
      notes: [order.notes, splitNote].filter(Boolean).join("\n"),
      emailSubject: order.emailSubject || undefined,
      rawEmail: order.rawEmail || undefined,
    });

    await updateDispatchOrder(created.id, {
      status: "scheduled",
      assignedRouteId: routeId,
      stopSequence: firstStopSequence + index,
      deliveryStatus: "not_started",
      eta: eta || null,
    });
  }

  await resequenceChangedRoutes([previousRouteId, routeId]);
  return {
    ok: true,
    message: `Split #${baseOrderNumber} into ${splitCount} route tickets.${shopifyNote}`,
    createdCount: splitCount,
  };
}

function getAutoRouteMaterialKey(order: DispatchOrder) {
  return String(order.material || "")
    .toLowerCase()
    .replace(/[#"'.,/()-]+/g, " ")
    .replace(/\b(?:washed|screened|green|hills|supply|mix|blend)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "material";
}

function getAutoRouteTimeRank(order: DispatchOrder) {
  const value = `${order.timePreference || ""} ${order.requestedWindow || ""} ${order.notes || ""}`.toLowerCase();
  if (value.includes("morning")) return 0;
  if (value.includes("afternoon")) return 1;
  if (value.includes("evening")) return 2;
  return 3;
}

function getAutoRouteCode(truck: DispatchTruck, index: number, existingCodes: Set<string>) {
  const truckDigits = String(truck.label || "").match(/\d+/)?.[0] || String(index + 1).padStart(2, "0");
  const baseCode = `R-${truckDigits}`;
  let code = baseCode;
  let suffix = 2;
  while (existingCodes.has(code)) {
    code = `${baseCode}-${suffix}`;
    suffix += 1;
  }
  existingCodes.add(code);
  return code;
}

function routeCanTakeOrder(
  order: DispatchOrder,
  bucket: {
    truck: DispatchTruck;
    usedByUnit: Record<string, number>;
  },
) {
  const unit = getOrderCapacityUnit(order);
  return hasTruckCapacityForOrder(order, bucket.truck, bucket.usedByUnit[unit] || 0);
}

async function autoRouteOrdersForDispatch() {
  const [allOrders, existingRoutes, trucks, employees] = await Promise.all([
    getDispatchOrders(),
    getDispatchRoutes(),
    getDispatchTrucks(),
    getDispatchEmployees(),
  ]);
  const activeTrucks = trucks.filter((truck) => truck.isActive !== false);
  const drivers = employees.filter((employee) => employee.role === "driver" && employee.isActive !== false);
  const existingCodes = new Set(existingRoutes.map((route) => route.code).filter(Boolean));
  const routeBuckets: Array<{
    route: DispatchRoute;
    truck: DispatchTruck;
    usedByUnit: Record<string, number>;
    materialKeys: Set<string>;
    orderIds: string[];
    maxSequence: number;
  }> = existingRoutes
    .map((route) => {
      const truck =
        activeTrucks.find((entry) => entry.id === route.truckId) ||
        activeTrucks.find((entry) => entry.label === route.truck) ||
        null;
      if (!truck) return null;
      return {
        route,
        truck,
        usedByUnit: {} as Record<string, number>,
        materialKeys: new Set<string>(),
        orderIds: [] as string[],
        maxSequence: 0,
      };
    })
    .filter((bucket): bucket is NonNullable<typeof bucket> => Boolean(bucket));

  for (const order of allOrders) {
    if (
      !order.assignedRouteId ||
      order.status === "delivered" ||
      order.status === "cancelled" ||
      order.deliveryStatus === "delivered"
    ) {
      continue;
    }

    const bucket = routeBuckets.find((entry) => entry.route.id === order.assignedRouteId);
    if (!bucket) continue;

    const unit = getOrderCapacityUnit(order);
    const quantity = Number(order.quantity || 0);
    bucket.orderIds.push(order.id);
    bucket.materialKeys.add(getAutoRouteMaterialKey(order));
    bucket.maxSequence = Math.max(bucket.maxSequence, Number(order.stopSequence || 0));
    bucket.usedByUnit[unit] =
      (bucket.usedByUnit[unit] || 0) + (Number.isFinite(quantity) ? quantity : 0);
  }

  const routedTruckIds = new Set(routeBuckets.map((bucket) => bucket.truck.id));
  const unusedTrucks = activeTrucks.filter((truck) => !routedTruckIds.has(truck.id));
  const usedDriverIds = new Set(existingRoutes.map((route) => route.driverId).filter(Boolean));
  const unusedDrivers = drivers.filter((driver) => !usedDriverIds.has(driver.id));

  const planningOrders = allOrders
    .filter(
      (order) =>
        order.status !== "delivered" &&
        order.status !== "cancelled" &&
        order.deliveryStatus !== "delivered" &&
        !order.assignedRouteId,
    )
    .sort((a, b) => {
      const dateDiff = getRequestedDeliverySortValue(a) - getRequestedDeliverySortValue(b);
      if (dateDiff !== 0) return dateDiff;
      const timeDiff = getAutoRouteTimeRank(a) - getAutoRouteTimeRank(b);
      if (timeDiff !== 0) return timeDiff;
      const materialDiff = getAutoRouteMaterialKey(a).localeCompare(getAutoRouteMaterialKey(b));
      if (materialDiff !== 0) return materialDiff;
      return getOrderTravelMinutes(a) - getOrderTravelMinutes(b);
    });

  let createdRoutes = 0;
  let assignedOrders = 0;
  const skipped: string[] = [];

  for (const order of planningOrders) {
    const materialKey = getAutoRouteMaterialKey(order);
    const quantity = Number(order.quantity || 0);
    const unit = getOrderCapacityUnit(order);
    const compatibleBuckets = routeBuckets.filter((bucket) => routeCanTakeOrder(order, bucket));
    let bucket =
      compatibleBuckets.find((entry) => entry.materialKeys.has(materialKey)) ||
      compatibleBuckets.find((entry) => entry.orderIds.length === 0) ||
      compatibleBuckets[0] ||
      null;

    if (!bucket && unusedTrucks.length) {
      const truck = unusedTrucks.shift()!;
      const driver = unusedDrivers.shift() || drivers[routeBuckets.length % Math.max(drivers.length, 1)] || null;
      const created = await createDispatchRoute({
        code: getAutoRouteCode(truck, routeBuckets.length, existingCodes),
        truckId: truck.id,
        truck: truck.label,
        driverId: driver?.id || "",
        driver: driver?.name || "",
        helperId: "",
        helper: "",
        color: ["#f97316", "#22c55e", "#38bdf8", "#a3e635", "#eab308", "#fb7185"][routeBuckets.length % 6],
        shift: "Auto routed",
        region: "Auto",
      });
      bucket = {
        route: created,
        truck,
        usedByUnit: {},
        materialKeys: new Set<string>(),
        orderIds: [],
        maxSequence: 0,
      };
      routeBuckets.push(bucket);
      createdRoutes += 1;
    }

    if (!bucket || !routeCanTakeOrder(order, bucket)) {
      skipped.push(`${getOrderDisplayNumber(order)} ${order.customer}: no available truck capacity`);
      continue;
    }

    const nextSequence = bucket.maxSequence + 1;
    await updateDispatchOrder(order.id, {
      assignedRouteId: bucket.route.id,
      stopSequence: nextSequence,
      status: "scheduled",
      deliveryStatus: order.deliveryStatus || "not_started",
    });
    bucket.orderIds.push(order.id);
    bucket.maxSequence = nextSequence;
    bucket.materialKeys.add(materialKey);
    bucket.usedByUnit[unit] = (bucket.usedByUnit[unit] || 0) + (Number.isFinite(quantity) ? quantity : 0);
    assignedOrders += 1;
  }

  return {
    assignedOrders,
    createdRoutes,
    skipped,
  };
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

function metricCard(label: string, value: string, accent: string) {
  return (
    <div
      style={{
        borderRadius: 6,
        padding: "14px 16px",
        background: "#0f172a",
        border: `1px solid ${accent}33`,
        boxShadow: `inset 4px 0 0 ${accent}, 0 1px 2px rgba(0,0,0,0.08)`,
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

let googleMapsLoaderPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (googleMapsLoaderPromise) return googleMapsLoaderPromise;

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-dispatch-google-maps="true"]',
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.dataset.dispatchGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

function RouteMapPreview({
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
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);

  const getTravelLabel = (order: DispatchOrder) => {
    if (order.travelMinutes) return `${order.travelMinutes} min RT`;
    return order.travelSummary || "RT not calculated";
  };

  const routePlan = useMemo(
    () =>
      routes
        .map((route) => ({
          id: route.id,
          color: route.color || "#38bdf8",
          label: `${route.code} · ${route.truck}`,
          stops: route.orders
            .map((order) => ({
              address: [order.address, order.city]
                .map((part) => String(part || "").trim())
                .filter(Boolean)
                .join(", "),
              customer: order.customer,
              travelLabel: getTravelLabel(order),
            }))
            .filter((stop) => stop.address),
        }))
        .filter((route) => route.stops.length > 0),
    [routes],
  );

  useEffect(() => {
    let cancelled = false;

    async function drawMap() {
      if (!mapRef.current) return;
      if (!googleMapsApiKey) {
        setStatus("Add GOOGLE_MAPS_BROWSER_API_KEY to show the live route map.");
        return;
      }
      if (!originAddress) {
        setStatus("Set an active origin address before drawing routes.");
        return;
      }
      if (routePlan.length === 0) {
        setStatus("Assign orders to routes to preview truck paths.");
        return;
      }

      setStatus("Loading route map...");
      setRouteWarnings([]);

      try {
        await loadGoogleMaps(googleMapsApiKey);
        if (cancelled || !mapRef.current) return;

        const google = (window as any).google;
        mapObjectsRef.current.forEach((object) => object.setMap(null));
        mapObjectsRef.current = [];

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 43.1789, lng: -88.1173 },
          zoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        const bounds = new google.maps.LatLngBounds();
        const directionsService = new google.maps.DirectionsService();
        const geocoder = new google.maps.Geocoder();
        const warnings: string[] = [];

        const addTimeBadge = (position: any, text: string, color: string) => {
          const badge = document.createElement("div");
          badge.textContent = text;
          badge.style.position = "absolute";
          badge.style.transform = "translate(12px, -34px)";
          badge.style.padding = "5px 8px";
          badge.style.borderRadius = "999px";
          badge.style.background = "rgba(15, 23, 42, 0.92)";
          badge.style.border = `1px solid ${color}99`;
          badge.style.boxShadow = "0 8px 18px rgba(2, 6, 23, 0.28)";
          badge.style.color = "#f8fafc";
          badge.style.fontSize = "11px";
          badge.style.fontWeight = "800";
          badge.style.whiteSpace = "nowrap";

          const overlay = new google.maps.OverlayView();
          overlay.onAdd = () => {
            overlay.getPanes()?.overlayMouseTarget.appendChild(badge);
          };
          overlay.draw = () => {
            const point = overlay.getProjection()?.fromLatLngToDivPixel(position);
            if (!point) return;
            badge.style.left = `${point.x}px`;
            badge.style.top = `${point.y}px`;
          };
          overlay.onRemove = () => {
            badge.remove();
          };
          overlay.setMap(map);
          mapObjectsRef.current.push(overlay);
        };

        const addStopMarker = (
          position: any,
          route: (typeof routePlan)[number],
          stop: (typeof routePlan)[number]["stops"][number],
          stopIndex: number,
        ) => {
          const marker = new google.maps.Marker({
            map,
            position,
            label: String(stopIndex + 1),
            title: `${stop.customer} · ${stop.travelLabel}`,
          });
          mapObjectsRef.current.push(marker);
          addTimeBadge(position, stop.travelLabel, route.color);
          bounds.extend(position);
        };

        const geocodeAddress = (address: string) =>
          new Promise<any | null>((resolve) => {
            geocoder.geocode({ address }, (results: any[], geocodeStatus: string) => {
              if (geocodeStatus === "OK" && results?.[0]?.geometry?.location) {
                resolve(results[0].geometry.location);
                return;
              }
              console.warn("[DISPATCH MAP GEOCODE ERROR]", address, geocodeStatus);
              resolve(null);
            });
          });

        const drawFallbackRoute = async (route: (typeof routePlan)[number]) => {
          const points = (
            await Promise.all(
              [originAddress, ...route.stops.map((stop) => stop.address), originAddress].map((address) =>
                geocodeAddress(address),
              ),
            )
          ).filter(Boolean);

          if (points.length < 2) return false;

          const polyline = new google.maps.Polyline({
            map,
            path: points,
            strokeColor: route.color,
            strokeOpacity: 0.82,
            strokeWeight: 5,
          });
          mapObjectsRef.current.push(polyline);

          points.forEach((point: any, index: number) => {
            const isYard = index === 0 || index === points.length - 1;
            const marker = new google.maps.Marker({
              map,
              position: point,
              label: isYard ? "Y" : String(index),
              title: isYard ? "Yard" : `${route.stops[index - 1].customer} · ${route.stops[index - 1].travelLabel}`,
            });
            mapObjectsRef.current.push(marker);
            if (!isYard) {
              addTimeBadge(point, route.stops[index - 1].travelLabel, route.color);
            }
            bounds.extend(point);
          });

          return true;
        };

        await Promise.all(
          routePlan.map(
            (route) =>
              new Promise<void>((resolve) => {
                const renderer = new google.maps.DirectionsRenderer({
                  map,
                  preserveViewport: true,
                  suppressMarkers: true,
                  polylineOptions: {
                    strokeColor: route.color,
                    strokeOpacity: 0.9,
                    strokeWeight: 6,
                  },
                });
                mapObjectsRef.current.push(renderer);

                directionsService.route(
                  {
                    origin: originAddress,
                    destination: originAddress,
                    waypoints: route.stops.map((stop) => ({
                      location: stop.address,
                      stopover: true,
                    })),
                    optimizeWaypoints: false,
                    travelMode: google.maps.TravelMode.DRIVING,
                  },
                  async (result: any, routeStatus: string) => {
                    if (result && routeStatus === "OK") {
                      renderer.setDirections(result);
                      result.routes?.[0]?.legs?.forEach((leg: any) => {
                        if (leg.start_location) bounds.extend(leg.start_location);
                        if (leg.end_location) bounds.extend(leg.end_location);
                      });
                      const firstLeg = result.routes?.[0]?.legs?.[0];
                      if (firstLeg?.start_location) {
                        const yardMarker = new google.maps.Marker({
                          map,
                          position: firstLeg.start_location,
                          label: "Y",
                          title: "Yard",
                        });
                        mapObjectsRef.current.push(yardMarker);
                      }
                      route.stops.forEach((stop, stopIndex) => {
                        const leg = result.routes?.[0]?.legs?.[stopIndex];
                        if (leg?.end_location) {
                          addStopMarker(leg.end_location, route, stop, stopIndex);
                        }
                      });
                    } else {
                      console.warn("[DISPATCH MAP ROUTE ERROR]", route.label, routeStatus);
                      renderer.setMap(null);
                      const drewFallback = await drawFallbackRoute(route);
                      warnings.push(
                        drewFallback
                          ? `${route.label}: showing fallback stop-to-stop lines because Google Directions returned ${routeStatus}.`
                          : `${route.label}: Google Directions returned ${routeStatus}, and the stop addresses could not be geocoded.`,
                      );
                    }
                    resolve();
                  },
                );
              }),
          ),
        );

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds);
        }
        setStatus("");
        setRouteWarnings(warnings);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to load route map.");
      }
    }

    drawMap();

    return () => {
      cancelled = true;
      mapObjectsRef.current.forEach((object) => object.setMap(null));
      mapObjectsRef.current = [];
    };
  }, [googleMapsApiKey, originAddress, routePlan]);

  return (
    <div style={styles.mapStage}>
      <div ref={mapRef} style={styles.googleMapCanvas} />
      {status ? <div style={styles.mapStatus}>{status}</div> : null}
      {routeWarnings.length ? (
        <div style={styles.mapNotice}>
          {routeWarnings.slice(0, 2).map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
      {routePlan.length ? (
        <div style={styles.mapLegend}>
          {routePlan.map((route) => (
            <div key={route.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={styles.routeColor(route.color)} />
              <span>{route.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getDispatchPath(url: URL) {
  return url.pathname.startsWith("/app/") ? "/app/dispatch" : "/dispatch";
}

function getBrowserGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_BROWSER_API_KEY || "";
}

let dispatchStateCache:
  | {
      loadedAt: number;
      state: any;
    }
  | null = null;

const DISPATCH_STATE_CACHE_MS = 5000;

function clearDispatchStateCache() {
  dispatchStateCache = null;
}

async function loadDispatchState(
  options: { skipSetup?: boolean; useCache?: boolean; fast?: boolean; lightweightOrders?: boolean } = {},
) {
  if (
    options.useCache &&
    dispatchStateCache &&
    Date.now() - dispatchStateCache.loadedAt < DISPATCH_STATE_CACHE_MS
  ) {
    return dispatchStateCache.state;
  }

  try {
    if (!options.skipSetup) {
      await Promise.all([
        ensureSeedDispatchTrucks(),
        ensureSeedDispatchEmployees(),
        ensureSeedDispatchOrders(),
        ensureSeedDispatchRoutes(),
      ]);
      if (process.env.DISPATCH_AUTO_DAILY_RESET === "true") {
        await resetDispatchRoutesForNewDay();
      }
    }
    const [orders, routes, trucks, employees] = await Promise.all([
      getDispatchOrders({ lightweight: options.lightweightOrders || options.fast }),
      getDispatchRoutes(),
      getDispatchTrucks(),
      getDispatchEmployees(),
    ]);

    if (options.fast) {
      return {
        skipLoaderRevalidation: true,
        orders,
        routes,
        trucks,
        employees,
        storageReady: true,
        storageError: null,
      };
    }

    const [
      materialOptions,
      mapOriginAddress,
      classicColumnSettings,
      driverLocations,
      productDetailsByMaterial,
    ] = await Promise.all([
      getDispatchMaterialOptions(),
      getDispatchOriginAddress(),
      getClassicColumnSettings(),
      getLatestDispatchDriverLocations(),
      getDispatchProductDetailsForMaterials(orders.map((order) => order.material)),
    ]);

    const state = {
      orders,
      routes,
      trucks,
      employees,
      materialOptions,
      mapOriginAddress,
      classicColumnSettings,
      driverLocations,
      productDetailsByMaterial,
      storageReady: true,
      storageError: null,
    };

    if (options.useCache) {
      dispatchStateCache = {
        loadedAt: Date.now(),
        state,
      };
    }

    return state;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load dispatch storage";
    console.error("[DISPATCH STORAGE ERROR]", message);
    const fallbackState = {
      orders: seedDispatchOrders,
      routes: seedDispatchRoutes,
      trucks: seedDispatchTrucks,
      employees: seedDispatchEmployees,
      materialOptions: [],
      mapOriginAddress: "W185 N7487 Narrow Ln, Menomonee Falls, WI 53051",
      classicColumnSettings: undefined,
      driverLocations: [],
      productDetailsByMaterial: {},
      storageReady: false,
      storageError: message,
    };

    if (options.useCache) {
      dispatchStateCache = {
        loadedAt: Date.now(),
        state: fallbackState,
      };
    }

    return fallbackState;
  }
}

async function resequenceRouteStops(routeId?: string | null) {
  if (!routeId) return;

  const routeOrders = (await getDispatchOrders())
    .filter(
      (order) =>
        order.assignedRouteId === routeId &&
        order.status !== "delivered" &&
        order.status !== "cancelled" &&
        order.deliveryStatus !== "delivered",
    )
    .sort(
      (a, b) =>
        Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999) ||
        String(a.created_at || "").localeCompare(String(b.created_at || "")),
    );

  await Promise.all(
    routeOrders.map((order, index) =>
      Number(order.stopSequence || 0) === index + 1
        ? Promise.resolve(order)
        : updateDispatchOrder(order.id, { stopSequence: index + 1 }),
    ),
  );
}

async function resequenceChangedRoutes(routeIds: Array<string | null | undefined>) {
  const uniqueRouteIds = Array.from(
    new Set(routeIds.filter((routeId): routeId is string => Boolean(routeId))),
  );
  await Promise.all(uniqueRouteIds.map((routeId) => resequenceRouteStops(routeId)));
}

export async function loader({ request }: any) {
  const url = new URL(request.url);
  const dispatchPath = getDispatchPath(url);

  if (url.searchParams.get("logout") === "1") {
    return redirect(dispatchPath, {
      headers: [
        ["Set-Cookie", await userAuthCookie.serialize("", { maxAge: 0 })],
        ["Set-Cookie", await adminQuoteCookie.serialize("", { maxAge: 0 })],
      ],
    });
  }

  const allowed = await hasAdminQuotePermissionAccess(request, "dispatch");
  if (!allowed) {
    return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const currentUser = await getCurrentUser(request);
  const requestedView = url.searchParams.get("view") || "dashboard";
  const manageOnlyViews = new Set(["orders", "routes", "trucks", "employees"]);
  if (
    currentUser &&
    manageOnlyViews.has(requestedView) &&
    !currentUser.permissions.includes("manageDispatch")
  ) {
    return redirect(dispatchPath);
  }

  const shouldPollMailbox =
    url.searchParams.get("pollMailbox") === "1" ||
    process.env.DISPATCH_AUTO_POLL_ON_PAGE_LOAD === "true";

  const isEditorOpen = requestedView === "orders" && Boolean(url.searchParams.get("order"));
  const isClassicPage = /\/(?:app\/)?classic\/?$/.test(url.pathname);
  const [dispatchState, mailboxStatus] = await Promise.all([
    loadDispatchState({
      skipSetup: isEditorOpen || shouldPollMailbox,
      useCache: !shouldPollMailbox,
      lightweightOrders: isClassicPage,
    }),
    shouldPollMailbox
      ? maybeAutoPollDispatchMailbox().catch((error) => {
          console.error("[DISPATCH MAILBOX AUTO POLL ERROR]", error);
          return {
            configured: true,
            imported: 0,
            skipped: 0,
            message: error instanceof Error ? error.message : "Mailbox auto-poll failed.",
          };
        })
      : Promise.resolve(null),
  ]);

  return data({
    allowed: true,
    currentUser,
    mailboxStatus,
    googleMapsApiKey: getBrowserGoogleMapsApiKey(),
    ...dispatchState,
  });
}

export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: any) {
  if (actionResult?.skipLoaderRevalidation) return false;
  return defaultShouldRevalidate;
}

export async function action({ request }: any) {
  const url = new URL(request.url);
  const dispatchPath = getDispatchPath(url);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  clearDispatchStateCache();

  const allowed = await hasAdminQuotePermissionAccess(request, "dispatch");
  if (!allowed) {
    return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }

  const currentUser = await getCurrentUser(request);
  const canManageDispatch = await hasAdminQuotePermissionAccess(request, "manageDispatch");
  const driverOnlyIntents = new Set(["update-stop-status"]);
  if (!canManageDispatch && !driverOnlyIntents.has(intent)) {
    const dispatchState = await loadDispatchState();
    return data(
      {
        allowed: true,
        ok: false,
        message: "You do not have permission to manage dispatch.",
        googleMapsApiKey: getBrowserGoogleMapsApiKey(),
        ...dispatchState,
      },
      { status: 403 },
    );
  }

  try {
    if (process.env.DISPATCH_AUTO_DAILY_RESET === "true") {
      await resetDispatchRoutesForNewDay();
    }

    if (intent === "clear-driver-locations") {
      await clearDispatchDriverLocations();
      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });

      await logAuditEvent({
        actor: currentUser,
        action: "clear_driver_locations",
        targetType: "dispatch",
        targetId: "driver-locations",
        targetLabel: "Driver GPS locations",
      });

      return data({
        allowed: true,
        ok: true,
        message: "Live tracking icons cleared from the map.",
        ...dispatchState,
      });
    }

    if (intent === "auto-route-orders") {
      if (form.get("manualRoutingMode") === "on") {
        const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });
        return data({
          allowed: true,
          ok: false,
          message: "Manual routing mode is on. Turn it off before running Auto Route.",
          ...dispatchState,
        });
      }

      const result = await autoRouteOrdersForDispatch();
      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });
      const skippedText = result.skipped.length
        ? ` Skipped ${result.skipped.length}: ${result.skipped.slice(0, 3).join("; ")}${result.skipped.length > 3 ? "..." : ""}`
        : "";

      await logAuditEvent({
        actor: currentUser,
        action: "auto_route_orders",
        targetType: "dispatch",
        targetId: "auto-route",
        targetLabel: "Auto Route",
        details: result,
      });

      return data({
        allowed: true,
        ok: result.assignedOrders > 0,
        message: `Auto Route assigned ${result.assignedOrders} order${result.assignedOrders === 1 ? "" : "s"} and created ${result.createdRoutes} route${result.createdRoutes === 1 ? "" : "s"}.${skippedText}`,
        ...dispatchState,
      });
    }

    if (intent === "create-order") {
      const customer = String(form.get("customer") || "").trim();
      const rawAddress = String(form.get("address") || "").trim();
      const splitAddress = splitStreetAndCity(rawAddress);
      const address = splitAddress.address;
      const city = splitAddress.city || String(form.get("city") || "").trim();
      const material = String(form.get("material") || "").trim();

      if (!customer || !address || !material) {
        const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });
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
        orderNumber: String(form.get("orderNumber") || "").trim(),
        customer,
        contact: String(form.get("contact") || "").trim(),
        address,
        city,
        material,
        quantity: String(form.get("quantity") || "").trim(),
        unit:
          (await getDispatchUnitForMaterial(material)) ||
          String(form.get("unit") || "Ton").trim() ||
          "Ton",
        requestedWindow: formatRequestedWindow(
          String(form.get("requestedWindow") || ""),
        ),
        timePreference:
          String(form.get("timePreference") || "Anytime").trim() ||
          detectTimePreference(String(form.get("notes") || "")),
        truckPreference: String(form.get("truckPreference") || "").trim(),
        notes: String(form.get("notes") || "").trim(),
      });

      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });

      return data({
        allowed: true,
        ok: true,
        message: `Added ${created.customer} to the dispatch queue.`,
        selectedOrderId: created.id,
        ...dispatchState,
      });
    }

    if (intent === "parse-email-order") {
      const rawEmail = String(form.get("rawEmail") || "").trim();
      if (!rawEmail) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Paste the order email before parsing.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const parsed = parseDispatchEmail(rawEmail);
      const parsedProducts = parsed.products?.length
        ? parsed.products
        : [{ material: parsed.material, quantity: parsed.quantity }];
      const validProducts = parsedProducts.filter((product) => product.material);

      if (!parsed.address || !validProducts.length) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "I could not find an address and material in that email. Add labels like Address: and Material: and try again.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const createdOrders = [];
      for (const [index, product] of validProducts.entries()) {
        const created = await createDispatchOrder({
          source: "email",
          orderNumber: suffixOrderNumber(parsed.orderNumber, index, validProducts.length),
          customer: parsed.customer,
          contact: parsed.contact,
          address: parsed.address,
          city: parsed.city,
          material: product.material,
          quantity: product.quantity,
          unit: (await getDispatchUnitForMaterial(product.material)) || parsed.unit,
          requestedWindow: parsed.requestedWindow,
          timePreference: parsed.timePreference,
          truckPreference: parsed.truckPreference,
          notes: parsed.notes || "Parsed from order email.",
          emailSubject: parsed.subject,
          rawEmail,
        });
        createdOrders.push(created);
      }

      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });

      return data({
        allowed: true,
        ok: true,
        message:
          createdOrders.length > 1
            ? `Parsed ${createdOrders.length} tickets from order ${parsed.orderNumber}.`
            : `Parsed email order for ${createdOrders[0].customer}.`,
        selectedOrderId: createdOrders[0].id,
        ...dispatchState,
      });
    }

    if (intent === "update-order") {
      const orderId = String(form.get("orderId") || "").trim();
      const returnTo = String(form.get("returnTo") || "").trim();
      const safeReturnTo = returnTo.startsWith("/") ? returnTo : "";
      const customer = String(form.get("customer") || "").trim();
      const rawAddress = String(form.get("address") || "").trim();
      const splitAddress = splitStreetAndCity(rawAddress);
      const address = splitAddress.address;
      const city = splitAddress.city || String(form.get("city") || "").trim();
      const material = String(form.get("material") || "").trim();
      const unit =
        (await getDispatchUnitForMaterial(material)) ||
        String(form.get("unit") || "").trim() ||
        "Unit";
      const rawStatus = String(form.get("status") || "new").trim();
      const status =
        rawStatus === "scheduled" ||
        rawStatus === "hold" ||
        rawStatus === "delivered" ||
        rawStatus === "cancelled"
          ? rawStatus
          : "new";
      const routeId = String(form.get("routeId") || "").trim();
      const eta = String(form.get("eta") || "").trim() || null;

      if (!orderId || !customer || !address || !material) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Order, customer, address, and material are required.",
            selectedOrderId: orderId,
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const updated = await updateDispatchOrderDetails(orderId, {
        orderNumber: String(form.get("orderNumber") || "").trim() || null,
        customer,
        contact: String(form.get("contact") || "").trim(),
        address,
        city,
        material,
        quantity: String(form.get("quantity") || "").trim(),
        unit,
        requestedWindow:
          formatRequestedWindow(String(form.get("requestedWindow") || "")) ||
          "Needs scheduling",
        timePreference:
          String(form.get("timePreference") || "Anytime").trim() ||
          detectTimePreference(String(form.get("notes") || "")),
        truckPreference: String(form.get("truckPreference") || "").trim() || null,
        notes: String(form.get("notes") || "").trim(),
        status,
      });

      let finalOrder = updated;
      if (form.has("routeId")) {
        const previousRouteId = updated.assignedRouteId || null;
        if (routeId) {
          const [allRoutes, allTrucks] = await Promise.all([
            getDispatchRoutes(),
            getDispatchTrucks(),
          ]);
          const selectedRoute = allRoutes.find((route) => route.id === routeId);
          const selectedTruck = allTrucks.find(
            (truck) => truck.id === selectedRoute?.truckId,
          );
          const splitCount = getSplitCountFromForm(form);
          const capacityError = !selectedRoute
            ? "Select a valid route before assigning this order."
            : getSplitCapacityError(updated, selectedTruck, splitCount);

          if (capacityError) {
            const dispatchState = await loadDispatchState();
            return data(
              {
                allowed: true,
                ok: false,
                message: capacityError,
                selectedOrderId: orderId,
                ...dispatchState,
              },
              { status: 400 },
            );
          }

          const assignment = await assignOrderToRoute({
            order: updated,
            routeId,
            truck: selectedTruck,
            splitCount,
            eta,
            route: selectedRoute || null,
          });
          if (!assignment.ok) {
            const dispatchState = await loadDispatchState();
            return data(
              {
                allowed: true,
                ok: false,
                message: assignment.message,
                selectedOrderId: orderId,
                ...dispatchState,
              },
              { status: 400 },
            );
          }
          finalOrder = updated;
        } else {
          finalOrder = await updateDispatchOrder(orderId, {
            status:
              status === "delivered" || status === "hold" || status === "cancelled"
                ? status
                : "new",
            assignedRouteId: null,
            stopSequence: null,
            deliveryStatus: status === "delivered" ? "delivered" : "not_started",
            eta: null,
          });
          await resequenceChangedRoutes([previousRouteId]);
        }
      }

      return redirect(safeReturnTo || `${dispatchPath}?view=orders`);
    }

    if (intent === "delete-order") {
      const orderId = String(form.get("orderId") || "").trim();
      if (!orderId) throw new Error("Missing order selection");

      await deleteDispatchOrder(orderId);
      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Order deleted.",
        selectedOrderId: dispatchState.orders[0]?.id,
        ...dispatchState,
      });
    }

    if (intent === "poll-mailbox") {
      const mailboxStatus = await pollDispatchMailbox();
      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: mailboxStatus.configured,
        message: mailboxStatus.message,
        mailboxStatus,
        ...dispatchState,
      });
    }

    if (intent === "poll-shopify-orders") {
      const shopifyImportStatus = await importDispatchShopifyOrders();
      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: shopifyImportStatus.configured,
        message: shopifyImportStatus.message,
        shopifyImportStatus,
        ...dispatchState,
      });
    }

    if (intent === "create-route") {
      const code = String(form.get("code") || "").trim();
      const truckId = String(form.get("truckId") || "").trim();
      const driverId = String(form.get("driverId") || "").trim();
      const helperId = String(form.get("helperId") || "").trim();
      const trucks = await getDispatchTrucks();
      const employees = await getDispatchEmployees();
      const selectedTruck = trucks.find((truck) => truck.id === truckId);
      const selectedDriver = employees.find((employee) => employee.id === driverId);
      const selectedHelper = employees.find((employee) => employee.id === helperId);

      if (!code || !selectedTruck || !selectedDriver) {
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
        truckId: selectedTruck.id,
        truck: selectedTruck.label,
        driverId: selectedDriver.id,
        driver: selectedDriver.name,
        helperId: selectedHelper?.id,
        helper: selectedHelper?.name || "",
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

    if (intent === "update-route") {
      const routeId = String(form.get("routeId") || "").trim();
      const code = String(form.get("code") || "").trim();
      const truckId = String(form.get("truckId") || "").trim();
      const driverId = String(form.get("driverId") || "").trim();
      const helperId = String(form.get("helperId") || "").trim();
      const trucks = await getDispatchTrucks();
      const employees = await getDispatchEmployees();
      const selectedTruck = trucks.find((truck) => truck.id === truckId);
      const selectedDriver = employees.find((employee) => employee.id === driverId);
      const selectedHelper = employees.find((employee) => employee.id === helperId);

      if (!routeId || !code) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Route and route code are required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      if (selectedTruck) {
        const assignedOrders = (await getDispatchOrders()).filter(
          (order) => order.assignedRouteId === routeId && order.status !== "delivered",
        );
        const capacityError = assignedOrders
          .map((order) => getCapacityError(order, selectedTruck))
          .find(Boolean);

        if (capacityError) {
          const dispatchState = await loadDispatchState();
          return data(
            {
              allowed: true,
              ok: false,
              message: capacityError,
              ...dispatchState,
            },
            { status: 400 },
          );
        }
      }

      const updated = await updateDispatchRoute(routeId, {
        code,
        truckId: selectedTruck?.id || null,
        truck: selectedTruck?.label || "",
        driverId: selectedDriver?.id || null,
        driver: selectedDriver?.name || "",
        helperId: selectedHelper?.id || null,
        helper: selectedHelper?.name || "",
        color: String(form.get("color") || "#38bdf8").trim(),
        shift: String(form.get("shift") || "").trim(),
        region: String(form.get("region") || "").trim(),
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Updated ${updated.code}.`,
        ...dispatchState,
      });
    }

    if (intent === "delete-route") {
      const routeId = String(form.get("routeId") || "").trim();
      if (!routeId) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Route is required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const assignedOrders = (await getDispatchOrders()).filter(
        (order) =>
          order.assignedRouteId === routeId &&
          order.status !== "delivered" &&
          order.deliveryStatus !== "delivered",
      );

      if (assignedOrders.length) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: `Move or unassign ${assignedOrders.length} active order${assignedOrders.length === 1 ? "" : "s"} before deleting this route.`,
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      await deleteDispatchRoute(routeId);
      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Deleted route from the active route board.",
        ...dispatchState,
      });
    }

    if (intent === "create-truck") {
      const label = String(form.get("label") || "").trim();
      if (!label) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Truck name is required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const created = await createDispatchTruck({
        label,
        truckType: String(form.get("truckType") || "").trim(),
        tons: String(form.get("tons") || "").trim(),
        yards: String(form.get("yards") || "").trim(),
        licensePlate: String(form.get("licensePlate") || "").trim(),
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Added ${created.label} to the fleet.`,
        ...dispatchState,
      });
    }

    if (intent === "update-truck") {
      const truckId = String(form.get("truckId") || "").trim();
      const label = String(form.get("label") || "").trim();
      if (!truckId || !label) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Truck and truck name are required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const updated = await updateDispatchTruck(truckId, {
        label,
        truckType: String(form.get("truckType") || "").trim(),
        tons: String(form.get("tons") || "").trim() || null,
        yards: String(form.get("yards") || "").trim() || null,
        licensePlate: String(form.get("licensePlate") || "").trim() || null,
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Updated ${updated.label}.`,
        ...dispatchState,
      });
    }

    if (intent === "delete-truck") {
      const truckId = String(form.get("truckId") || "").trim();
      if (!truckId) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Truck is required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      await deleteDispatchTruck(truckId);
      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Deleted truck from active fleet.",
        ...dispatchState,
      });
    }

    if (intent === "create-employee") {
      const name = String(form.get("name") || "").trim();
      const rawRole = String(form.get("role") || "driver").trim();
      const role =
        rawRole === "helper" || rawRole === "dispatcher" ? rawRole : "driver";

      if (!name) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Employee name is required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const created = await createDispatchEmployee({
        name,
        role,
        phone: String(form.get("phone") || "").trim(),
        email: String(form.get("email") || "").trim(),
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Added ${created.name} to employees.`,
        ...dispatchState,
      });
    }

    if (intent === "update-employee") {
      const employeeId = String(form.get("employeeId") || "").trim();
      const name = String(form.get("name") || "").trim();
      const rawRole = String(form.get("role") || "driver").trim();
      const role =
        rawRole === "helper" || rawRole === "dispatcher" ? rawRole : "driver";

      if (!employeeId || !name) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Employee and employee name are required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const updated = await updateDispatchEmployee(employeeId, {
        name,
        role,
        phone: String(form.get("phone") || "").trim() || null,
        email: String(form.get("email") || "").trim() || null,
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Updated ${updated.name}.`,
        ...dispatchState,
      });
    }

    if (intent === "delete-employee") {
      const employeeId = String(form.get("employeeId") || "").trim();
      if (!employeeId) {
        const dispatchState = await loadDispatchState();
        return data(
          {
            allowed: true,
            ok: false,
            message: "Employee is required.",
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      await deleteDispatchEmployee(employeeId);
      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Deleted employee from active roster.",
        ...dispatchState,
      });
    }

    if (intent === "assign-order") {
      const orderId = String(form.get("orderId") || "").trim();
      const routeId = String(form.get("routeId") || "").trim();

      if (!orderId || !routeId) {
        throw new Error("Missing order or route assignment details");
      }

      const [allOrders, allRoutes, allTrucks] = await Promise.all([
        getDispatchOrders(),
        getDispatchRoutes(),
        getDispatchTrucks(),
      ]);
      const selectedOrder = allOrders.find((order) => order.id === orderId);
      const selectedRoute = allRoutes.find((route) => route.id === routeId);
      const selectedTruck = allTrucks.find((truck) => truck.id === selectedRoute?.truckId);
      const splitCount = getSplitCountFromForm(form);
      const capacityError = !selectedOrder
        ? "Order was not found."
        : !selectedRoute
          ? "Select a valid route before assigning this order."
          : getSplitCapacityError(selectedOrder, selectedTruck, splitCount);

      if (capacityError) {
        const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });
        return data(
          {
            allowed: true,
            ok: false,
            message: capacityError,
            selectedOrderId: orderId,
            ...dispatchState,
          },
          { status: 400 },
        );
      }

      const assignment = await assignOrderToRoute({
        order: selectedOrder,
        routeId,
        truck: selectedTruck,
        splitCount,
        eta: String(form.get("eta") || "").trim() || null,
        route: selectedRoute || null,
      });

      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });

      return data({
        allowed: true,
        ok: true,
        message: assignment.message,
        selectedOrderId: orderId,
        ...dispatchState,
      });
    }

    if (intent === "notify-loader") {
      const orderId = String(form.get("orderId") || "").trim();
      const loaderNote = String(form.get("loaderNote") || "").trim();
      if (!orderId) throw new Error("Missing order selection");

      const [allOrders, allRoutes] = await Promise.all([
        getDispatchOrders(),
        getDispatchRoutes(),
      ]);
      const order = allOrders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order was not found.");
      const route = allRoutes.find((entry) => entry.id === order.assignedRouteId) || null;
      const notification = await createLoaderNotification({
        order,
        route,
        actor: currentUser,
        loaderNote,
      });
      await logAuditEvent({
        actor: currentUser,
        action: "notify_loader",
        targetType: "dispatch_order",
        targetId: order.id,
        targetLabel: order.orderNumber || order.id,
        details: {
          notificationId: notification.id,
          message: notification.message,
          route: route?.code || null,
          loaderNote: loaderNote || null,
        },
      });

      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });
      return data({
        allowed: true,
        ok: true,
        message: `Sent loader alert for ${getOrderDisplayNumber(order)}.`,
        selectedOrderId: order.id,
        ...dispatchState,
      });
    }

    if (intent === "sequence-route") {
      const routeId = String(form.get("routeId") || "").trim();
      const mode = String(form.get("sequenceMode") || "city").trim();
      if (!routeId) throw new Error("Missing route selection");

      const routeOrders = (await getDispatchOrders())
        .filter((order) => order.assignedRouteId === routeId)
        .sort((a, b) => {
          if (mode === "reverse") {
            return Number(b.stopSequence || 0) - Number(a.stopSequence || 0);
          }
          if (mode === "address") {
            return `${a.address} ${a.city}`.localeCompare(`${b.address} ${b.city}`);
          }
          return `${a.city} ${a.address}`.localeCompare(`${b.city} ${b.address}`);
        });

      await Promise.all(
        routeOrders.map((order, index) =>
          updateDispatchOrder(order.id, { stopSequence: index + 1 }),
        ),
      );

      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });

      return data({
        allowed: true,
        ok: true,
        message: "Route stop sequence updated.",
        selectedOrderId: routeOrders[0]?.id,
        ...dispatchState,
      });
    }

    if (intent === "move-route-stop") {
      const orderId = String(form.get("orderId") || "").trim();
      const routeId = String(form.get("routeId") || "").trim();
      const direction = String(form.get("direction") || "").trim();

      if (!orderId || !routeId || !["up", "down"].includes(direction)) {
        throw new Error("Missing route stop reorder details");
      }

      const routeOrders = (await getDispatchOrders())
        .filter(
          (order) =>
            order.assignedRouteId === routeId &&
            order.status !== "delivered" &&
            order.deliveryStatus !== "delivered",
        )
        .sort(
          (a, b) =>
            Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999) ||
            String(a.created_at || "").localeCompare(String(b.created_at || "")),
        );

      const currentIndex = routeOrders.findIndex((order) => order.id === orderId);
      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex >= 0 && nextIndex >= 0 && nextIndex < routeOrders.length) {
        const reordered = [...routeOrders];
        const [movedOrder] = reordered.splice(currentIndex, 1);
        reordered.splice(nextIndex, 0, movedOrder);

        await Promise.all(
          reordered.map((order, index) =>
            Number(order.stopSequence || 0) === index + 1
              ? Promise.resolve(order)
              : updateDispatchOrder(order.id, { stopSequence: index + 1 }),
          ),
        );
      }

      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });

      return data({
        allowed: true,
        ok: true,
        message: "Route stop order updated.",
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
        stopSequence: null,
        deliveryStatus: "not_started",
        eta: null,
      });

      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });

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
      const existingOrder = (await getDispatchOrders()).find((order) => order.id === orderId);

      await updateDispatchOrder(orderId, {
        status: "new",
        assignedRouteId: null,
        stopSequence: null,
        deliveryStatus: "not_started",
        eta: null,
      });
      await resequenceChangedRoutes([existingOrder?.assignedRouteId]);

      const dispatchState = await loadDispatchState({ skipSetup: true, fast: true });

      return data({
        allowed: true,
        ok: true,
        message: "Order moved back to inbox.",
        selectedOrderId: orderId,
        ...dispatchState,
      });
    }

    if (intent === "undo-delivered") {
      const orderId = String(form.get("orderId") || "").trim();
      if (!orderId) throw new Error("Missing order selection");

      const existingOrder = (await getDispatchOrders()).find((order) => order.id === orderId);
      const nextStatus = existingOrder?.assignedRouteId ? "scheduled" : "new";

      await updateDispatchOrder(orderId, {
        status: nextStatus,
        deliveryStatus: "not_started",
        arrivedAt: null,
        departedAt: null,
        deliveredAt: null,
      });
      await resequenceChangedRoutes([existingOrder?.assignedRouteId]);

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message:
          nextStatus === "scheduled"
            ? "Load marked undelivered and returned to its route."
            : "Load marked undelivered and returned to the intake queue.",
        selectedOrderId: orderId,
        ...dispatchState,
      });
    }

    if (intent === "update-stop-status") {
      const orderId = String(form.get("orderId") || "").trim();
      const rawDeliveryStatus = String(form.get("deliveryStatus") || "").trim();
      const deliveryStatus =
        rawDeliveryStatus === "en_route" ||
        rawDeliveryStatus === "delivered" ||
        rawDeliveryStatus === "not_started"
          ? rawDeliveryStatus
          : "not_started";

      if (!orderId) throw new Error("Missing order selection");

      const now = new Date().toISOString();
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
      if (deliveryStatus === "delivered") {
        await resequenceChangedRoutes([updatedOrder.assignedRouteId]);
      }
      const route = updatedOrder.assignedRouteId
        ? (await getDispatchRoutes()).find((entry) => entry.id === updatedOrder.assignedRouteId) || null
        : null;
      let emailNote = "";
      let shopifyNote = "";
      if (deliveryStatus === "delivered") {
        try {
          const emailResult = await sendDeliveryConfirmationEmail({
            order: updatedOrder,
            route,
          });
          emailNote = emailResult.sent
            ? " Delivery confirmation email sent."
            : ` Delivery confirmation email skipped: ${emailResult.reason}`;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown email error.";
          emailNote = ` Delivery confirmation email failed: ${message}`;
        }

        const shopifyResult = await markDispatchOrderDeliveredInShopify(updatedOrder, route);
        shopifyNote = shopifyResult.skipped
          ? ""
          : shopifyResult.ok
            ? " Shopify marked delivered."
            : ` Shopify delivery update failed: ${shopifyResult.message}`;
      }

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Stop marked ${getDeliveryStatusLabel(deliveryStatus).toLowerCase()}.${emailNote}${shopifyNote}`,
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
  const assignmentFetcher = useFetcher<typeof action>();
  const location = useLocation();
  const allowed = actionData?.allowed ?? loaderData.allowed;
  const currentUser = actionData?.currentUser ?? loaderData.currentUser ?? null;
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const quoteHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const reviewHref = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  const mobileHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const dailyExportHref = `${dispatchHref}/export-day.xls?date=${getTodayDateInputValue()}`;
  const classicHref = isEmbeddedRoute ? "/app/classic" : "/classic";
  const monitorHref = isEmbeddedRoute ? "/app/monitor" : "/monitor";
  const calendarHref = isEmbeddedRoute ? "/app/calendar" : "/calendar";
  const allotmentHref = isEmbeddedRoute ? "/app/allotment" : "/allotment";
  const loaderHref = isEmbeddedRoute ? "/app/loader" : "/loader";
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const logoutHref = `${dispatchHref}?logout=1`;
  const loginHref = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
  const canAccess = (permission: string) =>
    !currentUser || currentUser.permissions?.includes(permission);
  const canManageDispatch = canAccess("manageDispatch");
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const dispatchRoutes = (actionData?.routes ?? loaderData.routes ?? []) as DispatchRoute[];
  const trucks = (actionData?.trucks ?? loaderData.trucks ?? []) as DispatchTruck[];
  const employees = (actionData?.employees ?? loaderData.employees ?? []) as DispatchEmployee[];
  const materialOptions = (actionData?.materialOptions ??
    loaderData.materialOptions ??
    []) as string[];
  const storageReady = actionData?.storageReady ?? loaderData.storageReady ?? false;
  const storageError = actionData?.storageError ?? loaderData.storageError ?? null;
  const mailboxStatus = actionData?.mailboxStatus ?? loaderData.mailboxStatus ?? null;
  const shopifyImportStatus = actionData?.shopifyImportStatus ?? null;
  const googleMapsApiKey =
    actionData?.googleMapsApiKey ?? loaderData.googleMapsApiKey ?? "";
  const mapOriginAddress =
    actionData?.mapOriginAddress ?? loaderData.mapOriginAddress ?? "";

  const searchParams = new URLSearchParams(location.search);
  const rawView = searchParams.get("view") || "dashboard";
  const activeView =
    rawView === "orders" ||
    rawView === "scheduled" ||
    rawView === "routes" ||
    rawView === "trucks" ||
    rawView === "employees" ||
    rawView === "delivered"
      ? rawView
      : "dashboard";

  useEffect(() => {
    if (!allowed || !googleMapsApiKey || activeView !== "orders") return;

    loadGooglePlaces(googleMapsApiKey)
      .then(() => {
        attachAddressAutocomplete({
          address1Id: "dispatch-address",
          cityId: "dispatch-city",
          provinceId: "dispatch-province",
          postalCodeId: "dispatch-postal-code",
          countryId: "dispatch-country",
          cityFormat: "cityStateZip",
        });
      })
      .catch((error) => {
        console.error("[DISPATCH GOOGLE PLACES LOAD ERROR]", error);
      });
  }, [allowed, googleMapsApiKey, activeView]);

  const querySelectedOrderId = searchParams.get("order");
  const queryDashboardSelectedOrderId = searchParams.get("selected");
  const selectedOrderId =
    actionData?.selectedOrderId ||
    queryDashboardSelectedOrderId ||
    querySelectedOrderId ||
    orders[0]?.id;

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId],
  );

  const routes = useMemo(
    () =>
      dispatchRoutes.map((route) => {
        const routeOrders = orders
          .filter(
            (order) =>
              order.assignedRouteId === route.id &&
              order.status !== "delivered" &&
              order.deliveryStatus !== "delivered",
          )
          .sort(
            (a, b) =>
              Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999),
          );
        return {
          ...route,
          stops: routeOrders.length,
          totalTravelMinutes: routeOrders.reduce(
            (sum, order) => sum + getOrderTravelMinutes(order),
            0,
          ),
          loadSummary: routeOrders
            .map((order) => `${order.quantity} ${order.unit} ${order.material}`)
            .slice(0, 2)
            .join(" • "),
          orders: routeOrders,
        };
      }),
    [dispatchRoutes, orders],
  );
  const selectedOrderRoute = selectedOrder?.assignedRouteId
    ? routes.find((route) => route.id === selectedOrder.assignedRouteId) || null
    : null;

  const activeOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            !order.assignedRouteId &&
            order.status !== "scheduled" &&
            order.status !== "delivered" &&
            order.deliveryStatus !== "delivered",
        )
        .sort((a, b) => {
          const dateDiff =
            getRequestedDeliverySortValue(a) - getRequestedDeliverySortValue(b);
          if (dateDiff !== 0) return dateDiff;
          return String(a.created_at || "").localeCompare(String(b.created_at || ""));
        }),
    [orders],
  );
  const inboxOrders = orders.filter((order) => !order.assignedRouteId && order.status === "new");
  const holdOrders = orders.filter((order) => order.status === "hold");
  const scheduledOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            order.assignedRouteId &&
            order.status !== "delivered" &&
            order.deliveryStatus !== "delivered",
        )
        .sort((a, b) => {
          const dateDiff =
            getRequestedDeliverySortValue(a) - getRequestedDeliverySortValue(b);
          if (dateDiff !== 0) return dateDiff;
          return Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999);
        }),
    [orders],
  );
  const deliveredOrders = orders.filter((order) => order.status === "delivered" || order.deliveryStatus === "delivered");
  const drivers = employees.filter((employee) => employee.role === "driver");
  const helpers = employees.filter((employee) => employee.role === "helper");
  const dispatchViewHref = (view: string) => `${dispatchHref}?view=${view}`;
  const rawReturnTo = searchParams.get("returnTo") || "";
  const modalReturnHref = rawReturnTo.startsWith("/") ? rawReturnTo : dispatchViewHref("orders");
  const dashboardSelectHref = (orderId: string) =>
    `${dispatchHref}?selected=${encodeURIComponent(orderId)}`;
  const dashboardDetailHref = (orderId: string) =>
    `${dispatchHref}?order=${encodeURIComponent(orderId)}&detail=1`;
  const orderEditorOpen =
    activeView === "orders" &&
    Boolean(selectedOrder && (querySelectedOrderId || actionData?.selectedOrderId));
  const dispatchDetailOpen =
    activeView === "dashboard" &&
    searchParams.get("detail") === "1" &&
    Boolean(selectedOrder && querySelectedOrderId);
  const deliveredDetailOpen =
    activeView === "delivered" &&
    searchParams.get("detail") === "1" &&
    Boolean(selectedOrder && querySelectedOrderId);
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverRouteId, setDragOverRouteId] = useState<string | null>(null);
  const [dragOverQueue, setDragOverQueue] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISPATCH_NAV_COLLAPSED_KEY) === "1";
  });
  const [manualRoutingMode, setManualRoutingMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISPATCH_MANUAL_ROUTING_KEY) === "1";
  });
  const deferredOrderSearch = useDeferredValue(orderSearch);
  const normalizedOrderSearch = deferredOrderSearch.trim().toLowerCase();
  const isAssigningByDrag = assignmentFetcher.state === "submitting";

  function getRouteTruck(route: DispatchRoute | null | undefined) {
    if (!route) return null;
    return (
      trucks.find((truck) => truck.id === route.truckId) ||
      trucks.find((truck) => truck.label === route.truck) ||
      null
    );
  }

  function getAssignmentSplitCount(order: DispatchOrder | null | undefined, route: DispatchRoute | null | undefined) {
    if (!order || !route || !/yards?/i.test(order.unit)) return "";

    const truck = getRouteTruck(route);
    const capacity = Number(truck?.yards || 30);
    const quantity = Number(order.quantity || 0);
    if (!quantity || !capacity || quantity <= capacity) return "";

    const minimumSplits = Math.ceil(quantity / capacity);
    const routeLabel = `${route.code}${truck?.label ? ` / ${truck.label}` : ""}`;
    const answer = window.prompt(
      `${getOrderDisplayNumber(order)} is ${quantity} yards, which is over the ${capacity} yard truck limit for ${routeLabel}.\n\nHow many tickets should I split it into?`,
      String(minimumSplits),
    );

    if (answer === null) return null;

    const splitCount = Math.floor(Number(answer));
    if (!Number.isFinite(splitCount) || splitCount < minimumSplits) {
      window.alert(`Use at least ${minimumSplits} split tickets so each load fits the truck.`);
      return null;
    }

    return String(splitCount);
  }

  function prepareAssignmentSubmit(
    order: DispatchOrder,
    routeId: string,
    form: HTMLFormElement,
    event: FormEvent<HTMLFormElement>,
  ) {
    const route = routes.find((entry) => entry.id === routeId);
    const splitCount = getAssignmentSplitCount(order, route);
    if (splitCount === null) {
      event.preventDefault();
      return;
    }

    let input = form.querySelector<HTMLInputElement>('input[name="splitCount"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "splitCount";
      form.appendChild(input);
    }
    input.value = splitCount;
  }

  function toggleNavCollapsed() {
    setNavCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(DISPATCH_NAV_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Keep the control usable even when localStorage is blocked.
      }
      return next;
    });
  }

  function toggleManualRoutingMode() {
    setManualRoutingMode((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(DISPATCH_MANUAL_ROUTING_KEY, next ? "1" : "0");
      } catch {
        // Keep the control usable even when localStorage is blocked.
      }
      return next;
    });
  }

  const searchOrders = (items: DispatchOrder[]) => {
    if (!normalizedOrderSearch) return items;
    return items.filter((order) =>
      buildDispatchOrderSearchText(order, routes).includes(normalizedOrderSearch),
    );
  };

  const searchedActiveOrders = useMemo(
    () => searchOrders(activeOrders),
    [activeOrders, normalizedOrderSearch, routes],
  );
  const selectedActiveOrderIndex = searchedActiveOrders.findIndex(
    (order) => order.id === selectedOrder?.id,
  );
  const previousOrderHref =
    selectedActiveOrderIndex > 0
      ? `${dispatchHref}?view=orders&order=${encodeURIComponent(
          searchedActiveOrders[selectedActiveOrderIndex - 1].id,
        )}`
      : "";
  const nextOrderHref =
    selectedActiveOrderIndex >= 0 &&
    selectedActiveOrderIndex < searchedActiveOrders.length - 1
      ? `${dispatchHref}?view=orders&order=${encodeURIComponent(
          searchedActiveOrders[selectedActiveOrderIndex + 1].id,
        )}`
      : "";
  const searchedScheduledOrders = useMemo(
    () => searchOrders(scheduledOrders),
    [scheduledOrders, normalizedOrderSearch, routes],
  );
  const searchedDeliveredOrders = useMemo(
    () => searchOrders(deliveredOrders),
    [deliveredOrders, normalizedOrderSearch, routes],
  );
  const searchedRoutes = useMemo(() => {
    if (!normalizedOrderSearch) return routes;
    return routes.filter((route) =>
      buildRouteSearchText(route, orders).includes(normalizedOrderSearch),
    );
  }, [normalizedOrderSearch, orders, routes]);
  const searchedTrucks = useMemo(() => {
    if (!normalizedOrderSearch) return trucks;
    return trucks.filter((truck) =>
      buildTruckSearchText(truck, routes, orders).includes(normalizedOrderSearch),
    );
  }, [normalizedOrderSearch, orders, routes, trucks]);
  const searchedEmployees = useMemo(() => {
    if (!normalizedOrderSearch) return employees;
    return employees.filter((employee) =>
      buildEmployeeSearchText(employee, routes, orders).includes(normalizedOrderSearch),
    );
  }, [employees, normalizedOrderSearch, orders, routes]);

  const renderSearchBar = (placeholder: string) => (
    <div style={styles.searchBar}>
      <input
        type="search"
        value={orderSearch}
        onChange={(event) => setOrderSearch(event.currentTarget.value)}
        placeholder={placeholder}
        style={styles.searchInput}
      />
      {orderSearch ? (
        <button type="button" onClick={() => setOrderSearch("")} style={styles.clearSearchButton}>
          Clear
        </button>
      ) : null}
    </div>
  );

  function getDraggedOrderId(event: DragEvent<HTMLElement>) {
    return (
      event.dataTransfer.getData("application/x-dispatch-order-id") ||
      event.dataTransfer.getData("text/plain") ||
      draggedOrderId ||
      ""
    );
  }

  function startOrderDrag(orderId: string, event: DragEvent<HTMLElement>) {
    if (!canManageDispatch) return;
    setDraggedOrderId(orderId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-dispatch-order-id", orderId);
    event.dataTransfer.setData("text/plain", orderId);
  }

  function clearDragState() {
    setDraggedOrderId(null);
    setDragOverRouteId(null);
    setDragOverQueue(false);
  }

  function assignDraggedOrder(routeId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const orderId = getDraggedOrderId(event);

    clearDragState();

    if (!orderId || !routeId || !canManageDispatch) return;
    const order = orders.find((entry) => entry.id === orderId);
    const route = routes.find((entry) => entry.id === routeId);
    const splitCount = getAssignmentSplitCount(order, route);
    if (splitCount === null) return;

    assignmentFetcher.submit(
      {
        intent: "assign-order",
        orderId,
        routeId,
        eta: "",
        splitCount,
      },
      { method: "post", action: `${dispatchHref}${location.search || ""}` },
    );
  }

  function unassignDraggedOrder(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const orderId = getDraggedOrderId(event);

    clearDragState();

    if (!orderId || !canManageDispatch) return;

    assignmentFetcher.submit(
      {
        intent: "unassign-order",
        orderId,
      },
      { method: "post", action: `${dispatchHref}${location.search || ""}` },
    );
  }

  function moveOrderWithSelect(orderId: string, routeId: string) {
    if (!orderId || !canManageDispatch) return;
    const order = orders.find((entry) => entry.id === orderId);
    const route = routes.find((entry) => entry.id === routeId);
    const splitCount = routeId ? getAssignmentSplitCount(order, route) : "";
    if (splitCount === null) return;

    assignmentFetcher.submit(
      routeId
        ? {
            intent: "assign-order",
            orderId,
            routeId,
            eta: "",
            splitCount,
          }
        : {
            intent: "unassign-order",
            orderId,
          },
      { method: "post", action: `${dispatchHref}${location.search || ""}` },
    );
  }

  useEffect(() => {
    if (assignmentFetcher.state === "idle") {
      clearDragState();
    }
  }, [assignmentFetcher.state]);

  if (!allowed) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.shell, maxWidth: 520 }}>
          <div style={styles.loginCard}>
            <h1 style={styles.title}>Dispatch</h1>
            <p style={styles.subtitle}>
              Sign in with your contractor user account to open the dispatch workspace.
            </p>
            <a
              href={loginHref}
              style={{
                ...styles.primaryButton,
                width: "100%",
                marginTop: 16,
                minHeight: 50,
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
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>
        {`
          @media (max-width: 900px) {
            .dispatch-frame {
              display: block !important;
            }

            .dispatch-sidebar {
              position: sticky !important;
              top: 0 !important;
              z-index: 30 !important;
              min-height: auto !important;
              height: auto !important;
              border-right: 0 !important;
              border-bottom: 1px solid #1e293b !important;
            }

            .dispatch-shell {
              padding: 10px !important;
            }

            .dispatch-hero {
              grid-template-columns: minmax(0, 1fr) !important;
            }
          }
        `}
      </style>
      <div
        className="dispatch-frame"
        style={{
          ...styles.appFrame,
          gridTemplateColumns: navCollapsed ? "56px minmax(0, 1fr)" : "230px minmax(0, 1fr)",
        }}
      >
        <aside
          className="dispatch-sidebar"
          style={{ ...styles.sidebar, padding: navCollapsed ? "12px 8px" : "16px 14px" }}
        >
          <button
            type="button"
            onClick={toggleNavCollapsed}
            style={styles.navToggle}
            title={navCollapsed ? "Open navigation" : "Close navigation"}
          >
            {navCollapsed ? ">" : "<"}
          </button>
          <div style={styles.brandBlock}>
            <div style={styles.brandMark}>
              <img
                src="/green-hills-logo.png"
                alt="Green Hills Supply"
                style={styles.brandLogo}
              />
            </div>
            <div style={navCollapsed ? styles.collapsedOnlyHidden : undefined}>
              <div style={styles.brandTitle}>Contractor</div>
              <div style={styles.brandSub}>Dispatch v2.0</div>
            </div>
          </div>

          <nav style={navCollapsed ? styles.collapsedOnlyHidden : styles.sideNav}>
            <a href={classicHref} style={styles.sideNavLink(false)}>Classic</a>
            <a href={monitorHref} style={styles.sideNavLink(false)}>Monitor</a>
            <a href={calendarHref} style={styles.sideNavLink(false)}>Calendar</a>
            <a href={allotmentHref} style={styles.sideNavLink(false)}>Allotment</a>
            {canAccess("loader") ? (
              <a href={loaderHref} style={styles.sideNavLink(false)}>Loader</a>
            ) : null}
            {canAccess("manageDispatch") ? (
              <a href={dispatchViewHref("orders")} style={styles.sideNavLink(activeView === "orders")}>Orders</a>
            ) : null}
            <a href={dispatchViewHref("scheduled")} style={styles.sideNavLink(activeView === "scheduled")}>Scheduled</a>
            {canAccess("manageDispatch") ? (
              <a href={dispatchViewHref("routes")} style={styles.sideNavLink(activeView === "routes")}>Routes</a>
            ) : null}
            {canAccess("manageDispatch") ? (
              <a href={dispatchViewHref("trucks")} style={styles.sideNavLink(activeView === "trucks")}>Trucks</a>
            ) : null}
            {canAccess("manageDispatch") ? (
              <a href={dispatchViewHref("employees")} style={styles.sideNavLink(activeView === "employees")}>Employees</a>
            ) : null}
            <a href={dispatchViewHref("delivered")} style={styles.sideNavLink(activeView === "delivered")}>Delivered</a>
            <a href="https://www.ghstickets.info" style={styles.sideNavLink(false)}>Ticket Creator</a>
          </nav>

          <div style={navCollapsed ? styles.collapsedOnlyHidden : styles.sidebarFooter}>
            {canAccess("driver") ? (
              <a href={driverHref} style={styles.sideUtility}>Driver Route</a>
            ) : null}
            {canAccess("loader") ? (
              <a href={loaderHref} style={styles.sideUtility}>Loader View</a>
            ) : null}
            {canAccess("quoteTool") ? (
              <a href={quoteHref} style={styles.sideUtility}>Quote Tool</a>
            ) : null}
            {canAccess("manageUsers") ? (
              <a href="/settings" style={styles.sideUtility}>Settings</a>
            ) : null}
            {currentUser ? (
              <a href="/change-password" style={styles.sideUtility}>Change Password</a>
            ) : null}
            <a href={currentUser ? "/login?logout=1" : logoutHref} style={styles.sideUtility}>Log Out</a>
          </div>
        </aside>

        <main className="dispatch-shell" style={styles.shell}>
        <div id="dashboard" className="dispatch-hero" style={styles.hero}>
          <div>
            <div style={styles.kicker}>Dispatch Workspace</div>
            <h1 style={styles.title}>Plan, intake, and assign deliveries</h1>
            <p style={styles.subtitle}>
              Live contractor operations board for mailbox intake, routing,
              trucks, crews, and field proof.
            </p>
          </div>

          <div style={styles.heroActions}>
            <a href={mobileHref} style={styles.ghostButton}>Dashboard</a>
            <a href={reviewHref} style={styles.ghostButton}>Review Quotes</a>
            <a href={driverHref} style={styles.ghostButton}>Driver View</a>
            <a href={dailyExportHref} style={styles.ghostButton}>Export Shopify Today</a>
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

        {mailboxStatus ? (
          <div style={mailboxStatus.configured ? styles.statusOk : styles.statusWarn}>
            {mailboxStatus.message}
            {mailboxStatus.skipReasons?.length ? (
              <div style={styles.skipReasonList}>
                {mailboxStatus.skipReasons.slice(0, 5).map((item: any) => (
                  <div key={`${item.uid}-${item.reason}`} style={styles.skipReasonItem}>
                    <strong>{item.subject}</strong>
                    <span>{item.reason}</span>
                  </div>
                ))}
                {mailboxStatus.skipReasons.length > 5 ? (
                  <div style={styles.skipReasonItem}>
                    <strong>More skipped emails</strong>
                    <span>{mailboxStatus.skipReasons.length - 5} additional skipped emails not shown.</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {shopifyImportStatus ? (
          <div
            style={
              shopifyImportStatus.configured ? styles.statusOk : styles.statusWarn
            }
          >
            {shopifyImportStatus.message}
            {shopifyImportStatus.skipReasons?.length ? (
              <div style={styles.skipReasonList}>
                {shopifyImportStatus.skipReasons.slice(0, 5).map((item: string) => (
                  <div key={item} style={styles.skipReasonItem}>
                    <span>{item}</span>
                  </div>
                ))}
                {shopifyImportStatus.skipReasons.length > 5 ? (
                  <div style={styles.skipReasonItem}>
                    <span>
                      {shopifyImportStatus.skipReasons.length - 5} additional skipped
                      Shopify orders not shown.
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={styles.metricsGrid}>
          {metricCard("Inbox", String(inboxOrders.length), "#f97316")}
          {metricCard("Scheduled", String(scheduledOrders.length), "#22c55e")}
          {metricCard("On Hold", String(holdOrders.length), "#eab308")}
          {metricCard("Delivered", String(deliveredOrders.length), "#38bdf8")}
        </div>

        {activeView === "orders" ? (
          <div style={styles.focusGrid}>
            <div
              id="orders"
              onDragOver={(event) => {
                if (!draggedOrderId || !canManageDispatch) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverQueue(true);
              }}
              onDragLeave={() => setDragOverQueue(false)}
              onDrop={unassignDraggedOrder}
              style={{
                ...styles.panel,
                ...(dragOverQueue ? styles.queueDropActive : {}),
              }}
            >
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Orders</h2>
                  <p style={styles.panelSub}>View imported, manual, and held dispatch orders that still need scheduling.</p>
                </div>
                <div style={styles.headerPill}>{searchedActiveOrders.length} orders</div>
              </div>

              {renderSearchBar("Search orders by any field: customer, address, material, notes, date, route, status...")}

              <div style={{ display: "grid", gap: 10 }}>
                {searchedActiveOrders.map((order) => {
                  const route = routes.find((entry) => entry.id === order.assignedRouteId);
                  return (
                    <a
                      key={order.id}
                      href={`${dispatchHref}?view=orders&order=${encodeURIComponent(order.id)}`}
                      style={{ ...styles.queueCard, textDecoration: "none" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <div style={styles.queueTitle}>{order.customer}</div>
                          <div style={styles.queueMeta}>{order.address}, {order.city}</div>
                        </div>
                        <div style={styles.badge(order.status)}>{order.status}</div>
                      </div>
                      <div style={styles.queueDetails}>
                        <span>{getOrderDisplayNumber(order)}</span>
                        <span>{order.quantity} {order.unit}</span>
                        <span>{order.material}</span>
                        {order.travelMinutes ? <span>{order.travelMinutes} min RT</span> : null}
                        <span>{route ? route.truck : "Unassigned"}</span>
                      </div>
                    </a>
                  );
                })}
                {searchedActiveOrders.length === 0 ? (
                  <div style={styles.emptySearch}>No orders matched that search.</div>
                ) : null}
              </div>
            </div>

            <div style={styles.panel}>
              {orderEditorOpen && selectedOrder ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={styles.modalHeader}>
                    <div>
                      <h2 style={styles.panelTitle}>Edit Selected Order</h2>
                      <p style={styles.panelSub}>Update this dispatch card.</p>
                    </div>
                    <div style={styles.editorNavActions}>
                      <a
                        href={previousOrderHref || "#"}
                        aria-disabled={!previousOrderHref}
                        style={previousOrderHref ? styles.modalCloseButton : styles.disabledNavButton}
                      >
                        ←
                      </a>
                      <a
                        href={nextOrderHref || "#"}
                        aria-disabled={!nextOrderHref}
                        style={nextOrderHref ? styles.modalCloseButton : styles.disabledNavButton}
                      >
                        →
                      </a>
                      <a href={modalReturnHref} style={styles.modalCloseButton}>
                        Close
                      </a>
                    </div>
                  </div>

                  <Form method="post" action={dispatchViewHref("orders")} style={{ display: "grid", gap: 12 }}>
                    <input type="hidden" name="intent" value="update-order" />
                    <input type="hidden" name="orderId" value={selectedOrder.id} />
                    <input type="hidden" name="returnTo" value={rawReturnTo} />

                    <div style={styles.formGridTwo}>
                      <div>
                        <label style={styles.label}>Order Number</label>
                        <input name="orderNumber" defaultValue={selectedOrder.orderNumber || ""} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>Internal Dispatch ID</label>
                        <input value={selectedOrder.id} readOnly style={{ ...styles.input, opacity: 0.75 }} />
                      </div>
                    </div>

                    <div style={styles.formGridTwo}>
                      <div>
                        <label style={styles.label}>Customer</label>
                        <input name="customer" defaultValue={selectedOrder.customer} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>Contact / Email</label>
                        <input name="contact" defaultValue={selectedOrder.contact} style={styles.input} />
                      </div>
                    </div>

                    <div style={styles.formGridTwo}>
                      <div>
                        <label style={styles.label}>Address</label>
                        <input name="address" defaultValue={selectedOrder.address} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>City</label>
                        <input name="city" defaultValue={selectedOrder.city} style={styles.input} />
                      </div>
                    </div>

                    <div style={styles.formGridThree}>
                      <div>
                        <label style={styles.label}>Material</label>
                        <input name="material" defaultValue={selectedOrder.material} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>Quantity</label>
                        <input name="quantity" defaultValue={selectedOrder.quantity} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>Unit</label>
                        <input name="unit" defaultValue={selectedOrder.unit} style={styles.input} />
                      </div>
                    </div>

                    <div style={styles.formGridTwo}>
                      <div>
                        <label style={styles.label}>Requested Window</label>
                        <input
                          name="requestedWindow"
                          type="date"
                          defaultValue={getRequestedWindowDateInputValue(selectedOrder.requestedWindow)}
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label style={styles.label}>Time Preference</label>
                        <select name="timePreference" defaultValue={selectedOrder.timePreference || "Anytime"} style={styles.input}>
                          <option value="Anytime">Anytime</option>
                          <option value="Morning">Morning</option>
                          <option value="Afternoon">Afternoon</option>
                          <option value="Evening">Evening</option>
                        </select>
                      </div>
                    </div>

                    <div style={styles.formGridTwo}>
                      <div>
                        <label style={styles.label}>Status</label>
                        <select name="status" defaultValue={selectedOrder.status} style={styles.input}>
                          <option value="new">New</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="hold">Hold</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="delivered">Delivered</option>
                        </select>
                      </div>
                      <div>
                        <label style={styles.label}>Truck Preference</label>
                        <input name="truckPreference" defaultValue={selectedOrder.truckPreference || ""} style={styles.input} />
                      </div>
                    </div>

                    <div style={styles.formGridTwo}>
                      <div>
                        <label style={styles.label}>Assigned Route / Driver</label>
                        <select name="routeId" defaultValue={selectedOrder.assignedRouteId || ""} style={styles.input}>
                          <option value="">Unassigned</option>
                          {routes.map((route) => (
                            <option key={route.id} value={route.id}>
                              {route.code} - {route.truck} - {route.driver}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={styles.label}>ETA</label>
                        <input name="eta" defaultValue={selectedOrder.eta || ""} placeholder="Optional" style={styles.input} />
                      </div>
                    </div>

                    <div>
                      <label style={styles.label}>Notes</label>
                      <textarea
                        name="notes"
                        rows={4}
                        defaultValue={selectedOrder.notes}
                        style={{ ...styles.input, resize: "vertical" }}
                      />
                    </div>

                    <button type="submit" style={styles.primaryButton}>Save Order Changes</button>
                  </Form>

                  <Form
                    method="post"
                    action={dispatchViewHref("orders")}
                    onSubmit={(event) => {
                      if (!window.confirm("Delete this order? This cannot be undone.")) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="intent" value="delete-order" />
                    <input type="hidden" name="orderId" value={selectedOrder.id} />
                    <button type="submit" style={styles.dangerButton}>
                      Delete Order
                    </button>
                  </Form>
                </div>
              ) : (
                <>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Add / Import Order</h2>
                  <p style={styles.panelSub}>Create a dispatch card manually or poll the mailbox.</p>
                </div>
              </div>

              <Form method="post" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
                <input type="hidden" name="intent" value="poll-shopify-orders" />
                <button type="submit" style={styles.primaryButton}>Import Shopify Orders</button>
              </Form>

              <Form method="post" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
                <input type="hidden" name="intent" value="poll-mailbox" />
                <button type="submit" style={styles.primaryButton}>Poll Mailbox Now</button>
              </Form>

              <Form method="post" style={{ display: "grid", gap: 12 }}>
                <input type="hidden" name="intent" value="create-order" />
                <div>
                  <label style={styles.label}>Order Number</label>
                  <input name="orderNumber" placeholder="8789" style={styles.input} />
                </div>
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
                    <input
                      id="dispatch-address"
                      name="address"
                      placeholder="Start typing the street address"
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>City</label>
                    <input
                      id="dispatch-city"
                      name="city"
                      placeholder="City, ST ZIP"
                      style={styles.input}
                    />
                    <input id="dispatch-province" name="province" type="hidden" />
                    <input id="dispatch-postal-code" name="postalCode" type="hidden" />
                    <input id="dispatch-country" name="country" type="hidden" defaultValue="US" />
                  </div>
                </div>
                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Material</label>
                    <input
                      name="material"
                      list="dispatch-material-options"
                      placeholder="Start typing a synced material"
                      style={styles.input}
                    />
                    <datalist id="dispatch-material-options">
                      {materialOptions.map((material) => (
                        <option key={material} value={material} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label style={styles.label}>Quantity</label>
                    <input name="quantity" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Unit</label>
                    <select name="unit" style={styles.input}>
                      <option>Ton</option>
                      <option>Yard</option>
                      <option>Gallons</option>
                      <option>Bags</option>
                      <option>Unit</option>
                    </select>
                  </div>
                </div>
                <div style={styles.formGridTwo}>
                  <div>
                    <label style={styles.label}>Requested Window</label>
                    <input name="requestedWindow" type="date" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Time Preference</label>
                    <select name="timePreference" defaultValue="Anytime" style={styles.input}>
                      <option value="Anytime">Anytime</option>
                      <option value="Morning">Morning</option>
                      <option value="Afternoon">Afternoon</option>
                      <option value="Evening">Evening</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={styles.label}>Notes</label>
                  <textarea name="notes" rows={3} style={{ ...styles.input, resize: "vertical" }} />
                </div>
                <button type="submit" style={styles.primaryButton}>Add Order</button>
              </Form>

              <Form method="post" style={{ display: "grid", gap: 12, marginTop: 18 }}>
                <input type="hidden" name="intent" value="parse-email-order" />
                <label style={styles.label}>Paste Order Email</label>
                <textarea
                  name="rawEmail"
                  rows={9}
                  placeholder={"Subject: You've Got A New Order: #1234\nCustomer: Green Hills Supply\nAddress: 2543 W Applebrook Lane\nCity: Oak Creek, WI\nMaterial: Coarse Torpedo Sand\nQuantity: 12\nUnit: Ton\nRequested Window: Tomorrow 9a - 11a"}
                  style={{ ...styles.input, resize: "vertical", minHeight: 180 }}
                />
                <button type="submit" style={styles.secondaryButton}>
                  Parse Email Into Dispatch Card
                </button>
              </Form>
                </>
              )}
            </div>
          </div>
        ) : null}

        {false && orderEditorOpen && selectedOrder ? (
          <div style={styles.modalOverlay}>
            <div style={styles.orderModal}>
              <div style={styles.modalHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Edit Selected Order</h2>
                  <p style={styles.panelSub}>
                    Update order details or delete the selected dispatch card.
                  </p>
                </div>
                <a href={modalReturnHref} style={styles.modalCloseButton}>
                  Close
                </a>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <Form method="post" style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="intent" value="update-order" />
                  <input type="hidden" name="orderId" value={selectedOrder.id} />

                  <div style={styles.formGridTwo}>
                    <div>
                      <label style={styles.label}>Order Number</label>
                      <input
                        name="orderNumber"
                        defaultValue={selectedOrder.orderNumber || ""}
                        placeholder="8789"
                        style={styles.input}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Internal Dispatch ID</label>
                      <input value={selectedOrder.id} readOnly style={{ ...styles.input, opacity: 0.75 }} />
                    </div>
                  </div>

                  <div style={styles.formGridTwo}>
                    <div>
                      <label style={styles.label}>Customer</label>
                      <input name="customer" defaultValue={selectedOrder.customer} style={styles.input} />
                    </div>
                    <div>
                      <label style={styles.label}>Contact / Email</label>
                      <input name="contact" defaultValue={selectedOrder.contact} style={styles.input} />
                    </div>
                  </div>

                  <div style={styles.formGridTwo}>
                    <div>
                      <label style={styles.label}>Address</label>
                      <input name="address" defaultValue={selectedOrder.address} style={styles.input} />
                    </div>
                    <div>
                      <label style={styles.label}>City</label>
                      <input name="city" defaultValue={selectedOrder.city} style={styles.input} />
                    </div>
                  </div>

                  <div style={styles.formGridThree}>
                    <div>
                      <label style={styles.label}>Material</label>
                      <input name="material" defaultValue={selectedOrder.material} style={styles.input} />
                    </div>
                    <div>
                      <label style={styles.label}>Quantity</label>
                      <input name="quantity" defaultValue={selectedOrder.quantity} style={styles.input} />
                    </div>
                    <div>
                      <label style={styles.label}>Unit</label>
                      <input name="unit" defaultValue={selectedOrder.unit} style={styles.input} />
                    </div>
                  </div>

                  <div style={styles.formGridTwo}>
                    <div>
                      <label style={styles.label}>Requested Window</label>
                      <input
                        name="requestedWindow"
                        type="date"
                        defaultValue={getRequestedWindowDateInputValue(selectedOrder.requestedWindow)}
                        style={styles.input}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Time Preference</label>
                      <select
                        name="timePreference"
                        defaultValue={selectedOrder.timePreference || "Anytime"}
                        style={styles.input}
                      >
                        <option value="Anytime">Anytime</option>
                        <option value="Morning">Morning</option>
                        <option value="Afternoon">Afternoon</option>
                        <option value="Evening">Evening</option>
                      </select>
                    </div>
                  </div>

                  <div style={styles.formGridTwo}>
                    <div>
                      <label style={styles.label}>Status</label>
                      <select name="status" defaultValue={selectedOrder.status} style={styles.input}>
                        <option value="new">New</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="hold">Hold</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="delivered">Delivered</option>
                      </select>
                    </div>
                    <div>
                      <label style={styles.label}>Truck Preference</label>
                      <input
                        name="truckPreference"
                        defaultValue={selectedOrder.truckPreference || ""}
                        style={styles.input}
                      />
                    </div>
                  </div>

                  <div style={styles.formGridTwo}>
                    <div>
                      <label style={styles.label}>Assigned Route / Driver</label>
                      <select
                        name="routeId"
                        defaultValue={selectedOrder.assignedRouteId || ""}
                        style={styles.input}
                      >
                        <option value="">Unassigned</option>
                        {routes.map((route) => (
                          <option key={route.id} value={route.id}>
                            {route.code} - {route.truck} - {route.driver}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={styles.label}>ETA</label>
                      <input
                        name="eta"
                        defaultValue={selectedOrder.eta || ""}
                        placeholder="Optional"
                        style={styles.input}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={styles.label}>Notes</label>
                    <textarea
                      name="notes"
                      rows={4}
                      defaultValue={selectedOrder.notes}
                      style={{ ...styles.input, resize: "vertical" }}
                    />
                  </div>

                  <button type="submit" style={styles.primaryButton}>
                    Save Order Changes
                  </button>
                </Form>

                <Form
                  method="post"
                  onSubmit={(event) => {
                    if (!window.confirm("Delete this order? This cannot be undone.")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="delete-order" />
                  <input type="hidden" name="orderId" value={selectedOrder.id} />
                  <button type="submit" style={styles.dangerButton}>
                    Delete Order
                  </button>
                </Form>
              </div>
            </div>
          </div>
        ) : null}

        {activeView === "scheduled" ? (
          <div style={styles.focusGrid}>
            <div id="scheduled" style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Scheduled</h2>
                  <p style={styles.panelSub}>Orders assigned to a route and waiting for delivery.</p>
                </div>
                <div style={styles.headerPill}>
                  {searchedScheduledOrders.length} of {scheduledOrders.length} scheduled
                </div>
              </div>

              {renderSearchBar("Search scheduled loads by any field: customer, route, driver, address, material, notes...")}

              <div style={{ display: "grid", gap: 10 }}>
                {searchedScheduledOrders.length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>
                    {scheduledOrders.length ? "No scheduled orders matched that search." : "No scheduled orders yet."}
                  </div>
                ) : (
                  searchedScheduledOrders.map((order) => {
                    const route = routes.find((entry) => entry.id === order.assignedRouteId);
                    return (
                      <div key={order.id} style={styles.queueCard}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div>
                            <div style={styles.queueTitle}>{order.customer}</div>
                            <div style={styles.queueMeta}>{order.address}, {order.city}</div>
                          </div>
                          <div style={styles.badge("scheduled")}>scheduled</div>
                        </div>
                        <div style={styles.queueDetails}>
                          <span>{getOrderDisplayNumber(order)}</span>
                          <span>{order.quantity} {order.unit}</span>
                          <span>{order.material}</span>
                          {order.travelMinutes ? <span>{order.travelMinutes} min RT</span> : null}
                          {order.timePreference ? <span>{order.timePreference}</span> : null}
                          {order.stopSequence ? <span>Stop {order.stopSequence}</span> : null}
                          <span>{route ? `${route.truck || route.code} / ${route.driver || "No driver"}` : "No route"}</span>
                        </div>
                        {order.notes ? (
                          <div style={styles.queueNotes}>
                            <strong>Notes:</strong> {order.notes}
                          </div>
                        ) : null}
                        <div style={styles.deliveredActions}>
                          <a
                            href={`${dispatchHref}?view=orders&order=${encodeURIComponent(order.id)}`}
                            style={styles.detailButton}
                          >
                            Edit
                          </a>
                          <a
                            href={`${driverHref}?route=${encodeURIComponent(order.assignedRouteId || "")}`}
                            style={styles.assignButton}
                          >
                            Driver View
                          </a>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeView === "delivered" ? (
          <div style={styles.focusGrid}>
            <div id="delivered" style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Delivered</h2>
                  <p style={styles.panelSub}>Completed orders that drivers marked delivered.</p>
                </div>
                <div style={styles.headerPill}>
                  {searchedDeliveredOrders.length} of {deliveredOrders.length} delivered
                </div>
              </div>

              {renderSearchBar("Search delivered loads by any field: customer, address, material, proof, notes, route...")}

              <div style={{ display: "grid", gap: 10 }}>
                {searchedDeliveredOrders.length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>
                    {deliveredOrders.length ? "No delivered orders matched that search." : "No delivered orders yet."}
                  </div>
                ) : (
                  searchedDeliveredOrders.map((order) => {
                    const route = routes.find((entry) => entry.id === order.assignedRouteId);
                    return (
                      <div
                        key={order.id}
                        style={styles.queueCard}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div>
                            <div style={styles.queueTitle}>{order.customer}</div>
                            <div style={styles.queueMeta}>{order.address}, {order.city}</div>
                          </div>
                          <div style={styles.badge("delivered")}>delivered</div>
                        </div>
                        <div style={styles.queueDetails}>
                          <span>{getOrderDisplayNumber(order)}</span>
                          <span>{order.quantity} {order.unit}</span>
                          <span>{order.material}</span>
                          {order.deliveredAt ? <span>{new Date(order.deliveredAt).toLocaleString()}</span> : null}
                          <span>{route ? route.truck || route.code : "No route"}</span>
                        </div>
                        <div style={styles.deliveredActions}>
                          <a
                            href={`${dispatchHref}?view=delivered&order=${encodeURIComponent(order.id)}&detail=1`}
                            style={styles.detailButton}
                          >
                            Open
                          </a>
                          <Form
                            method="post"
                            onSubmit={(event) => {
                              if (!window.confirm("Mark this delivered load as undelivered? It will move back to its route or the queue.")) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="intent" value="undo-delivered" />
                            <input type="hidden" name="orderId" value={order.id} />
                            <button type="submit" style={styles.smallWarningButton}>
                              Mark Undelivered
                            </button>
                          </Form>
                          <Form
                            method="post"
                            onSubmit={(event) => {
                              if (!window.confirm("Delete this delivered order? This cannot be undone.")) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="intent" value="delete-order" />
                            <input type="hidden" name="orderId" value={order.id} />
                            <button type="submit" style={styles.smallDangerButton}>
                              Delete
                            </button>
                          </Form>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}

        {deliveredDetailOpen && selectedOrder ? (
          <div style={styles.modalOverlay}>
            <div style={styles.dispatchModal}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Delivered Order</h2>
                  <p style={styles.panelSub}>
                    Review the completed delivery details and proof notes.
                  </p>
                </div>
                <a href={dispatchViewHref("delivered")} style={styles.modalCloseButton}>
                  Close
                </a>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={styles.detailId}>{getOrderDisplayNumber(selectedOrder)}</div>
                  <div style={styles.detailTitle}>{selectedOrder.customer}</div>
                  <div style={styles.detailMeta}>{selectedOrder.contact}</div>
                </div>

                <Form
                  method="post"
                  onSubmit={(event) => {
                    if (!window.confirm("Mark this delivered load as undelivered? It will move back to its route or the queue.")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="undo-delivered" />
                  <input type="hidden" name="orderId" value={selectedOrder.id} />
                  <button type="submit" style={styles.warningButton}>
                    Mark Load Undelivered
                  </button>
                </Form>

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
                    <div style={styles.detailLabel}>Time Preference</div>
                    <div style={styles.detailValue}>
                      {selectedOrder.timePreference || "Anytime"}
                    </div>
                  </div>
                  <div>
                    <div style={styles.detailLabel}>Travel Time</div>
                    <div style={styles.detailValue}>
                      {selectedOrder.travelSummary || "Not calculated yet"}
                    </div>
                  </div>
                  <div>
                    <div style={styles.detailLabel}>Delivered</div>
                    <div style={styles.detailValue}>
                      {selectedOrder.deliveredAt
                        ? new Date(selectedOrder.deliveredAt).toLocaleString()
                        : "Delivered"}
                    </div>
                  </div>
                  <div>
                    <div style={styles.detailLabel}>Proof Name</div>
                    <div style={styles.detailValue}>
                      {selectedOrder.proofName || selectedOrder.signatureName || "Not captured"}
                    </div>
                  </div>
                  <div>
                    <div style={styles.detailLabel}>Inspection</div>
                    <div style={styles.detailValue}>
                      {selectedOrder.inspectionStatus || "Not completed"}
                    </div>
                  </div>
                </div>

                <div style={styles.notesBlock}>
                  <div style={styles.detailLabel}>Notes</div>
                  <div style={{ color: "#e2e8f0", lineHeight: 1.55 }}>
                    {selectedOrder.notes || "No dispatch notes."}
                  </div>
                </div>

                {selectedOrder.proofNotes ? (
                  <div style={styles.notesBlock}>
                    <div style={styles.detailLabel}>Proof Notes</div>
                    <div style={{ color: "#e2e8f0", lineHeight: 1.55 }}>
                      {selectedOrder.proofNotes}
                    </div>
                  </div>
                ) : null}

                {selectedOrder.photoUrls ? (
                  <div style={styles.notesBlock}>
                    <div style={styles.detailLabel}>Photo Proof</div>
                    {isImageProof(selectedOrder.photoUrls) ? (
                      <img
                        src={selectedOrder.photoUrls}
                        alt="Delivered material proof"
                        style={styles.deliveredPhoto}
                      />
                    ) : (
                      <div style={{ color: "#e2e8f0", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                        {selectedOrder.photoUrls}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {activeView === "trucks" ? (
          <div style={styles.focusGrid}>
            <div id="trucks" style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Fleet</h2>
                  <p style={styles.panelSub}>View and edit active trucks, ton limits, and yard limits.</p>
                </div>
                <div style={styles.headerPill}>
                  {searchedTrucks.length} of {trucks.length} trucks
                </div>
              </div>
              {renderSearchBar("Search fleet by any field: truck, type, plate, tons, yards, route, assigned loads...")}
              <div style={styles.resourceList}>
                {searchedTrucks.map((truck) => (
                  <Form
                    key={truck.id}
                    method="post"
                    style={{ ...styles.resourceCard, gap: 12 }}
                    onSubmit={(event) => {
                      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                      if (
                        submitter?.value === "delete-truck" &&
                        !window.confirm("Delete this truck from the active fleet? Existing routes and history will remain.")
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="truckId" value={truck.id} />
                    <div style={styles.formGridThree}>
                      <div>
                        <label style={styles.label}>Truck Name</label>
                        <input name="label" defaultValue={truck.label} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>Type</label>
                        <input name="truckType" defaultValue={truck.truckType} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>Plate</label>
                        <input name="licensePlate" defaultValue={truck.licensePlate || ""} style={styles.input} />
                      </div>
                    </div>
                    <div style={styles.formGridThree}>
                      <div>
                        <label style={styles.label}>Tons</label>
                        <input name="tons" defaultValue={truck.tons || ""} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>Yards</label>
                        <input name="yards" defaultValue={truck.yards || ""} style={styles.input} />
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                        <button type="submit" name="intent" value="update-truck" style={{ ...styles.secondaryButton, width: "100%" }}>
                          Save Truck
                        </button>
                        <button type="submit" name="intent" value="delete-truck" style={{ ...styles.dangerButton, width: "100%" }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </Form>
                ))}
                {searchedTrucks.length === 0 ? (
                  <div style={styles.emptySearch}>No trucks matched that search.</div>
                ) : null}
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Add Truck</h2>
                  <p style={styles.panelSub}>Add trucks before assigning routes.</p>
                </div>
              </div>
              <Form method="post" style={{ display: "grid", gap: 12 }}>
                <input type="hidden" name="intent" value="create-truck" />
                <div style={styles.formGridTwo}>
                  <div>
                    <label style={styles.label}>Truck Name</label>
                    <input name="label" placeholder="Truck 22" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Type</label>
                    <input name="truckType" placeholder="Tri-axle" style={styles.input} />
                  </div>
                </div>
                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Tons</label>
                    <input name="tons" placeholder="22" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Yards</label>
                    <input name="yards" placeholder="18" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Plate</label>
                    <input name="licensePlate" style={styles.input} />
                  </div>
                </div>
                <button type="submit" style={{ ...styles.primaryButton, width: "100%" }}>Add Truck</button>
              </Form>
            </div>
          </div>
        ) : null}

        {activeView === "employees" ? (
          <div style={styles.focusGrid}>
            <div id="employees" style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Employees</h2>
                  <p style={styles.panelSub}>View drivers, helpers, and dispatchers.</p>
                </div>
                <div style={styles.headerPill}>
                  {searchedEmployees.length} of {employees.length} people
                </div>
              </div>
              {renderSearchBar("Search employees by any field: name, role, phone, email, route, truck, assigned loads...")}
              <div style={styles.resourceList}>
                {searchedEmployees.map((employee) => (
                  <Form
                    key={employee.id}
                    method="post"
                    style={{ ...styles.resourceCard, gap: 12 }}
                    onSubmit={(event) => {
                      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                      if (
                        submitter?.value === "delete-employee" &&
                        !window.confirm("Delete this employee from the active roster? Existing routes and history will remain.")
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <div style={styles.formGridThree}>
                      <div>
                        <label style={styles.label}>Name</label>
                        <input name="name" defaultValue={employee.name} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>Role</label>
                        <select name="role" defaultValue={employee.role} style={styles.input}>
                          <option value="driver">Driver</option>
                          <option value="helper">Helper</option>
                          <option value="dispatcher">Dispatcher</option>
                        </select>
                      </div>
                      <div>
                        <label style={styles.label}>Phone</label>
                        <input name="phone" defaultValue={employee.phone || ""} style={styles.input} />
                      </div>
                    </div>
                    <div style={styles.formGridTwo}>
                      <div>
                        <label style={styles.label}>Email</label>
                        <input name="email" type="email" defaultValue={employee.email || ""} style={styles.input} />
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                        <button type="submit" name="intent" value="update-employee" style={{ ...styles.secondaryButton, width: "100%" }}>
                          Save Employee
                        </button>
                        <button type="submit" name="intent" value="delete-employee" style={{ ...styles.dangerButton, width: "100%" }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </Form>
                ))}
                {searchedEmployees.length === 0 ? (
                  <div style={styles.emptySearch}>No employees matched that search.</div>
                ) : null}
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Add Employee</h2>
                  <p style={styles.panelSub}>Add drivers, helpers, or dispatch users.</p>
                </div>
              </div>
              <Form method="post" style={{ display: "grid", gap: 12 }}>
                <input type="hidden" name="intent" value="create-employee" />
                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Name</label>
                    <input name="name" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Role</label>
                    <select name="role" style={styles.input}>
                      <option value="driver">Driver</option>
                      <option value="helper">Helper</option>
                      <option value="dispatcher">Dispatcher</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Phone</label>
                    <input name="phone" style={styles.input} />
                  </div>
                </div>
                <div style={styles.formGridTwo}>
                  <div>
                    <label style={styles.label}>Email</label>
                    <input name="email" type="email" style={styles.input} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button type="submit" style={{ ...styles.primaryButton, width: "100%" }}>Add Employee</button>
                  </div>
                </div>
              </Form>
            </div>
          </div>
        ) : null}

        {activeView === "routes" ? (
          <div style={styles.focusGrid}>
            <div id="routes" style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Routes</h2>
                  <p style={styles.panelSub}>View route assignments, open driver view, and sequence stops.</p>
                </div>
                <div style={styles.headerPill}>
                  {searchedRoutes.length} of {routes.length} routes
                </div>
              </div>
              {renderSearchBar("Search routes by any field: route, truck, driver, helper, region, shift, assigned loads...")}
              <div style={{ display: "grid", gap: 12 }}>
                {searchedRoutes.map((route) => (
                  <Form
                    key={route.id}
                    method="post"
                    style={styles.routeCard(route.color)}
                    onSubmit={(event) => {
                      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                      if (
                        submitter?.value === "delete-route" &&
                        !window.confirm("Delete this route from the active board? Move or unassign active orders first. This cannot be undone.")
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="routeId" value={route.id} />
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={styles.routeColor(route.color)} />
                          <div style={styles.routeCode}>{route.code}</div>
                          <div style={styles.routeRegion}>{route.region}</div>
                        </div>
                        <div style={{ marginTop: 8, color: "#e2e8f0", fontWeight: 700 }}>
                          {route.truck || "No truck"} · {route.driver || "No driver"} / {route.helper || "No helper"}
                        </div>
                      </div>
                      <a href={`${driverHref}?route=${encodeURIComponent(route.id)}`} style={styles.assignButton}>Driver View</a>
                    </div>
                    <div style={{ ...styles.formGridThree, marginTop: 14 }}>
                      <div>
                        <label style={styles.label}>Route Code</label>
                        <input name="code" defaultValue={route.code} style={styles.input} />
                      </div>
                      <div>
                        <label style={styles.label}>Truck</label>
                        <select name="truckId" defaultValue={route.truckId || ""} style={styles.input}>
                          <option value="">Unassigned</option>
                          {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={styles.label}>Color</label>
                        <input type="color" name="color" defaultValue={route.color} style={styles.colorInput} />
                      </div>
                    </div>
                    <div style={{ ...styles.formGridThree, marginTop: 12 }}>
                      <div>
                        <label style={styles.label}>Driver</label>
                        <select name="driverId" defaultValue={route.driverId || ""} style={styles.input}>
                          <option value="">Unassigned</option>
                          {drivers.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={styles.label}>Helper</label>
                        <select name="helperId" defaultValue={route.helperId || ""} style={styles.input}>
                          <option value="">Unassigned</option>
                          {helpers.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={styles.label}>Shift</label>
                        <input name="shift" defaultValue={route.shift} style={styles.input} />
                      </div>
                    </div>
                    <div style={{ ...styles.formGridTwo, marginTop: 12 }}>
                      <div>
                        <label style={styles.label}>Region</label>
                        <input name="region" defaultValue={route.region} style={styles.input} />
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                        <button type="submit" name="intent" value="update-route" style={{ ...styles.secondaryButton, width: "100%" }}>
                          Save Route Assignments
                        </button>
                        <button type="submit" name="intent" value="delete-route" style={{ ...styles.dangerButton, width: "100%" }}>
                          Delete Route
                        </button>
                      </div>
                    </div>
                    <div style={styles.routeStats}>
                      <span>{route.shift}</span>
                      <span>{route.stops} stops</span>
                      <span>{route.loadSummary || "No assigned loads yet"}</span>
                    </div>
                  </Form>
                ))}
                {searchedRoutes.length === 0 ? (
                  <div style={styles.emptySearch}>No routes matched that search.</div>
                ) : null}
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Add Route</h2>
                  <p style={styles.panelSub}>Create a route using an active truck and driver.</p>
                </div>
              </div>
              <Form method="post" style={{ display: "grid", gap: 12 }}>
                <input type="hidden" name="intent" value="create-route" />
                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Route Code</label>
                    <input name="code" placeholder="R-22" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Truck</label>
                    <select name="truckId" style={styles.input}>
                      <option value="">Select truck</option>
                      {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Color</label>
                    <input type="color" name="color" defaultValue="#38bdf8" style={styles.colorInput} />
                  </div>
                </div>
                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Driver</label>
                    <select name="driverId" style={styles.input}>
                      <option value="">Select driver</option>
                      {drivers.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Helper</label>
                    <select name="helperId" style={styles.input}>
                      <option value="">No helper</option>
                      {helpers.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Shift</label>
                    <input name="shift" placeholder="7:00a - 4:00p" style={styles.input} />
                  </div>
                </div>
                <button type="submit" style={styles.primaryButton}>Add Route</button>
              </Form>
            </div>
          </div>
        ) : null}

        {activeView === "dashboard" ? (
        <div style={styles.workspaceGrid}>
          <div style={styles.leftColumn}>
            <div
              id="orders"
              onDragEnter={(event) => {
                if (!draggedOrderId || !canManageDispatch) return;
                event.preventDefault();
                setDragOverQueue(true);
              }}
              onDragOver={(event) => {
                if (!draggedOrderId || !canManageDispatch) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverQueue(true);
              }}
              onDrop={unassignDraggedOrder}
              style={{
                ...styles.panel,
                ...(dragOverQueue ? styles.queueDropActive : {}),
              }}
            >
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Email Intake Queue</h2>
                  <p style={styles.panelSub}>
                    Orders that came in by email or were typed in manually can be reviewed and routed here.
                    {canManageDispatch
                      ? " Drag cards between the queue and routes to assign or unassign."
                      : ""}
                  </p>
                </div>
                <div style={styles.headerPill}>{searchedActiveOrders.length} in queue</div>
              </div>

              {canManageDispatch ? (
                <div style={styles.autoRouteBar}>
                  <div>
                    <div style={styles.autoRouteTitle}>Auto Route Planner</div>
                    <div style={styles.autoRouteSub}>
                      Sorts by requested date, time preference, truck capacity, then similar materials.
                    </div>
                  </div>
                  <label style={styles.manualToggle}>
                    <input
                      type="checkbox"
                      checked={manualRoutingMode}
                      onChange={toggleManualRoutingMode}
                    />
                    Manual routing mode
                  </label>
                  <Form
                    method="post"
                    onSubmit={(event) => {
                      if (manualRoutingMode) {
                        event.preventDefault();
                        return;
                      }

                      if (
                        !window.confirm(
                          "Auto Route will assign current unscheduled orders to available routes/trucks. Existing route stops will be left in place. Continue?",
                        )
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="intent" value="auto-route-orders" />
                    {manualRoutingMode ? (
                      <input type="hidden" name="manualRoutingMode" value="on" />
                    ) : null}
                    <button
                      type="submit"
                      disabled={manualRoutingMode}
                      style={manualRoutingMode ? styles.disabledActionButton : styles.primaryButton}
                    >
                      Auto Route
                    </button>
                  </Form>
                </div>
              ) : null}

              {renderSearchBar("Search dispatch by any field: order, customer, route, truck, driver, address, material, notes...")}

              <div style={{ display: "grid", gap: 10 }}>
                {searchedActiveOrders.map((order) => {
                  const active = order.id === selectedOrder?.id;
                  const route = routes.find((entry) => entry.id === order.assignedRouteId);
                  return (
                    <div
                      key={order.id}
                      draggable={canManageDispatch}
                      onDragStart={(event) => startOrderDrag(order.id, event)}
                      onDragEnd={clearDragState}
                      style={{
                        ...styles.queueCard,
                        borderColor: active ? "#38bdf8" : "rgba(51, 65, 85, 0.92)",
                        boxShadow: active
                          ? "0 0 0 1px rgba(56, 189, 248, 0.45)"
                          : "none",
                        cursor: canManageDispatch ? "grab" : "pointer",
                        opacity: draggedOrderId === order.id ? 0.58 : 1,
                      }}
                    >
                      <div style={styles.cardActionRow}>
                        <a
                          href={dashboardSelectHref(order.id)}
                          draggable={false}
                          style={styles.cardSelectArea}
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
                            <span>{getOrderDisplayNumber(order)}</span>
                            <span>{order.quantity} {order.unit}</span>
                            <span>{order.material}</span>
                            {order.travelMinutes ? <span>{order.travelMinutes} min RT</span> : null}
                            {order.timePreference ? <span>{order.timePreference}</span> : null}
                            {order.stopSequence ? <span>Stop {order.stopSequence}</span> : null}
                          </div>

                          {order.notes ? (
                            <div style={styles.queueNotes}>
                              <strong>Notes:</strong> {order.notes}
                            </div>
                          ) : null}

                          <div style={styles.queueFooter}>
                            <span>{order.requestedWindow}</span>
                            <span>
                              {route
                                ? `${route.truck} / ${getDeliveryStatusLabel(order.deliveryStatus)}`
                                : "Unassigned"}
                            </span>
                          </div>
                        </a>
                        <a
                          href={dashboardDetailHref(order.id)}
                          draggable={false}
                          style={styles.detailButton}
                        >
                          Open
                        </a>
                      </div>
                    </div>
                  );
                })}
                {searchedActiveOrders.length === 0 ? (
                  <div style={styles.emptySearch}>No queue orders matched that search.</div>
                ) : null}
              </div>
              {draggedOrderId && canManageDispatch ? (
                <div style={dragOverQueue ? styles.dropHintActive : styles.dropHint}>
                  Drop here to move back to queue
                </div>
              ) : null}
            </div>

          </div>

          <div style={styles.centerColumn}>
            <div id="routes" style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Routes & Fleet</h2>
                  <p style={styles.panelSub}>
                    Active trucks, crew assignments, and current stop counts.
                  </p>
                </div>
                <div style={styles.headerPill}>
                  {searchedRoutes.length} of {routes.length} routes
                </div>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {searchedRoutes.map((route) => (
                  <div
                    key={route.id}
                    onDragEnter={(event) => {
                      if (!draggedOrderId || !canManageDispatch) return;
                      event.preventDefault();
                      setDragOverQueue(false);
                      setDragOverRouteId(route.id);
                    }}
                    onDragOver={(event) => {
                      if (!draggedOrderId || !canManageDispatch) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverQueue(false);
                      setDragOverRouteId(route.id);
                    }}
                    onDrop={(event) => assignDraggedOrder(route.id, event)}
                    style={{
                      ...styles.routeCard(route.color),
                      ...(dragOverRouteId === route.id ? styles.routeDropActive : {}),
                    }}
                  >
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
                      <a
                        href={`${driverHref}?route=${encodeURIComponent(route.id)}`}
                        draggable={false}
                        style={styles.assignButton}
                      >
                        Driver View
                      </a>
                      <div style={styles.routeTimePill}>
                        Total Time: {formatTravelMinutes(route.totalTravelMinutes)}
                      </div>
                      {selectedOrder ? (
                        selectedOrder.assignedRouteId === route.id ? (
                          <Form
                            method="post"
                            style={styles.assignForm}
                            onSubmit={(event) =>
                              prepareAssignmentSubmit(
                                selectedOrder,
                                route.id,
                                event.currentTarget,
                                event,
                              )
                            }
                          >
                            <input type="hidden" name="intent" value="unassign-order" />
                            <input type="hidden" name="orderId" value={selectedOrder.id} />
                            <button type="submit" style={styles.secondaryButton}>
                              Unassign Selected
                            </button>
                          </Form>
                        ) : (
                          <Form
                            method="post"
                            style={styles.assignForm}
                            onSubmit={(event) =>
                              prepareAssignmentSubmit(
                                selectedOrder,
                                route.id,
                                event.currentTarget,
                                event,
                              )
                            }
                          >
                            <input type="hidden" name="intent" value="assign-order" />
                            <input type="hidden" name="orderId" value={selectedOrder.id} />
                            <input type="hidden" name="routeId" value={route.id} />
                            <input
                              name="eta"
                              placeholder="ETA"
                              defaultValue={selectedOrder.eta || ""}
                              style={styles.compactInput}
                            />
                            <button type="submit" style={styles.assignButton}>
                              Assign Selected
                            </button>
                          </Form>
                        )
                      ) : null}
                    </div>

                    {draggedOrderId && canManageDispatch ? (
                      <div
                        style={
                          dragOverRouteId === route.id
                            ? styles.dropHintActive
                            : styles.dropHint
                        }
                      >
                        Drop here to assign to {route.code}
                      </div>
                    ) : null}

                    <div style={styles.routeStats}>
                      <span>{route.shift}</span>
                      <span>{route.stops} stops</span>
                      <span>Total route: {formatTravelMinutes(route.totalTravelMinutes)}</span>
                      <span>{route.loadSummary || "No assigned loads yet"}</span>
                    </div>

                    {route.orders.length ? (
                      <div style={styles.stopList}>
                        {route.orders.map((order, index) => (
                          <div
                            key={order.id}
                            draggable={canManageDispatch}
                            onDragStart={(event) => startOrderDrag(order.id, event)}
                            onDragEnd={clearDragState}
                            style={{
                              ...styles.stopRow,
                              cursor: canManageDispatch ? "grab" : "default",
                              opacity: draggedOrderId === order.id ? 0.58 : 1,
                            }}
                          >
                            <span title="Drag to another route or back to queue" style={styles.dragHandle}>
                              ::
                            </span>
                            <div style={styles.stopSelectArea}>
                              <span style={styles.stopNumber}>
                                {order.stopSequence || "-"}
                              </span>
                              <span style={styles.stopMain}>
                                <strong>{order.customer}</strong>
                                <small>
                                  {order.city} · {order.material} ·{" "}
                                  {order.travelSummary ||
                                    `${formatTravelMinutes(getOrderTravelMinutes(order))} RT`}
                                </small>
                              </span>
                              <span
                                style={styles.stopStatus(
                                  getDeliveryStatusColor(order.deliveryStatus),
                                )}
                              >
                                {getDeliveryStatusLabel(order.deliveryStatus)}
                              </span>
                            </div>
                            <div style={styles.stopActions}>
                              {canManageDispatch ? (
                                <Form method="post" style={styles.routeReorderForm}>
                                  <input type="hidden" name="intent" value="move-route-stop" />
                                  <input type="hidden" name="routeId" value={route.id} />
                                  <input type="hidden" name="orderId" value={order.id} />
                                  <button
                                    name="direction"
                                    value="up"
                                    style={{
                                      ...styles.stopDetailButton,
                                      ...(index === 0 ? styles.disabledStopButton : null),
                                    }}
                                    disabled={index === 0}
                                    title="Move stop up"
                                  >
                                    Up
                                  </button>
                                  <button
                                    name="direction"
                                    value="down"
                                    style={{
                                      ...styles.stopDetailButton,
                                      ...(index === route.orders.length - 1
                                        ? styles.disabledStopButton
                                        : null),
                                    }}
                                    disabled={index === route.orders.length - 1}
                                    title="Move stop down"
                                  >
                                    Down
                                  </button>
                                </Form>
                              ) : null}
                              {canManageDispatch ? (
                                <Form method="post" style={styles.routeReorderForm} onSubmit={attachLoaderNote}>
                                  <input type="hidden" name="intent" value="notify-loader" />
                                  <input type="hidden" name="orderId" value={order.id} />
                                  <button
                                    type="submit"
                                    style={styles.stopDetailButton}
                                    title="Tell the loader this is the next load"
                                  >
                                    Load Next
                                  </button>
                                </Form>
                              ) : null}
                              <select
                                defaultValue={order.assignedRouteId || ""}
                                onChange={(event) => {
                                  moveOrderWithSelect(order.id, event.currentTarget.value);
                                }}
                                onClick={(event) => event.stopPropagation()}
                                style={styles.stopMoveSelect}
                                title="Move order"
                              >
                                <option value="">Queue</option>
                                {routes.map((moveRoute) => (
                                  <option key={moveRoute.id} value={moveRoute.id}>
                                    {moveRoute.code}
                                  </option>
                                ))}
                              </select>
                              <a
                                href={dashboardSelectHref(order.id)}
                                draggable={false}
                                style={styles.stopDetailButton}
                              >
                                Select
                              </a>
                              <a
                                href={dashboardDetailHref(order.id)}
                                draggable={false}
                                style={styles.stopDetailButton}
                              >
                                Open
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                  </div>
                ))}
                {searchedRoutes.length === 0 ? (
                  <div style={styles.emptySearch}>No routes matched that search.</div>
                ) : null}
              </div>

            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Route Map Preview</h2>
                  <p style={styles.panelSub}>
                    Live Google route preview from the shop to each assigned stop and back.
                  </p>
                </div>
              </div>

              <RouteMapPreview
                googleMapsApiKey={googleMapsApiKey}
                originAddress={mapOriginAddress}
                routes={searchedRoutes}
              />
            </div>
          </div>

          {dispatchDetailOpen ? (
          <div style={styles.modalOverlay}>
            <div style={styles.dispatchModal}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Dispatch Detail</h2>
                  <p style={styles.panelSub}>
                    Review the selected order, then assign it to a truck and crew or place it on hold.
                  </p>
                </div>
                <a
                  href={selectedOrder ? dashboardSelectHref(selectedOrder.id) : dispatchViewHref("dashboard")}
                  style={styles.modalCloseButton}
                >
                  Close
                </a>
              </div>

              {selectedOrder ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <div style={styles.detailId}>{getOrderDisplayNumber(selectedOrder)}</div>
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
                      <div style={styles.detailLabel}>Time Preference</div>
                      <div style={styles.detailValue}>
                        {selectedOrder.timePreference || "Anytime"}
                      </div>
                    </div>
                    <div>
                      <div style={styles.detailLabel}>Travel Time</div>
                      <div style={styles.detailValue}>
                        {selectedOrder.travelSummary || "Not calculated yet"}
                      </div>
                    </div>
                    <div>
                      <div style={styles.detailLabel}>Truck Preference</div>
                      <div style={styles.detailValue}>
                        {selectedOrder.truckPreference || "No preference"}
                      </div>
                    </div>
                    <div>
                      <div style={styles.detailLabel}>Route Stop</div>
                      <div style={styles.detailValue}>
                        {selectedOrder.assignedRouteId
                          ? `Stop ${selectedOrder.stopSequence || "-"}`
                          : "Unassigned"}
                      </div>
                    </div>
                    <div>
                      <div style={styles.detailLabel}>Delivery Status</div>
                      <div
                        style={{
                          ...styles.detailValue,
                          color: getDeliveryStatusColor(selectedOrder.deliveryStatus),
                        }}
                      >
                        {getDeliveryStatusLabel(selectedOrder.deliveryStatus)}
                        {selectedOrder.eta ? ` · ETA ${selectedOrder.eta}` : ""}
                      </div>
                    </div>
                    <div>
                      <div style={styles.detailLabel}>Inspection</div>
                      <div style={styles.detailValue}>
                        {selectedOrder.inspectionStatus || "Not completed"}
                      </div>
                    </div>
                  </div>

                  <div style={styles.notesBlock}>
                    <div style={styles.detailLabel}>Notes</div>
                    <div style={{ color: "#e2e8f0", lineHeight: 1.55 }}>
                      {selectedOrder.notes || "No dispatch notes yet."}
                    </div>
                  </div>

                  <div style={styles.assignmentPanel}>
                    <div>
                      <div style={styles.detailLabel}>Assigned Route</div>
                      <div style={styles.detailValue}>
                        {selectedOrderRoute
                          ? `${selectedOrderRoute.code} · ${selectedOrderRoute.truck} · ${selectedOrderRoute.driver}`
                          : "Unassigned"}
                      </div>
                    </div>

                    <Form
                      method="post"
                      style={styles.assignmentForm}
                      onSubmit={(event) => {
                        const routeId = new FormData(event.currentTarget).get("routeId");
                        prepareAssignmentSubmit(
                          selectedOrder,
                          String(routeId || ""),
                          event.currentTarget,
                          event,
                        );
                      }}
                    >
                      <input type="hidden" name="intent" value="assign-order" />
                      <input type="hidden" name="orderId" value={selectedOrder.id} />
                      <div style={styles.formGridTwo}>
                        <div>
                          <label style={styles.label}>Assign To Route / Driver</label>
                          <select
                            name="routeId"
                            defaultValue={selectedOrder.assignedRouteId || ""}
                            style={styles.input}
                            required
                          >
                            <option value="" disabled>
                              Select route
                            </option>
                            {routes.map((route) => (
                              <option key={route.id} value={route.id}>
                                {route.code} - {route.truck} - {route.driver}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={styles.label}>ETA</label>
                          <input
                            name="eta"
                            defaultValue={selectedOrder.eta || ""}
                            placeholder="Optional"
                            style={styles.input}
                          />
                        </div>
                      </div>
                      <button type="submit" style={styles.primaryButton}>
                        {selectedOrder.assignedRouteId ? "Reassign Order" : "Assign Order"}
                      </button>
                    </Form>
                  </div>

                  <Form method="post" style={styles.stopStatusForm}>
                    <input type="hidden" name="intent" value="update-stop-status" />
                    <input type="hidden" name="orderId" value={selectedOrder.id} />

                    <div>
                      <label style={styles.label}>Stop Status</label>
                      <select
                        name="deliveryStatus"
                        defaultValue={selectedOrder.deliveryStatus || "not_started"}
                        style={styles.input}
                      >
                        <option value="not_started">Dispatched</option>
                        <option value="en_route">Enroute</option>
                        <option value="delivered">Delivered</option>
                      </select>
                    </div>

                    <div>
                      <label style={styles.label}>Proof Name</label>
                      <input
                        name="proofName"
                        defaultValue={selectedOrder.proofName || ""}
                        style={styles.input}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Signature / Authorized Name</label>
                      <input
                        name="signatureName"
                        defaultValue={selectedOrder.signatureName || selectedOrderRoute?.driver || ""}
                        style={styles.input}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Photo Links</label>
                      <textarea
                        name="photoUrls"
                        defaultValue={selectedOrder.photoUrls || ""}
                        rows={3}
                        placeholder="Paste photo URLs or file references, one per line"
                        style={{ ...styles.input, resize: "vertical" }}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Inspection Status</label>
                      <select
                        name="inspectionStatus"
                        defaultValue={selectedOrder.inspectionStatus || ""}
                        style={styles.input}
                      >
                        <option value="">Not completed</option>
                        <option value="Passed">Passed</option>
                        <option value="Needs review">Needs review</option>
                        <option value="Blocked">Blocked</option>
                      </select>
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
                      <label style={styles.label}>Custom Checklist Notes</label>
                      <textarea
                        name="customChecklist"
                        rows={3}
                        defaultValue={selectedOrder.checklistJson || ""}
                        style={{ ...styles.input, resize: "vertical" }}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Proof Notes</label>
                      <textarea
                        name="proofNotes"
                        defaultValue={selectedOrder.proofNotes || ""}
                        rows={3}
                        style={{ ...styles.input, resize: "vertical" }}
                      />
                    </div>

                    <button type="submit" style={styles.primaryButton}>
                      Update Stop
                    </button>
                  </Form>

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

                    <Form
                      method="post"
                      onSubmit={(event) => {
                        if (!window.confirm("Delete this order? This cannot be undone.")) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="intent" value="delete-order" />
                      <input type="hidden" name="orderId" value={selectedOrder.id} />
                      <button type="submit" style={styles.dangerButton}>
                        Delete Order
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
          </div>
          ) : null}
        </div>
        ) : null}
        </main>
      </div>
      </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#020617",
    color: "#f8fafc",
    padding: 0,
    fontFamily: "Verdana, Geneva, Tahoma, sans-serif",
    fontSize: 12,
  } as const,
  appFrame: {
    width: "100%",
    minHeight: "100vh",
    display: "grid",
    alignItems: "start",
    transition: "grid-template-columns 160ms ease",
  } as const,
  sidebar: {
    position: "sticky" as const,
    top: 0,
    minHeight: "100vh",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: 12,
    borderRadius: 0,
    borderRight: "1px solid #1e293b",
    background: "#020617",
    boxShadow: "none",
    overflow: "hidden",
    transition: "padding 160ms ease",
  } as const,
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
  } as const,
  collapsedOnlyHidden: {
    display: "none",
  } as const,
  brandBlock: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  } as const,
  brandMark: {
    width: 70,
    height: 46,
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    border: "1px solid #334155",
    overflow: "hidden",
    boxShadow: "none",
  } as const,
  brandLogo: {
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
  } as const,
  brandTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  brandSub: {
    marginTop: 3,
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: 800,
  },
  sideNav: {
    display: "grid",
    alignContent: "start",
    gap: 8,
  } as const,
  sideNavLink: (active: boolean) =>
    ({
      minHeight: 46,
      display: "flex",
      alignItems: "center",
      padding: "0 13px",
      borderRadius: 8,
      color: active ? "#ff7a1a" : "#e5e7eb",
      textDecoration: "none",
      fontWeight: 800,
      border: "1px solid transparent",
      background: active ? "#1e293b" : "transparent",
    }) as const,
  sidebarFooter: {
    display: "grid",
    gap: 8,
  } as const,
  sideUtility: {
    minHeight: 40,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    borderRadius: 14,
    border: "1px solid #334155",
    background: "transparent",
    color: "#e5e7eb",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 800,
  } as const,
  shell: {
    display: "grid",
    gap: 14,
    padding: 14,
  } as const,
  loginCard: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: 28,
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  } as const,
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 0,
    border: "1px solid #334155",
    background: "#0f172a",
    boxShadow: "0 1px 2px rgba(0,0,0,0.28)",
  } as const,
  kicker: {
    color: "#e85d04",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.18em",
  },
  title: {
    margin: "8px 0 0",
    fontSize: "1.75rem",
    lineHeight: 1.04,
    letterSpacing: "-0.04em",
    fontWeight: 900,
  },
  subtitle: {
    margin: "12px 0 0",
    color: "#94a3b8",
    fontSize: 13,
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
    borderRadius: 999,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#38bdf8",
    textDecoration: "none",
    fontWeight: 700,
  } as const,
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
  } as const,
  workspaceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
    gap: 18,
    alignItems: "start",
  } as const,
  focusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
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
    borderRadius: 0,
    border: "1px solid #334155",
    background: "#0f172a",
    padding: 14,
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  } as const,
  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 80,
    display: "grid",
    placeItems: "center",
    padding: 22,
    background: "rgba(35, 35, 35, 0.38)",
    backdropFilter: "blur(10px)",
  },
  orderModal: {
    width: "min(920px, 100%)",
    maxHeight: "calc(100vh - 44px)",
    overflowY: "auto" as const,
    borderRadius: 30,
    border: "1px solid #334155",
    background: "#0f172a",
    padding: 24,
    boxShadow: "0 18px 60px rgba(0,0,0,0.22)",
  } as const,
  dispatchModal: {
    width: "min(980px, 100%)",
    maxHeight: "calc(100vh - 44px)",
    overflowY: "auto" as const,
    borderRadius: 30,
    border: "1px solid #334155",
    background: "#0f172a",
    padding: 24,
    boxShadow: "0 18px 60px rgba(0,0,0,0.22)",
  } as const,
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 18,
  } as const,
  modalCloseButton: {
    minHeight: 40,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #334155",
    background: "#020617",
    color: "#f8fafc",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 800,
  } as const,
  editorNavActions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  },
  disabledNavButton: {
    minHeight: 40,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #1f2937",
    background: "#020617",
    color: "#475569",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 800,
    pointerEvents: "none" as const,
  },
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
  searchBar: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 10,
    margin: "0 0 16px",
  } as const,
  searchInput: {
    width: "100%",
    minHeight: 44,
    boxSizing: "border-box" as const,
    borderRadius: 14,
    border: "1px solid #334155",
    background: "#020617",
    color: "#f8fafc",
    padding: "0 14px",
    fontSize: 14,
    outline: "none",
  },
  clearSearchButton: {
    minHeight: 44,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid #f97316",
    background: "#0f172a",
    color: "#e85d04",
    fontWeight: 900,
    cursor: "pointer",
  } as const,
  emptySearch: {
    padding: 16,
    borderRadius: 16,
    border: "1px dashed #334155",
    background: "#0b1220",
    color: "#94a3b8",
    fontWeight: 800,
  },
  headerPill: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #334155",
    color: "#38bdf8",
    background: "#0b1220",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  autoRouteBar: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    alignItems: "center",
    gap: 12,
    padding: 12,
    margin: "0 0 16px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#020617",
  } as const,
  autoRouteTitle: {
    color: "#f8fafc",
    fontWeight: 900,
    fontSize: 13,
  },
  autoRouteSub: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 1.4,
  },
  manualToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 42,
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap" as const,
  },
  queueCard: {
    width: "100%",
    textAlign: "left" as const,
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#0b1220",
    padding: 16,
    color: "#f8fafc",
    cursor: "pointer",
  } as const,
  queueDropActive: {
    borderColor: "rgba(34, 197, 94, 0.68)",
    background:
      "rgba(34, 197, 94, 0.14)",
    boxShadow:
      "inset 0 0 0 1px rgba(34, 197, 94, 0.28)",
  } as const,
  cardActionRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "center",
  } as const,
  cardSelectArea: {
    minWidth: 0,
    color: "inherit",
    textDecoration: "none",
  } as const,
  detailButton: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    border: "1px solid #38bdf8",
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 900,
    textDecoration: "none",
    whiteSpace: "nowrap" as const,
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
  queueNotes: {
    marginTop: 10,
    padding: "9px 10px",
    borderRadius: 12,
    background: "#0b1220",
    border: "1px solid #334155",
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 1.45,
  } as const,
  queueFooter: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#94a3b8",
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
    background: "#0f172a",
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
    background: "#0f172a",
    cursor: "pointer",
  },
  compactInput: {
    width: 82,
    boxSizing: "border-box" as const,
    minHeight: 42,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#f8fafc",
    fontSize: 13,
    outline: "none",
  },
  compactSelect: {
    minHeight: 42,
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#f8fafc",
    fontSize: 13,
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
  disabledActionButton: {
    minHeight: 50,
    borderRadius: 15,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#64748b",
    fontWeight: 800,
    fontSize: 14,
    cursor: "not-allowed",
    padding: "0 18px",
  } as const,
  secondaryButton: {
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#f8fafc",
    fontWeight: 700,
    cursor: "pointer",
  } as const,
  dangerButton: {
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(248, 113, 113, 0.55)",
    background: "rgba(127, 29, 29, 0.42)",
    color: "#fecaca",
    fontWeight: 800,
    cursor: "pointer",
  } as const,
  smallDangerButton: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(248, 113, 113, 0.55)",
    background: "rgba(127, 29, 29, 0.42)",
    color: "#fecaca",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  } as const,
  smallWarningButton: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(251, 191, 36, 0.55)",
    background: "rgba(120, 53, 15, 0.42)",
    color: "#fde68a",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  } as const,
  warningButton: {
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(251, 191, 36, 0.55)",
    background: "rgba(120, 53, 15, 0.42)",
    color: "#fde68a",
    fontWeight: 900,
    cursor: "pointer",
  } as const,
  deliveredActions: {
    marginTop: 14,
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap" as const,
  } as const,
  routeCard: (color: string) =>
    ({
      borderRadius: 20,
      padding: 18,
      border: `1px solid ${color}44`,
      background: "#0f172a",
      boxShadow: `inset 4px 0 0 ${color}, 0 1px 2px rgba(0,0,0,0.08)`,
    }) as const,
  routeDropActive: {
    borderColor: "#38bdf8",
    background:
      "rgba(56, 189, 248, 0.12)",
    boxShadow:
      "inset 0 0 0 1px rgba(56, 189, 248, 0.45)",
  } as const,
  dropHint: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px dashed rgba(56, 189, 248, 0.28)",
    background: "rgba(56, 189, 248, 0.12)",
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  dropHintActive: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(56, 189, 248, 0.65)",
    background: "rgba(56, 189, 248, 0.18)",
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
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
  routeTimePill: {
    minHeight: 42,
    padding: "0 14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    border: "1px solid rgba(56, 189, 248, 0.4)",
    background: "rgba(14, 165, 233, 0.12)",
    color: "#bae6fd",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap" as const,
  } as const,
  sequenceForm: {
    marginTop: 12,
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  } as const,
  routeCreateForm: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid rgba(51, 65, 85, 0.82)",
    display: "grid",
    gap: 12,
  } as const,
  resourceSummary: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  } as const,
  resourceList: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginTop: 8,
  },
  resourceCard: {
    minWidth: 220,
    display: "grid",
    gap: 5,
    padding: 14,
    borderRadius: 16,
    background: "#0b1220",
    border: "1px solid #334155",
    color: "#f8fafc",
  } as const,
  resourcePill: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 28,
    padding: "0 10px",
    borderRadius: 999,
    background: "#111827",
    border: "1px solid #334155",
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 700,
  } as const,
  assignForm: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  } as const,
  assignButton: {
    minHeight: 42,
    padding: "0 14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    border: "1px solid rgba(34, 197, 94, 0.4)",
    background: "rgba(34, 197, 94, 0.12)",
    color: "#bbf7d0",
    textDecoration: "none",
    fontWeight: 800,
    cursor: "pointer",
  } as const,
  stopList: {
    marginTop: 14,
    display: "grid",
    gap: 8,
  } as const,
  stopRow: {
    display: "grid",
    gridTemplateColumns: "26px minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    background: "#0b1220",
    border: "1px solid #334155",
    textDecoration: "none",
    color: "#f8fafc",
    userSelect: "none" as const,
  } as const,
  dragHandle: {
    width: 26,
    minHeight: 42,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(56, 189, 248, 0.28)",
    background: "rgba(56, 189, 248, 0.12)",
    color: "#7dd3fc",
    fontWeight: 950,
    cursor: "grab",
    userSelect: "none" as const,
    touchAction: "none" as const,
  } as const,
  stopSelectArea: {
    display: "grid",
    gridTemplateColumns: "32px minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
    minWidth: 0,
    color: "inherit",
    textDecoration: "none",
  } as const,
  stopActions: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  } as const,
  routeReorderForm: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  } as const,
  stopMoveSelect: {
    minHeight: 30,
    maxWidth: 96,
    borderRadius: 10,
    border: "1px solid rgba(34, 197, 94, 0.38)",
    background: "rgba(34, 197, 94, 0.14)",
    color: "#86efac",
    fontSize: 11,
    fontWeight: 900,
    padding: "0 8px",
    cursor: "pointer",
  } as const,
  stopDetailButton: {
    minHeight: 30,
    padding: "0 9px",
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    border: "1px solid #38bdf8",
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: 900,
    textDecoration: "none",
    whiteSpace: "nowrap" as const,
  } as const,
  disabledStopButton: {
    opacity: 0.35,
    cursor: "not-allowed",
  } as const,
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    border: "1px solid #334155",
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 900,
  } as const,
  stopMain: {
    display: "grid",
    gap: 3,
    minWidth: 0,
  } as const,
  stopStatus: (color: string) =>
    ({
      minHeight: 28,
      padding: "0 9px",
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color,
      background: `${color}1f`,
      border: `1px solid ${color}55`,
      fontSize: 11,
      fontWeight: 800,
      whiteSpace: "nowrap" as const,
    }) as const,
  stopStatusForm: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    background: "#0b1220",
    border: "1px solid #334155",
  } as const,
  assignmentPanel: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    background:
      "rgba(56, 189, 248, 0.12)",
    border: "1px solid #b6e4f8",
  } as const,
  assignmentForm: {
    display: "grid",
    gap: 12,
  } as const,
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
    borderRadius: 12,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 800,
  } as const,
  mapStage: {
    position: "relative" as const,
    minHeight: 380,
    borderRadius: 0,
    overflow: "hidden",
    border: "1px solid #334155",
    background: "#dceecf",
  },
  googleMapCanvas: {
    position: "absolute" as const,
    inset: 0,
    minHeight: 380,
  } as const,
  mapStatus: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background:
      "rgba(255, 255, 255, 0.86)",
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: 800,
    textAlign: "center" as const,
  } as const,
  mapNotice: {
    position: "absolute" as const,
    top: 16,
    left: 16,
    right: 16,
    display: "grid",
    gap: 6,
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(249, 115, 22, 0.16)",
    border: "1px solid rgba(249, 115, 22, 0.38)",
    color: "#fed7aa",
    fontSize: 12,
    fontWeight: 800,
    zIndex: 2,
  } as const,
  mapLegend: {
    position: "absolute" as const,
    left: 16,
    bottom: 16,
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: 16,
    background: "#0f172a",
    border: "1px solid #334155",
    color: "#f8fafc",
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
    color: "#94a3b8",
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
    background: "#0b1220",
    border: "1px solid #334155",
  } as const,
  deliveredPhoto: {
    width: "100%",
    maxHeight: 520,
    marginTop: 10,
    borderRadius: 16,
    objectFit: "contain" as const,
    background: "#111827",
    border: "1px solid #334155",
  },
  todoItem: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    color: "#cbd5e1",
    lineHeight: 1.55,
  } as const,
  todoDot: {
    width: 8,
    height: 8,
    marginTop: 7,
    borderRadius: 999,
    background: "#38bdf8",
    boxShadow: "0 0 0 5px rgba(14, 165, 198, 0.12)",
    flex: "0 0 auto",
  } as const,
  statusOk: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(34, 197, 94, 0.14)",
    border: "1px solid rgba(34, 197, 94, 0.38)",
    color: "#86efac",
    fontWeight: 700,
  } as const,
  statusWarn: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(245, 158, 11, 0.16)",
    border: "1px solid rgba(245, 158, 11, 0.38)",
    color: "#fde68a",
    fontWeight: 600,
    lineHeight: 1.6,
  } as const,
  statusErr: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(127, 29, 29, 0.35)",
    border: "1px solid rgba(248, 113, 113, 0.4)",
    color: "#fecaca",
    fontWeight: 700,
  } as const,
  skipReasonList: {
    display: "grid",
    gap: 8,
    marginTop: 12,
  } as const,
  skipReasonItem: {
    display: "grid",
    gap: 3,
    padding: "10px 12px",
    borderRadius: 12,
    background: "#0b1220",
    border: "1px solid #334155",
    color: "inherit",
    fontSize: 13,
    lineHeight: 1.35,
  } as const,
  badge: (status: DispatchOrder["status"]) => {
    const palette =
      status === "scheduled"
        ? {
            color: "#bbf7d0",
            border: "rgba(34, 197, 94, 0.35)",
            bg: "rgba(34, 197, 94, 0.12)",
          }
        : status === "delivered"
        ? {
            color: "#bae6fd",
            border: "rgba(56, 189, 248, 0.35)",
            bg: "rgba(56, 189, 248, 0.12)",
          }
        : status === "cancelled"
        ? {
            color: "#fecaca",
            border: "rgba(248, 113, 113, 0.38)",
            bg: "rgba(127, 29, 29, 0.22)",
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
