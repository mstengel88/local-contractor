import { supabaseAdmin } from "./supabase.server";

export type DispatchSource = "email" | "manual";
export type DispatchStatus = "new" | "scheduled" | "hold";

export type DispatchOrder = {
  id: string;
  source: DispatchSource;
  customer: string;
  contact: string;
  address: string;
  city: string;
  material: string;
  quantity: string;
  unit: string;
  requestedWindow: string;
  truckPreference?: string | null;
  notes: string;
  status: DispatchStatus;
  assignedRouteId?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DispatchRoute = {
  id: string;
  code: string;
  truck: string;
  driver: string;
  helper: string;
  color: string;
  shift: string;
  region: string;
  isActive?: boolean;
  created_at?: string;
  updated_at?: string;
};

export const seedDispatchRoutes: DispatchRoute[] = [
  {
    id: "route-north",
    code: "R-12",
    truck: "Truck 12",
    driver: "Paul",
    helper: "Manny",
    color: "#f97316",
    shift: "6:30a - 3:30p",
    region: "North / Menomonee Falls",
    isActive: true,
  },
  {
    id: "route-west",
    code: "R-18",
    truck: "Truck 18",
    driver: "Peter",
    helper: "Luis",
    color: "#06b6d4",
    shift: "7:00a - 4:00p",
    region: "West / Waukesha",
    isActive: true,
  },
  {
    id: "route-south",
    code: "R-05",
    truck: "Truck 05",
    driver: "Andrew",
    helper: "Nate",
    color: "#22c55e",
    shift: "6:00a - 2:30p",
    region: "South / Oak Creek",
    isActive: true,
  },
];

export const seedDispatchOrders: DispatchOrder[] = [
  {
    id: "D-24081",
    source: "email",
    customer: "Oak Creek Plaza",
    contact: "shipping@oakcreekplaza.com",
    address: "2543 W Applebrook Lane",
    city: "Oak Creek, WI",
    material: "Coarse Torpedo Sand",
    quantity: "12",
    unit: "TonS",
    requestedWindow: "Today 9:00a - 11:00a",
    notes: "Forklift on site. Call before arrival.",
    status: "new",
  },
  {
    id: "D-24082",
    source: "email",
    customer: "Merton Build Group",
    contact: "dispatch@mertonbuild.com",
    address: "N67W28345 Silver Spring Dr",
    city: "Sussex, WI",
    material: "Premium Mulch",
    quantity: "22",
    unit: "YardS",
    requestedWindow: "Today 10:30a - 1:00p",
    truckPreference: "Walking floor",
    notes: "Back alley drop. Need photo after unload.",
    status: "scheduled",
    assignedRouteId: "route-west",
  },
  {
    id: "D-24083",
    source: "manual",
    customer: "Village of Men Falls",
    contact: "yard@menfalls.gov",
    address: "W156N8480 Pilgrim Rd",
    city: "Menomonee Falls, WI",
    material: "Road Salt",
    quantity: "8",
    unit: "TonS",
    requestedWindow: "Tomorrow 7:00a - 9:00a",
    notes: "Municipal account. Ticket copy required.",
    status: "hold",
  },
  {
    id: "D-24084",
    source: "email",
    customer: "Lakeview Landscape",
    contact: "ops@lakeviewlandscape.com",
    address: "2211 Scenic Ridge Rd",
    city: "Delafield, WI",
    material: "Screened Topsoil",
    quantity: "16",
    unit: "YardS",
    requestedWindow: "Today 1:00p - 3:00p",
    notes: "Split delivery with second stop if needed.",
    status: "scheduled",
    assignedRouteId: "route-north",
  },
];

const ORDERS_TABLE = "dispatch_orders";
const ROUTES_TABLE = "dispatch_routes";

function normalizeOrder(row: any): DispatchOrder {
  return {
    id: String(row.id),
    source: row.source === "email" ? "email" : "manual",
    customer: String(row.customer || ""),
    contact: String(row.contact || ""),
    address: String(row.address || ""),
    city: String(row.city || ""),
    material: String(row.material || ""),
    quantity: String(row.quantity || ""),
    unit: String(row.unit || ""),
    requestedWindow: String(row.requested_window || ""),
    truckPreference: row.truck_preference || null,
    notes: String(row.notes || ""),
    status:
      row.status === "scheduled" || row.status === "hold" ? row.status : "new",
    assignedRouteId: row.assigned_route_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeRoute(row: any): DispatchRoute {
  return {
    id: String(row.id),
    code: String(row.code || ""),
    truck: String(row.truck || ""),
    driver: String(row.driver || ""),
    helper: String(row.helper || ""),
    color: String(row.color || "#38bdf8"),
    shift: String(row.shift || ""),
    region: String(row.region || ""),
    isActive: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function formatSupabaseError(error: any) {
  if (!error) return "Unknown storage error";
  return error.message || error.details || error.hint || "Unknown storage error";
}

export async function ensureSeedDispatchOrders() {
  const { data, error } = await supabaseAdmin
    .from(ORDERS_TABLE)
    .select("id", { count: "exact", head: false })
    .limit(1);

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if ((data || []).length > 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin.from(ORDERS_TABLE).insert(
    seedDispatchOrders.map((order) => ({
      id: order.id,
      source: order.source,
      customer: order.customer,
      contact: order.contact,
      address: order.address,
      city: order.city,
      material: order.material,
      quantity: order.quantity,
      unit: order.unit,
      requested_window: order.requestedWindow,
      truck_preference: order.truckPreference || null,
      notes: order.notes,
      status: order.status,
      assigned_route_id: order.assignedRouteId || null,
    })),
  );

  if (insertError) {
    throw new Error(formatSupabaseError(insertError));
  }
}

export async function ensureSeedDispatchRoutes() {
  const { data, error } = await supabaseAdmin
    .from(ROUTES_TABLE)
    .select("id", { count: "exact", head: false })
    .limit(1);

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if ((data || []).length > 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin.from(ROUTES_TABLE).insert(
    seedDispatchRoutes.map((route) => ({
      id: route.id,
      code: route.code,
      truck: route.truck,
      driver: route.driver,
      helper: route.helper,
      color: route.color,
      shift: route.shift,
      region: route.region,
      is_active: route.isActive !== false,
    })),
  );

  if (insertError) {
    throw new Error(formatSupabaseError(insertError));
  }
}

export async function getDispatchOrders() {
  const { data, error } = await supabaseAdmin
    .from(ORDERS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return (data || []).map(normalizeOrder);
}

export async function getDispatchRoutes() {
  const { data, error } = await supabaseAdmin
    .from(ROUTES_TABLE)
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return (data || []).map(normalizeRoute);
}

export async function createDispatchOrder(input: {
  source: DispatchSource;
  customer: string;
  contact?: string;
  address: string;
  city?: string;
  material: string;
  quantity?: string;
  unit?: string;
  requestedWindow?: string;
  truckPreference?: string;
  notes?: string;
}) {
  const id = `D-${Date.now().toString().slice(-6)}`;

  const { data, error } = await supabaseAdmin
    .from(ORDERS_TABLE)
    .insert({
      id,
      source: input.source,
      customer: input.customer,
      contact: input.contact || "",
      address: input.address,
      city: input.city || "",
      material: input.material,
      quantity: input.quantity || "",
      unit: input.unit || "TonS",
      requested_window: input.requestedWindow || "Needs scheduling",
      truck_preference: input.truckPreference || null,
      notes: input.notes || "",
      status: "new",
      assigned_route_id: null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return normalizeOrder(data);
}

export async function createDispatchRoute(input: {
  code: string;
  truck: string;
  driver: string;
  helper?: string;
  color?: string;
  shift?: string;
  region?: string;
}) {
  const id = `route-${Date.now().toString(36)}`;

  const { data, error } = await supabaseAdmin
    .from(ROUTES_TABLE)
    .insert({
      id,
      code: input.code,
      truck: input.truck,
      driver: input.driver,
      helper: input.helper || "",
      color: input.color || "#38bdf8",
      shift: input.shift || "",
      region: input.region || "",
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return normalizeRoute(data);
}

export async function updateDispatchOrder(
  id: string,
  patch: {
    status?: DispatchStatus;
    assignedRouteId?: string | null;
  },
) {
  const payload: Record<string, unknown> = {};

  if (patch.status) payload.status = patch.status;
  if (patch.assignedRouteId !== undefined) {
    payload.assigned_route_id = patch.assignedRouteId;
  }

  const { data, error } = await supabaseAdmin
    .from(ORDERS_TABLE)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return normalizeOrder(data);
}
