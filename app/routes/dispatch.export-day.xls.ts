import { getDispatchOrders, type DispatchOrder } from "../lib/dispatch.server";
import { hasAdminQuotePermissionAccess } from "../lib/admin-quote-auth.server";

const EXPORT_TIMEZONE = process.env.DISPATCH_RESET_TIMEZONE || "America/Chicago";

function getLocalDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EXPORT_TIMEZONE,
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

function timestampDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EXPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getSelectedDateKey(dateParam: string, requestedDate: Date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : dateKey(requestedDate);
}

function formatSheetDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function getOrderImportDate(order: DispatchOrder) {
  const value = order.created_at || "";
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function escapeCell(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeHtml(value: string | number | null | undefined) {
  return escapeCell(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      formatSheetDate(parseRequestedDate(order.requestedWindow) || requestedDate),
      getTimePreference(order),
      getSheetStatus(order),
    ]);
}

function buildTsv(orders: DispatchOrder[], requestedDate: Date) {
  if (!orders.length) {
    return `No Shopify-imported dispatch orders found for ${formatSheetDate(requestedDate)}`;
  }

  return buildSpreadsheetRows(orders, requestedDate)
    .map((row) => row.map(escapeCell).join("\t"))
    .join("\r\n");
}

function getStatusClass(status: string) {
  if (status === "DELIVERED") return "status-delivered";
  if (status === "PENDING DISPATCH") return "status-pending";
  return "status-dispatched";
}

function buildExcelHtml(orders: DispatchOrder[], requestedDate: Date) {
  if (!orders.length) {
    return `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>No Shopify-imported dispatch orders found for ${escapeHtml(formatSheetDate(requestedDate))}</body>
</html>`;
  }

  const rows = buildSpreadsheetRows(orders, requestedDate)
    .map((row) => {
      const status = String(row[9] || "");
      return `<tr>${row
        .map((cell, index) => {
          const className = index === 9 ? getStatusClass(status) : "";
          return `<td class="${className}">${escapeHtml(cell)}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table {
        border-collapse: collapse;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11pt;
      }
      td {
        border: 1px solid #000;
        padding: 2px 8px;
        height: 20px;
        font-weight: 700;
        text-align: center;
        vertical-align: middle;
        white-space: nowrap;
        background: #dbe8f7;
        color: #000;
        mso-number-format: "\\@";
      }
      td:nth-child(1) { min-width: 90px; }
      td:nth-child(2) { min-width: 220px; }
      td:nth-child(3) { min-width: 120px; }
      td:nth-child(4) { min-width: 150px; }
      td:nth-child(5) { min-width: 320px; }
      td:nth-child(6) { min-width: 120px; }
      td:nth-child(7) { min-width: 90px; }
      td:nth-child(8) { min-width: 110px; }
      td:nth-child(9) { min-width: 135px; }
      td:nth-child(10) { min-width: 220px; }
      .status-dispatched { background: #ffe600; }
      .status-delivered { background: #00ff00; }
      .status-pending { background: #ff00ff; }
    </style>
  </head>
  <body>
    <table>${rows}</table>
  </body>
</html>`;
}

export async function loader({ request }: { request: Request }) {
  const allowed = await hasAdminQuotePermissionAccess(request, "dispatch");
  if (!allowed) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date") || getLocalDateKey();
  const requestedDate = parseRequestedDate(dateParam) || new Date();
  const requestedKey = getSelectedDateKey(dateParam, requestedDate);
  const orders = (await getDispatchOrders()).filter((order) => {
    if (order.status === "cancelled") return false;
    if (!String(order.mailboxMessageId || "").startsWith("shopify:")) return false;
    const importDate = getOrderImportDate(order);
    return importDate ? timestampDateKey(importDate) === requestedKey : false;
  });

  return new Response(buildExcelHtml(orders, requestedDate), {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="dispatch-orders-${requestedKey}.xls"`,
      "Cache-Control": "no-store",
    },
  });
}
