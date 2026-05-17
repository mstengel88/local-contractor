import { data } from "react-router";
import { hasAdminQuotePermissionAccess } from "../lib/admin-quote-auth.server";
import {
  getLatestDispatchDriverLocations,
  upsertDispatchDriverLocation,
} from "../lib/dispatch.server";
import { verifyDispatchTrackingToken } from "../lib/dispatch-tracking-token.server";

function getCorsHeaders(request: Request) {
  const configuredOrigin = process.env.DISPATCH_TRACKING_ALLOWED_ORIGIN || "*";
  const requestOrigin = request.headers.get("origin") || "*";
  const allowedOrigin = configuredOrigin === "*" ? requestOrigin : configuredOrigin;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Dispatch-Tracking-Token, X-Dispatch-Tracking-Session",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function hasDispatchTrackingToken(request: Request) {
  const expectedToken = process.env.DISPATCH_DRIVER_TRACKING_TOKEN || "";
  if (!expectedToken) return false;
  const providedToken = request.headers.get("x-dispatch-tracking-token") || "";
  return providedToken === expectedToken;
}

function getDispatchTrackingSession(request: Request) {
  return verifyDispatchTrackingToken(
    request.headers.get("x-dispatch-tracking-session") ||
      request.headers.get("x-dispatch-tracking-token"),
  );
}

export async function loader({ request }: { request: Request }) {
  const allowed =
    (await hasAdminQuotePermissionAccess(request, "dispatch")) ||
    (await hasAdminQuotePermissionAccess(request, "driver"));

  if (!allowed) {
    return data({ ok: false, message: "Unauthorized", locations: [] }, { status: 401 });
  }

  try {
    return data({
      ok: true,
      locations: await getLatestDispatchDriverLocations(),
    });
  } catch (error) {
    return data(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to load driver locations.",
        locations: [],
      },
      { status: 500 },
    );
  }
}

export async function action({ request }: { request: Request }) {
  const corsHeaders = getCorsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const trackingSession = getDispatchTrackingSession(request);
  const allowed =
    (await hasAdminQuotePermissionAccess(request, "driver")) ||
    hasDispatchTrackingToken(request) ||
    Boolean(trackingSession);
  if (!allowed) {
    return data({ ok: false, message: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const body = await request.json().catch(() => null);
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return data(
      { ok: false, message: "Missing GPS coordinates." },
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    const location = await upsertDispatchDriverLocation({
      routeId: trackingSession?.routeId || body?.routeId || null,
      orderId: trackingSession?.orderId || body?.orderId || null,
      driverId: trackingSession?.driverId || body?.driverId || null,
      driverName: String(trackingSession?.driverName || body?.driverName || ""),
      truck: String(trackingSession?.truck || body?.truck || ""),
      latitude,
      longitude,
      accuracy: Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null,
      heading: Number.isFinite(Number(body?.heading)) ? Number(body.heading) : null,
      speed: Number.isFinite(Number(body?.speed)) ? Number(body.speed) : null,
      capturedAt: body?.capturedAt || new Date().toISOString(),
    });

    return data({ ok: true, location }, { headers: corsHeaders });
  } catch (error) {
    return data(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to save driver location.",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}
