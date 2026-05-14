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

function getOrderExternalId(order?: DispatchOrder) {
  if (!order) return undefined;
  return order.orderNumber ? `dispatch-order-${order.orderNumber}` : order.id;
}

function getKenectMessageEndpoint() {
  const rawEndpoint =
    process.env.KENECT_MESSAGES_URL ||
    process.env.KENECT_API_URL ||
    process.env.KENECT_API_BASE_URL ||
    "https://integrations-api.kenect.com";

  try {
    const url = new URL(rawEndpoint);
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    const looksLikeFullMessageEndpoint = normalizedPath === "/api/v1/messages";
    const looksLikeDocsUrl =
      normalizedPath.startsWith("/q/swagger-ui") ||
      normalizedPath.startsWith("/q/openapi");

    if (looksLikeFullMessageEndpoint) return url.toString();

    if (!looksLikeDocsUrl && normalizedPath && normalizedPath !== "/") {
      return url.toString();
    }

    return `${url.origin}/api/v1/messages`;
  } catch {
    return "https://integrations-api.kenect.com/api/v1/messages";
  }
}

function getKenectHeaders() {
  const apiKey = process.env.KENECT_API_KEY || "";
  const apiSecret = process.env.KENECT_API_SECRET || "";
  const locationId = process.env.KENECT_LOCATION_ID || "";
  const partnerLocationId = process.env.KENECT_PARTNER_LOCATION_ID || "";
  const partnerLocationZip = process.env.KENECT_PARTNER_LOCATION_ZIP || "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
    "X-Api-Secret": apiSecret,
  };

  if (locationId) headers["X-Location-Id"] = locationId;
  if (partnerLocationId) headers["X-Partner-Location-Id"] = partnerLocationId;
  if (partnerLocationZip) headers["X-Partner-Location-Zip"] = partnerLocationZip;

  return {
    headers,
    configured: Boolean(apiKey && apiSecret && (locationId || partnerLocationId)),
  };
}

function formatKenectError(status: number, responseText: string) {
  const trimmed = responseText.trim();
  const suffix =
    status === 404
      ? " Check that KENECT_API_BASE_URL is https://integrations-api.kenect.com and that the location ID belongs to your Kenect account."
      : "";
  return `Kenect text failed (${status}): ${trimmed || "No response body."}${suffix}`;
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
    route?.code ? `Route: ${route.code}.` : "",
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
  const endpoint = getKenectMessageEndpoint();
  const { headers, configured } = getKenectHeaders();

  if (!configured) {
    return {
      sent: false,
      skipped: true,
      provider: "kenect",
      reason:
        "Kenect texting is not configured. Set KENECT_API_KEY, KENECT_API_SECRET, and KENECT_LOCATION_ID.",
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contactName: order?.customer || undefined,
      contactPhone: to,
      messageBody: body,
      externalContactId: getOrderExternalId(order),
      sentByUserEmail: process.env.KENECT_SENT_BY_USER_EMAIL || undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(formatKenectError(response.status, errorText));
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
