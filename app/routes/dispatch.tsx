import { useMemo } from "react";
import { Form, useActionData, useLoaderData, useLocation } from "react-router";
import { data, redirect } from "react-router";
import {
  adminQuoteCookie,
  getAdminQuotePassword,
  hasAdminQuoteAccess,
} from "../lib/admin-quote-auth.server";
import {
  createDispatchEmployee,
  createDispatchRoute,
  createDispatchTruck,
  createDispatchOrder,
  deleteDispatchEmployee,
  deleteDispatchOrder,
  deleteDispatchTruck,
  detectTimePreference,
  ensureSeedDispatchEmployees,
  ensureSeedDispatchOrders,
  ensureSeedDispatchRoutes,
  ensureSeedDispatchTrucks,
  getDispatchEmployees,
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
  seedDispatchEmployees,
  seedDispatchOrders,
  seedDispatchRoutes,
  seedDispatchTrucks,
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

function getCapacityError(order: DispatchOrder, truck?: DispatchTruck | null) {
  if (!truck) return "This route does not have a truck assigned yet.";

  const quantity = Number(order.quantity || 0);
  const capacity = getTruckCapacityForOrderUnit(truck, order.unit);
  const capacityLabel = getTruckCapacityLabel(order.unit);

  if (!quantity || !capacity || !capacityLabel) return "";
  if (quantity <= capacity) return "";

  return `${order.customer} needs ${quantity} ${capacityLabel}, but ${truck.label} is set to ${capacity} ${capacityLabel}.`;
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
        borderRadius: 18,
        padding: "16px 18px",
        background: "rgba(15, 23, 42, 0.92)",
        border: `1px solid ${accent}33`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
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

function getDispatchPath(url: URL) {
  return url.pathname.startsWith("/app/") ? "/app/dispatch" : "/dispatch";
}

async function loadDispatchState() {
  try {
    await ensureSeedDispatchTrucks();
    await ensureSeedDispatchEmployees();
    await ensureSeedDispatchOrders();
    await ensureSeedDispatchRoutes();
    return {
      orders: await getDispatchOrders(),
      routes: await getDispatchRoutes(),
      trucks: await getDispatchTrucks(),
      employees: await getDispatchEmployees(),
      storageReady: true,
      storageError: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load dispatch storage";
    console.error("[DISPATCH STORAGE ERROR]", message);
    return {
      orders: seedDispatchOrders,
      routes: seedDispatchRoutes,
      trucks: seedDispatchTrucks,
      employees: seedDispatchEmployees,
      storageReady: false,
      storageError: message,
    };
  }
}

export async function loader({ request }: any) {
  const url = new URL(request.url);
  const dispatchPath = getDispatchPath(url);

  if (url.searchParams.get("logout") === "1") {
    return redirect(dispatchPath, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("", { maxAge: 0 }),
      },
    });
  }

  const allowed = await hasAdminQuoteAccess(request);
  if (!allowed) {
    return data({
      allowed: false,
      orders: [],
      routes: [],
      trucks: [],
      employees: [],
      storageReady: false,
      storageError: null,
    });
  }

  let mailboxStatus = null;
  try {
    mailboxStatus = await maybeAutoPollDispatchMailbox();
  } catch (error) {
    mailboxStatus = {
      configured: true,
      imported: 0,
      skipped: 0,
      message: error instanceof Error ? error.message : "Mailbox auto-poll failed.",
    };
    console.error("[DISPATCH MAILBOX AUTO POLL ERROR]", error);
  }

  const dispatchState = await loadDispatchState();

  return data({
    allowed: true,
    mailboxStatus,
    ...dispatchState,
  });
}

export async function action({ request }: any) {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "login") {
    const password = String(form.get("password") || "");
    const expected = getAdminQuotePassword();

    if (!expected || password !== expected) {
      return data(
        {
          allowed: false,
          loginError: "Invalid password",
          orders: [],
          routes: [],
          trucks: [],
          employees: [],
        },
        { status: 401 },
      );
    }

    const dispatchState = await loadDispatchState();

    return data(
      {
        allowed: true,
        loginError: null,
        ...dispatchState,
      },
      {
        headers: {
          "Set-Cookie": await adminQuoteCookie.serialize("ok"),
        },
      },
    );
  }

  const allowed = await hasAdminQuoteAccess(request);
  if (!allowed) {
    return data(
      {
        allowed: false,
        loginError: "Please log in",
        orders: [],
        routes: [],
        trucks: [],
        employees: [],
      },
      { status: 401 },
    );
  }

  try {
    if (intent === "create-order") {
      const customer = String(form.get("customer") || "").trim();
      const address = String(form.get("address") || "").trim();
      const material = String(form.get("material") || "").trim();

      if (!customer || !address || !material) {
        const dispatchState = await loadDispatchState();
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
        city: String(form.get("city") || "").trim(),
        material,
        quantity: String(form.get("quantity") || "").trim(),
        unit: String(form.get("unit") || "Ton").trim() || "Ton",
        requestedWindow: String(form.get("requestedWindow") || "").trim(),
        timePreference:
          String(form.get("timePreference") || "").trim() ||
          detectTimePreference(String(form.get("notes") || "")),
        truckPreference: String(form.get("truckPreference") || "").trim(),
        notes: String(form.get("notes") || "").trim(),
      });

      const dispatchState = await loadDispatchState();

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
      if (!parsed.address || !parsed.material) {
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

      const created = await createDispatchOrder({
        source: "email",
        orderNumber: parsed.orderNumber,
        customer: parsed.customer,
        contact: parsed.contact,
        address: parsed.address,
        city: parsed.city,
        material: parsed.material,
        quantity: parsed.quantity,
        unit: (await getDispatchUnitForMaterial(parsed.material)) || parsed.unit,
        requestedWindow: parsed.requestedWindow,
        timePreference: parsed.timePreference,
        truckPreference: parsed.truckPreference,
        notes: parsed.notes || "Parsed from order email.",
        emailSubject: parsed.subject,
        rawEmail,
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Parsed email order for ${created.customer}.`,
        selectedOrderId: created.id,
        ...dispatchState,
      });
    }

    if (intent === "update-order") {
      const orderId = String(form.get("orderId") || "").trim();
      const customer = String(form.get("customer") || "").trim();
      const address = String(form.get("address") || "").trim();
      const material = String(form.get("material") || "").trim();
      const rawStatus = String(form.get("status") || "new").trim();
      const status =
        rawStatus === "scheduled" || rawStatus === "hold" || rawStatus === "delivered"
          ? rawStatus
          : "new";

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
        city: String(form.get("city") || "").trim(),
        material,
        quantity: String(form.get("quantity") || "").trim(),
        unit: String(form.get("unit") || "").trim() || "Unit",
        requestedWindow:
          String(form.get("requestedWindow") || "").trim() || "Needs scheduling",
        timePreference:
          String(form.get("timePreference") || "").trim() ||
          detectTimePreference(String(form.get("notes") || "")),
        truckPreference: String(form.get("truckPreference") || "").trim() || null,
        notes: String(form.get("notes") || "").trim(),
        status,
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Updated ${updated.customer}.`,
        selectedOrderId: updated.id,
        ...dispatchState,
      });
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
      const capacityError = selectedOrder
        ? getCapacityError(selectedOrder, selectedTruck)
        : "Order was not found.";

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

      const stopSequence = await getNextRouteStopSequence(routeId);

      await updateDispatchOrder(orderId, {
        status: "scheduled",
        assignedRouteId: routeId,
        stopSequence,
        deliveryStatus: "not_started",
        eta: String(form.get("eta") || "").trim() || null,
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Order assigned to route.",
        selectedOrderId: orderId,
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

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Route stop sequence updated.",
        selectedOrderId: routeOrders[0]?.id,
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

      const dispatchState = await loadDispatchState();

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

      await updateDispatchOrder(orderId, {
        status: "new",
        assignedRouteId: null,
        stopSequence: null,
        deliveryStatus: "not_started",
        eta: null,
      });

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: "Order moved back to inbox.",
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

      await updateDispatchOrder(orderId, patch);

      const dispatchState = await loadDispatchState();

      return data({
        allowed: true,
        ok: true,
        message: `Stop marked ${getDeliveryStatusLabel(deliveryStatus).toLowerCase()}.`,
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
  const location = useLocation();
  const allowed = actionData?.allowed ?? loaderData.allowed;
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const quoteHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const reviewHref = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  const mobileHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const logoutHref = `${dispatchHref}?logout=1`;
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const dispatchRoutes = (actionData?.routes ?? loaderData.routes ?? []) as DispatchRoute[];
  const trucks = (actionData?.trucks ?? loaderData.trucks ?? []) as DispatchTruck[];
  const employees = (actionData?.employees ?? loaderData.employees ?? []) as DispatchEmployee[];
  const storageReady = actionData?.storageReady ?? loaderData.storageReady ?? false;
  const storageError = actionData?.storageError ?? loaderData.storageError ?? null;
  const mailboxStatus = actionData?.mailboxStatus ?? loaderData.mailboxStatus ?? null;

  const searchParams = new URLSearchParams(location.search);
  const rawView = searchParams.get("view") || "dashboard";
  const activeView =
    rawView === "orders" ||
    rawView === "routes" ||
    rawView === "trucks" ||
    rawView === "employees" ||
    rawView === "delivered"
      ? rawView
      : "dashboard";
  const querySelectedOrderId = searchParams.get("order");
  const selectedOrderId = actionData?.selectedOrderId || querySelectedOrderId || orders[0]?.id;

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

  const activeOrders = orders.filter(
    (order) => order.status !== "delivered" && order.deliveryStatus !== "delivered",
  );
  const inboxOrders = orders.filter((order) => !order.assignedRouteId && order.status === "new");
  const holdOrders = orders.filter((order) => order.status === "hold");
  const scheduledOrders = orders.filter(
    (order) =>
      order.assignedRouteId &&
      order.status !== "delivered" &&
      order.deliveryStatus !== "delivered",
  );
  const deliveredOrders = orders.filter((order) => order.status === "delivered" || order.deliveryStatus === "delivered");
  const drivers = employees.filter((employee) => employee.role === "driver");
  const helpers = employees.filter((employee) => employee.role === "helper");
  const dispatchViewHref = (view: string) => `${dispatchHref}?view=${view}`;
  const orderEditorOpen =
    activeView === "orders" &&
    Boolean(selectedOrder && (querySelectedOrderId || actionData?.selectedOrderId));
  const dispatchDetailOpen =
    activeView === "dashboard" &&
    Boolean(selectedOrder && (querySelectedOrderId || actionData?.selectedOrderId));

  if (!allowed) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.shell, maxWidth: 520 }}>
          <div style={styles.loginCard}>
            <h1 style={styles.title}>Dispatch</h1>
            <p style={styles.subtitle}>
              Enter the admin password to open the contractor dispatch workspace.
            </p>

            <Form method="post" autoComplete="off" style={{ marginTop: 22 }}>
              <input type="hidden" name="intent" value="login" />
              <label style={styles.label}>Admin Password</label>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                style={styles.input}
              />

              {actionData?.loginError ? (
                <div style={styles.statusErr}>{actionData.loginError}</div>
              ) : null}

              <button
                type="submit"
                style={{ ...styles.primaryButton, width: "100%", marginTop: 16 }}
              >
                Open Dispatch
              </button>
            </Form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.appFrame}>
        <aside style={styles.sidebar}>
          <div style={styles.brandBlock}>
            <div style={styles.brandMark}>GH</div>
            <div>
              <div style={styles.brandTitle}>Contractor</div>
              <div style={styles.brandSub}>Dispatch v2.0</div>
            </div>
          </div>

          <nav style={styles.sideNav}>
            <a href={dispatchViewHref("dashboard")} style={styles.sideNavLink(activeView === "dashboard")}>Dashboard</a>
            <a href={dispatchViewHref("orders")} style={styles.sideNavLink(activeView === "orders")}>Orders</a>
            <a href={dispatchViewHref("routes")} style={styles.sideNavLink(activeView === "routes")}>Routes</a>
            <a href={dispatchViewHref("trucks")} style={styles.sideNavLink(activeView === "trucks")}>Trucks</a>
            <a href={dispatchViewHref("employees")} style={styles.sideNavLink(activeView === "employees")}>Employees</a>
            <a href={dispatchViewHref("delivered")} style={styles.sideNavLink(activeView === "delivered")}>Delivered</a>
          </nav>

          <div style={styles.sidebarFooter}>
            <a href={driverHref} style={styles.sideUtility}>Driver Route</a>
            <a href={quoteHref} style={styles.sideUtility}>Quote Tool</a>
            <a href={logoutHref} style={styles.sideUtility}>Log Out</a>
          </div>
        </aside>

        <main style={styles.shell}>
        <div id="dashboard" style={styles.hero}>
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

        <div style={styles.metricsGrid}>
          {metricCard("Inbox", String(inboxOrders.length), "#f97316")}
          {metricCard("Scheduled", String(scheduledOrders.length), "#22c55e")}
          {metricCard("On Hold", String(holdOrders.length), "#eab308")}
          {metricCard("Delivered", String(deliveredOrders.length), "#38bdf8")}
        </div>

        {activeView === "orders" ? (
          <div style={styles.focusGrid}>
            <div id="orders" style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Orders</h2>
                  <p style={styles.panelSub}>View imported, manual, scheduled, and held dispatch orders.</p>
                </div>
                <div style={styles.headerPill}>{activeOrders.length} orders</div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {activeOrders.map((order) => {
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
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Add / Import Order</h2>
                  <p style={styles.panelSub}>Create a dispatch card manually or poll the mailbox.</p>
                </div>
              </div>

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
                    <input name="address" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>City</label>
                    <input name="city" style={styles.input} />
                  </div>
                </div>
                <div style={styles.formGridThree}>
                  <div>
                    <label style={styles.label}>Material</label>
                    <input name="material" style={styles.input} />
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
                    <input name="requestedWindow" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Time Preference</label>
                    <select name="timePreference" style={styles.input}>
                      <option value="">Infer from notes</option>
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
            </div>
          </div>
        ) : null}

        {orderEditorOpen && selectedOrder ? (
          <div style={styles.modalOverlay}>
            <div style={styles.orderModal}>
              <div style={styles.modalHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Edit Selected Order</h2>
                  <p style={styles.panelSub}>
                    Update order details or delete the selected dispatch card.
                  </p>
                </div>
                <a href={dispatchViewHref("orders")} style={styles.modalCloseButton}>
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
                        defaultValue={selectedOrder.requestedWindow}
                        style={styles.input}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Time Preference</label>
                      <select
                        name="timePreference"
                        defaultValue={selectedOrder.timePreference || ""}
                        style={styles.input}
                      >
                        <option value="">Infer from notes</option>
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

        {activeView === "delivered" ? (
          <div style={styles.focusGrid}>
            <div id="delivered" style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Delivered</h2>
                  <p style={styles.panelSub}>Completed orders that drivers marked delivered.</p>
                </div>
                <div style={styles.headerPill}>{deliveredOrders.length} delivered</div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {deliveredOrders.length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>No delivered orders yet.</div>
                ) : (
                  deliveredOrders.map((order) => {
                    const route = routes.find((entry) => entry.id === order.assignedRouteId);
                    return (
                      <a
                        key={order.id}
                        href={`${dispatchHref}?view=delivered&order=${encodeURIComponent(order.id)}`}
                        style={{ ...styles.queueCard, textDecoration: "none" }}
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
                      </a>
                    );
                  })
                )}
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
                <div style={styles.headerPill}>{trucks.length} trucks</div>
              </div>
              <div style={styles.resourceList}>
                {trucks.map((truck) => (
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
                <div style={styles.headerPill}>{employees.length} people</div>
              </div>
              <div style={styles.resourceList}>
                {employees.map((employee) => (
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
                <div style={styles.headerPill}>{routes.length} routes</div>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {routes.map((route) => (
                  <Form key={route.id} method="post" style={styles.routeCard(route.color)}>
                    <input type="hidden" name="intent" value="update-route" />
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
                      <div style={{ display: "flex", alignItems: "flex-end" }}>
                        <button type="submit" style={{ ...styles.secondaryButton, width: "100%" }}>
                          Save Route Assignments
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
            <div id="orders" style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Email Intake Queue</h2>
                  <p style={styles.panelSub}>
                    Orders that came in by email or were typed in manually can be reviewed and routed here.
                  </p>
                </div>
                <div style={styles.headerPill}>Today</div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {activeOrders.map((order) => {
                  const active = order.id === selectedOrder?.id;
                  const route = routes.find((entry) => entry.id === order.assignedRouteId);
                  return (
                    <a
                      key={order.id}
                      href={`${dispatchHref}?order=${encodeURIComponent(order.id)}`}
                      style={{
                        ...styles.queueCard,
                        borderColor: active ? "#38bdf8" : "rgba(51, 65, 85, 0.92)",
                        boxShadow: active
                          ? "0 0 0 1px rgba(56, 189, 248, 0.45)"
                          : "none",
                        textDecoration: "none",
                      }}
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

                      <div style={styles.queueFooter}>
                        <span>{order.requestedWindow}</span>
                        <span>
                          {route
                            ? `${route.truck} / ${getDeliveryStatusLabel(order.deliveryStatus)}`
                            : "Unassigned"}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
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
                <div style={styles.headerPill}>Live Board</div>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {routes.map((route) => (
                  <div key={route.id} style={styles.routeCard(route.color)}>
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
                        style={styles.assignButton}
                      >
                        Driver View
                      </a>
                      {selectedOrder ? (
                        selectedOrder.assignedRouteId === route.id ? (
                          <Form method="post" style={styles.assignForm}>
                            <input type="hidden" name="intent" value="unassign-order" />
                            <input type="hidden" name="orderId" value={selectedOrder.id} />
                            <button type="submit" style={styles.secondaryButton}>
                              Unassign Selected
                            </button>
                          </Form>
                        ) : (
                          <Form method="post" style={styles.assignForm}>
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

                    <div style={styles.routeStats}>
                      <span>{route.shift}</span>
                      <span>{route.stops} stops</span>
                      <span>{route.loadSummary || "No assigned loads yet"}</span>
                    </div>

                    {route.orders.length ? (
                      <div style={styles.stopList}>
                        {route.orders.map((order) => (
                          <a
                            key={order.id}
                            href={`${dispatchHref}?order=${encodeURIComponent(order.id)}`}
                            style={styles.stopRow}
                          >
                            <span style={styles.stopNumber}>
                              {order.stopSequence || "-"}
                            </span>
                            <span style={styles.stopMain}>
                              <strong>{order.customer}</strong>
                              <small>{order.city} · {order.material}</small>
                            </span>
                            <span
                              style={styles.stopStatus(
                                getDeliveryStatusColor(order.deliveryStatus),
                              )}
                            >
                              {getDeliveryStatusLabel(order.deliveryStatus)}
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : null}

                    {route.orders.length ? (
                      <Form method="post" style={styles.sequenceForm}>
                        <input type="hidden" name="intent" value="sequence-route" />
                        <input type="hidden" name="routeId" value={route.id} />
                        <select name="sequenceMode" style={styles.compactSelect}>
                          <option value="city">Sequence by city/address</option>
                          <option value="address">Sequence by address</option>
                          <option value="reverse">Reverse current order</option>
                        </select>
                        <button type="submit" style={styles.assignButton}>
                          Sequence Stops
                        </button>
                      </Form>
                    ) : null}
                  </div>
                ))}
              </div>

            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Route Map Preview</h2>
                  <p style={styles.panelSub}>
                    Visual route planning mockup for the first dispatch tab. We can wire live geocoding and stop sequencing next.
                  </p>
                </div>
              </div>

              <div style={styles.mapStage}>
                <div style={styles.mapGrid} />
                <div style={styles.mapWater} />
                {routes.map((route, index) => (
                  <div
                    key={route.id}
                    style={{
                      ...styles.mapRoute(route.color),
                      top: 70 + index * 80,
                      left: 40 + index * 90,
                      width: 180 + index * 15,
                    }}
                  />
                ))}
                {routes.flatMap((route, routeIndex) =>
                  route.orders.map((order, orderIndex) => (
                    <div
                      key={`${route.id}-${order.id}`}
                      title={`${order.customer} · ${route.truck}`}
                      style={{
                        ...styles.mapStop(route.color),
                        top: 82 + routeIndex * 80 + orderIndex * 24,
                        left: 90 + routeIndex * 92 + orderIndex * 34,
                      }}
                    >
                      {orderIndex + 1}
                    </div>
                  )),
                )}
                <div style={styles.mapLegend}>
                  {routes.map((route) => (
                    <div
                      key={route.id}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div style={styles.routeColor(route.color)} />
                      <span>{route.truck}</span>
                    </div>
                  ))}
                </div>
              </div>
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
                <a href={dispatchViewHref("dashboard")} style={styles.modalCloseButton}>
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
                        {selectedOrder.timePreference || "No preference"}
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
    background:
      "radial-gradient(circle at top left, rgba(14, 165, 233, 0.14), transparent 26%), radial-gradient(circle at top right, rgba(20, 184, 166, 0.12), transparent 24%), linear-gradient(180deg, #09101d 0%, #0f172a 42%, #020617 100%)",
    color: "#f8fafc",
    padding: "18px",
    fontFamily:
      '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } as const,
  appFrame: {
    maxWidth: 1740,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "230px minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
  } as const,
  sidebar: {
    position: "sticky" as const,
    top: 18,
    minHeight: "calc(100vh - 36px)",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: 22,
    padding: 18,
    borderRadius: 28,
    border: "1px solid rgba(30, 41, 59, 0.95)",
    background: "linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.96))",
    boxShadow: "0 24px 60px rgba(2, 6, 23, 0.42)",
  } as const,
  brandBlock: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  } as const,
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 16,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0ea5e9, #14b8a6)",
    color: "#ecfeff",
    fontWeight: 900,
    boxShadow: "0 12px 28px rgba(14, 165, 233, 0.28)",
  } as const,
  brandTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  brandSub: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
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
      borderRadius: 16,
      color: active ? "#ecfeff" : "#cbd5e1",
      textDecoration: "none",
      fontWeight: 800,
      border: active
        ? "1px solid rgba(14, 165, 233, 0.42)"
        : "1px solid transparent",
      background: active
        ? "linear-gradient(135deg, rgba(14, 165, 233, 0.24), rgba(20, 184, 166, 0.16))"
        : "rgba(15, 23, 42, 0.35)",
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
    border: "1px solid rgba(51, 65, 85, 0.82)",
    background: "rgba(2, 6, 23, 0.5)",
    color: "#94a3b8",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 800,
  } as const,
  shell: {
    display: "grid",
    gap: 20,
  } as const,
  loginCard: {
    background: "rgba(15, 23, 42, 0.92)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    borderRadius: 28,
    padding: 28,
    boxShadow: "0 30px 60px rgba(2, 6, 23, 0.46)",
  } as const,
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 18,
    padding: 22,
    borderRadius: 30,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background:
      "radial-gradient(circle at 10% 20%, rgba(14, 165, 233, 0.18), transparent 24%), linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.92))",
    boxShadow: "0 30px 60px rgba(2, 6, 23, 0.45)",
  } as const,
  kicker: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.18em",
  },
  title: {
    margin: "8px 0 0",
    fontSize: "2.35rem",
    lineHeight: 1.04,
    letterSpacing: "-0.04em",
    fontWeight: 900,
  },
  subtitle: {
    margin: "12px 0 0",
    color: "#94a3b8",
    fontSize: 16,
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
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.9)",
    color: "#e2e8f0",
    textDecoration: "none",
    fontWeight: 700,
  } as const,
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 14,
  } as const,
  workspaceGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 0.9fr) minmax(520px, 1.25fr)",
    gap: 18,
    alignItems: "start",
  } as const,
  focusGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.1fr) minmax(360px, 0.9fr)",
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
    borderRadius: 28,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.92)",
    padding: 22,
    boxShadow: "0 24px 50px rgba(2, 6, 23, 0.38)",
  } as const,
  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 80,
    display: "grid",
    placeItems: "center",
    padding: 22,
    background: "rgba(2, 6, 23, 0.72)",
    backdropFilter: "blur(10px)",
  },
  orderModal: {
    width: "min(920px, 100%)",
    maxHeight: "calc(100vh - 44px)",
    overflowY: "auto" as const,
    borderRadius: 30,
    border: "1px solid rgba(56, 189, 248, 0.32)",
    background:
      "linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.96))",
    padding: 24,
    boxShadow: "0 34px 90px rgba(2, 6, 23, 0.68)",
  } as const,
  dispatchModal: {
    width: "min(980px, 100%)",
    maxHeight: "calc(100vh - 44px)",
    overflowY: "auto" as const,
    borderRadius: 30,
    border: "1px solid rgba(56, 189, 248, 0.32)",
    background:
      "linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.96))",
    padding: 24,
    boxShadow: "0 34px 90px rgba(2, 6, 23, 0.68)",
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
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.72)",
    color: "#e2e8f0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 800,
  } as const,
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
  headerPill: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(56, 189, 248, 0.35)",
    color: "#7dd3fc",
    background: "rgba(14, 165, 233, 0.12)",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  queueCard: {
    width: "100%",
    textAlign: "left" as const,
    borderRadius: 18,
    border: "1px solid rgba(51, 65, 85, 0.92)",
    background: "rgba(2, 6, 23, 0.72)",
    padding: 16,
    color: "#f8fafc",
    cursor: "pointer",
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
  queueFooter: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#64748b",
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
    background: "rgba(15, 23, 42, 0.94)",
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
    background: "rgba(15, 23, 42, 0.94)",
    cursor: "pointer",
  },
  compactInput: {
    width: 82,
    boxSizing: "border-box" as const,
    minHeight: 42,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.94)",
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
    background: "rgba(15, 23, 42, 0.94)",
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
  secondaryButton: {
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.72)",
    color: "#e2e8f0",
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
  routeCard: (color: string) =>
    ({
      borderRadius: 20,
      padding: 18,
      border: `1px solid ${color}44`,
      background:
        "linear-gradient(145deg, rgba(2, 6, 23, 0.86), rgba(15, 23, 42, 0.98))",
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 18px 28px ${color}12`,
    }) as const,
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
    background: "rgba(2, 6, 23, 0.62)",
    border: "1px solid rgba(51, 65, 85, 0.82)",
    color: "#e2e8f0",
  } as const,
  resourcePill: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 28,
    padding: "0 10px",
    borderRadius: 999,
    background: "rgba(2, 6, 23, 0.72)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
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
    gridTemplateColumns: "32px minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(2, 6, 23, 0.62)",
    border: "1px solid rgba(51, 65, 85, 0.78)",
    textDecoration: "none",
    color: "#f8fafc",
  } as const,
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(15, 23, 42, 0.92)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
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
    background: "rgba(2, 6, 23, 0.62)",
    border: "1px solid rgba(51, 65, 85, 0.82)",
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
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.94)",
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 800,
  } as const,
  mapStage: {
    position: "relative" as const,
    minHeight: 380,
    borderRadius: 24,
    overflow: "hidden",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background:
      "radial-gradient(circle at 10% 10%, rgba(255,255,255,0.08), transparent 18%), linear-gradient(180deg, #d6e4f2 0%, #bdd6ea 36%, #bed5d5 100%)",
  },
  mapGrid: {
    position: "absolute" as const,
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(15,23,42,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.08) 1px, transparent 1px)",
    backgroundSize: "58px 58px",
  },
  mapWater: {
    position: "absolute" as const,
    right: -20,
    top: 40,
    width: 220,
    height: 260,
    borderRadius: "54% 46% 42% 58% / 48% 58% 42% 52%",
    background: "rgba(56, 189, 248, 0.22)",
    filter: "blur(1px)",
  },
  mapRoute: (color: string) =>
    ({
      position: "absolute" as const,
      height: 0,
      borderTop: `8px solid ${color}`,
      borderRadius: 999,
      transform: "rotate(-12deg)",
      opacity: 0.88,
    }) as const,
  mapStop: (color: string) =>
    ({
      position: "absolute" as const,
      width: 28,
      height: 28,
      borderRadius: 999,
      background: color,
      color: "#fff",
      fontSize: 12,
      fontWeight: 900,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 8px 18px ${color}55`,
    }) as const,
  mapLegend: {
    position: "absolute" as const,
    left: 16,
    bottom: 16,
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: 16,
    background: "rgba(15, 23, 42, 0.88)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    color: "#e2e8f0",
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
    color: "#64748b",
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
    background: "rgba(2, 6, 23, 0.72)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
  } as const,
  todoItem: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    color: "#e2e8f0",
    lineHeight: 1.55,
  } as const,
  todoDot: {
    width: 8,
    height: 8,
    marginTop: 7,
    borderRadius: 999,
    background: "#38bdf8",
    boxShadow: "0 0 0 5px rgba(56, 189, 248, 0.15)",
    flex: "0 0 auto",
  } as const,
  statusOk: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(22, 163, 74, 0.15)",
    border: "1px solid rgba(34, 197, 94, 0.5)",
    color: "#dcfce7",
    fontWeight: 700,
  } as const,
  statusWarn: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(234, 179, 8, 0.14)",
    border: "1px solid rgba(250, 204, 21, 0.35)",
    color: "#fef3c7",
    fontWeight: 600,
    lineHeight: 1.6,
  } as const,
  statusErr: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(220, 38, 38, 0.15)",
    border: "1px solid rgba(248, 113, 113, 0.5)",
    color: "#fee2e2",
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
    background: "rgba(2, 6, 23, 0.28)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
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
