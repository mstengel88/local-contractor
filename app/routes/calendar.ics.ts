import { getDispatchOrders, type DispatchOrder } from "../lib/dispatch.server";

function isAuthorized(request: Request, params?: { secret?: string }) {
  const expected =
    process.env.DISPATCH_CALENDAR_FEED_SECRET ||
    process.env.DISPATCH_POLL_SECRET ||
    "";
  if (!expected) return false;

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-dispatch-calendar-secret") ||
    params?.secret ||
    url.searchParams.get("secret") ||
    "";

  return provided === expected;
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let current = line;
  while (current.length > 74) {
    chunks.push(current.slice(0, 74));
    current = ` ${current.slice(74)}`;
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

function formatIcsDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatIcsDateTime(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
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
  if (isoDate) {
    return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
  }

  const slashDate = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slashDate) {
    const year =
      slashDate[3].length === 2
        ? 2000 + Number(slashDate[3])
        : Number(slashDate[3]);
    return new Date(year, Number(slashDate[1]) - 1, Number(slashDate[2]));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function getOrderNumber(order: DispatchOrder) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}

function getLoadLabel(order: DispatchOrder) {
  return [order.quantity, order.unit, order.material].filter(Boolean).join(" ");
}

function getOrderAddress(order: DispatchOrder) {
  return [order.address, order.city].filter(Boolean).join(", ");
}

function getTravelMinutes(order: DispatchOrder) {
  const minutes = Number(order.travelMinutes || 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function formatTravelMinutes(minutes: number) {
  const rounded = Math.round(minutes);
  if (!rounded) return "0 min";
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function getOrderStatus(order: DispatchOrder) {
  if (order.status === "delivered" || order.deliveryStatus === "delivered") return "Delivered";
  if (order.assignedRouteId || order.status === "scheduled") return "Scheduled";
  if (order.status === "hold") return "On hold";
  return "New";
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params?: { secret?: string };
}) {
  if (!isAuthorized(request, params)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const orders = await getDispatchOrders();
  const grouped = new Map<string, { date: Date; orders: DispatchOrder[] }>();

  for (const order of orders) {
    if (getOrderStatus(order) === "Delivered") continue;
    const date = parseRequestedDate(order.requestedWindow);
    if (!date) continue;
    const key = dateKey(date);
    const group = grouped.get(key) || { date, orders: [] };
    group.orders.push(order);
    grouped.set(key, group);
  }

  const now = formatIcsDateTime(new Date());
  const events = [...grouped.values()]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 90)
    .map((group) => {
      const endDate = new Date(group.date);
      endDate.setDate(group.date.getDate() + 1);
      const totalMinutes = group.orders.reduce(
        (sum, order) => sum + getTravelMinutes(order),
        0,
      );
      const summary = `Green Hills Deliveries: ${group.orders.length} loads (${formatTravelMinutes(totalMinutes)})`;
      const description = group.orders
        .map((order) =>
          [
            `${getOrderNumber(order)} ${order.customer}`,
            getLoadLabel(order),
            getOrderAddress(order),
            order.timePreference ? `Time: ${order.timePreference}` : "",
            order.travelSummary ||
              (getTravelMinutes(order)
                ? `Travel: ${formatTravelMinutes(getTravelMinutes(order))}`
                : ""),
          ]
            .filter(Boolean)
            .join(" | "),
        )
        .join("\n");

      return [
        "BEGIN:VEVENT",
        `UID:green-hills-delivery-${dateKey(group.date)}@contractor.ghstickets.com`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${formatIcsDate(group.date)}`,
        `DTEND;VALUE=DATE:${formatIcsDate(endDate)}`,
        foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`),
        foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`),
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Green Hills Supply//Delivery Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Green Hills Deliveries",
    "X-WR-TIMEZONE:America/Chicago",
    events,
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="green-hills-deliveries.ics"',
      "Cache-Control": "no-store",
    },
  });
}
