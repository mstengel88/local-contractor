import { data } from "react-router";
import { hasAdminQuotePermissionAccess } from "../lib/admin-quote-auth.server";
import {
  getLatestDispatchDriverLocations,
  upsertDispatchDriverLocation,
} from "../lib/dispatch.server";

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
  const allowed = await hasAdminQuotePermissionAccess(request, "driver");
  if (!allowed) {
    return data({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return data({ ok: false, message: "Missing GPS coordinates." }, { status: 400 });
  }

  try {
    const location = await upsertDispatchDriverLocation({
      routeId: body?.routeId || null,
      orderId: body?.orderId || null,
      driverId: body?.driverId || null,
      driverName: String(body?.driverName || ""),
      truck: String(body?.truck || ""),
      latitude,
      longitude,
      accuracy: Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null,
      heading: Number.isFinite(Number(body?.heading)) ? Number(body.heading) : null,
      speed: Number.isFinite(Number(body?.speed)) ? Number(body.speed) : null,
      capturedAt: body?.capturedAt || new Date().toISOString(),
    });

    return data({ ok: true, location });
  } catch (error) {
    return data(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to save driver location.",
      },
      { status: 500 },
    );
  }
}
