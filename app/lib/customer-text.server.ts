import type { DispatchOrder, DispatchRoute } from "./dispatch.server";

type TextResult = {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  provider?: string;
};

function extractPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
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

export function buildEnrouteTextMessage({
  order,
  route,
}: {
  order: DispatchOrder;
  route: DispatchRoute | null;
}) {
  const to = extractPhone(order.contact);
  const body = [
    `Green Hills Supply: your delivery is en route and should arrive in about ${getCustomerEtaText(order)}.`,
    route?.truck ? `Truck: ${route.truck}.` : "",
    "Please make sure the drop area is clear.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    to,
    body,
    ready: Boolean(to),
    reason: to ? "Text message is ready." : "No customer phone number was found in the contact field.",
  };
}

export async function sendKenectTextMessage({
  to,
  body,
  order,
  route,
}: {
  to: string;
  body: string;
  order?: DispatchOrder;
  route?: DispatchRoute | null;
}): Promise<TextResult> {
  const endpoint = process.env.KENECT_API_URL;
  const apiKey = process.env.KENECT_API_KEY;
  const locationId = process.env.KENECT_LOCATION_ID;
  const fromNumber = process.env.KENECT_FROM_NUMBER;

  if (!endpoint || !apiKey) {
    return {
      sent: false,
      skipped: true,
      provider: "kenect",
      reason: "Kenect texting is not configured. Set KENECT_API_URL and KENECT_API_KEY.",
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      locationId,
      from: fromNumber,
      to,
      phone: to,
      body,
      message: body,
      source: "green-hills-dispatch",
      metadata: {
        orderId: order?.id || null,
        orderNumber: order?.orderNumber || null,
        customer: order?.customer || null,
        routeId: route?.id || null,
        routeCode: route?.code || null,
        truck: route?.truck || null,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kenect text failed: ${errorText}`);
  }

  return { sent: true, provider: "kenect" };
}

export async function sendCustomerEnrouteText({
  order,
  route,
}: {
  order: DispatchOrder;
  route: DispatchRoute | null;
}): Promise<TextResult> {
  const message = buildEnrouteTextMessage({ order, route });
  if (!message.ready) {
    return {
      sent: false,
      skipped: true,
      provider: "kenect",
      reason: message.reason,
    };
  }

  return sendKenectTextMessage({
    to: message.to,
    body: message.body,
    order,
    route,
  });
}
