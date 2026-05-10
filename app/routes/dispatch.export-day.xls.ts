import { getDispatchOrders, type DispatchOrder } from "../lib/dispatch.server";
import { hasAdminQuotePermissionAccess } from "../lib/admin-quote-auth.server";

function getLocalDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.DISPATCH_RESET_TIMEZONE || "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatSheetDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function escapeCell(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanOrderNumber(order: DispatchOrder) {
  return String(order.orderNumber || order.id || "").replace(/^#/, "").trim();
}

function extractPhone(order: DispatchOrder) {
  const text = [order.contact, order.notes, order.rawEmail].filter(Boolean).join("\n");
  const match = text.match(/(?:\+?1[\s.-]?)?(?:\(?([2-9]\d{2})\)?[\s.-]?)([2-9]\d{2})[\s.-]?(\d{4})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function getCity(order: DispatchOrder) {
  const city = String(order.city || "").trim();
  if (city) return city.split(",")[0].trim();

  const parts = String(order.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

function getUnitLabel(unit: string, quantity: string) {
  const normalized = String(unit || "Unit").trim().toLowerCase();
  const qty = Number(String(quantity || "").replace(/[^\d.]/g, ""));
  const plural = !Number.isFinite(qty) || qty !== 1;

  if (/yards?/.test(normalized)) return plural ? "YARDS" : "YARD";
  if (/tons?/.test(normalized)) return plural ? "TONS" : "TON";
  if (/bags?/.test(normalized)) return plural ? "BAGS" : "BAG";
  if (/gallons?/.test(normalized)) return plural ? "GALLONS" : "GALLON";
  return plural ? "UNITS" : "UNIT";
}

function getQuantity(order: DispatchOrder) {
  const quantity = String(order.quantity || "").trim();
  return [quantity, getUnitLabel(order.unit, quantity)].filter(Boolean).join(" ");
}

function getTimePreference(order: DispatchOrder) {
  const value = `${order.timePreference || ""} ${order.requestedWindow || ""} ${order.notes || ""}`;
  if (/\bmorning\b|\bam\b/i.test(value)) return "AM";
  if (/\bafternoon\b|\bpm\b/i.test(value)) return "PM";
  if (/\bevening\b/i.test(value)) return "EVENING";
  return "";
}

function getSheetStatus(order: DispatchOrder) {
  if (order.status === "delivered" || order.deliveryStatus === "delivered") {
    return "DELIVERED";
  }
  if (order.status === "new" || order.status === "hold") return "PENDING DISPATCH";
  return "DISPATCHED";
}

function orderSortValue(order: DispatchOrder) {
  const numeric = Number(String(order.orderNumber || "").replace(/\D/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Number.MAX_SAFE_INTEGER;
}

function buildSpreadsheetRows(orders: DispatchOrder[], requestedDate: Date) {
  return orders
    .slice()
    .sort((a, b) => orderSortValue(a) - orderSortValue(b))
    .map((order) => [
      cleanOrderNumber(order),
      order.customer,
      extractPhone(order),
      getCity(order),
      order.material,
      getQuantity(order),
      "DELIVERY",
      formatSheetDate(requestedDate),
      getTimePreference(order),
      getSheetStatus(order),
    ]);
}

function buildTsv(orders: DispatchOrder[], requestedDate: Date) {
  return buildSpreadsheetRows(orders, requestedDate)
    .map((row) => row.map(escapeCell).join("\t"))
    .join("\r\n");
}

export async function loader({ request }: { request: Request }) {
  const allowed = await hasAdminQuotePermissionAccess(request, "dispatch");
  if (!allowed) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date") || getLocalDateKey();
  const requestedDate = parseRequestedDate(dateParam) || new Date();
  const requestedKey = dateKey(requestedDate);
  const orders = (await getDispatchOrders()).filter((order) => {
    if (order.status === "cancelled") return false;
    const orderDate = parseRequestedDate(order.requestedWindow);
    return orderDate ? dateKey(orderDate) === requestedKey : false;
  });

  return new Response(buildTsv(orders, requestedDate), {
    headers: {
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Content-Disposition": `attachment; filename="dispatch-orders-${requestedKey}.tsv"`,
      "Cache-Control": "no-store",
    },
  });
}
