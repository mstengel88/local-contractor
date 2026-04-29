import { getDispatchOrders, type DispatchOrder } from "../lib/dispatch.server";

function isAuthorized(request: Request) {
  const expected =
    process.env.DISPATCH_CALENDAR_FEED_SECRET ||
    process.env.DISPATCH_POLL_SECRET ||
    "";
  if (!expected) return false;

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-dispatch-calendar-secret") ||
    url.searchParams.get("secret") ||
    "";

  return provided === expected;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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

export async function loader({ request }: { request: Request }) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
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

  const items = [...grouped.values()]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 45)
    .map((group) => {
      const totalMinutes = group.orders.reduce(
        (sum, order) => sum + getTravelMinutes(order),
        0,
      );
      const title = `${formatDateLabel(group.date)} - ${group.orders.length} deliveries - ${formatTravelMinutes(totalMinutes)}`;
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

      return `
        <item>
          <title>${escapeXml(title)}</title>
          <link>${escapeXml(`${url.origin}/calendar?date=${dateKey(group.date)}`)}</link>
          <guid isPermaLink="false">delivery-calendar-${escapeXml(dateKey(group.date))}</guid>
          <pubDate>${group.date.toUTCString()}</pubDate>
          <description>${escapeXml(description)}</description>
        </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Green Hills Delivery Calendar</title>
    <link>${escapeXml(`${url.origin}/calendar`)}</link>
    <description>Requested delivery dates with daily order counts and total delivery time.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
