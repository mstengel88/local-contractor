import { supabaseAdmin } from "./supabase.server";

export type DispatchSource = "email" | "manual";
export type DispatchStatus = "new" | "scheduled" | "hold";
export type DispatchDeliveryStatus =
  | "not_started"
  | "en_route"
  | "arrived"
  | "delivered"
  | "issue";

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
  stopSequence?: number | null;
  deliveryStatus?: DispatchDeliveryStatus;
  eta?: string | null;
  arrivedAt?: string | null;
  departedAt?: string | null;
  deliveredAt?: string | null;
  proofName?: string | null;
  proofNotes?: string | null;
  emailSubject?: string | null;
  rawEmail?: string | null;
  signatureName?: string | null;
  signatureData?: string | null;
  photoUrls?: string | null;
  ticketNumbers?: string | null;
  inspectionStatus?: string | null;
  checklistJson?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DispatchRoute = {
  id: string;
  code: string;
  truckId?: string | null;
  truck: string;
  driverId?: string | null;
  driver: string;
  helperId?: string | null;
  helper: string;
  color: string;
  shift: string;
  region: string;
  isActive?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DispatchTruck = {
  id: string;
  label: string;
  truckType: string;
  capacity: string;
  licensePlate?: string | null;
  isActive?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DispatchEmployee = {
  id: string;
  name: string;
  role: "driver" | "helper" | "dispatcher";
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
  created_at?: string;
  updated_at?: string;
};

export const seedDispatchTrucks: DispatchTruck[] = [
  {
    id: "truck-12",
    label: "Truck 12",
    truckType: "Tri-axle",
    capacity: "22 TonS",
    licensePlate: "GHS-12",
    isActive: true,
  },
  {
    id: "truck-18",
    label: "Truck 18",
    truckType: "Walking floor",
    capacity: "25 YardS",
    licensePlate: "GHS-18",
    isActive: true,
  },
  {
    id: "truck-05",
    label: "Truck 05",
    truckType: "Tri-axle",
    capacity: "22 TonS",
    licensePlate: "GHS-05",
    isActive: true,
  },
];

export const seedDispatchEmployees: DispatchEmployee[] = [
  {
    id: "employee-paul",
    name: "Paul",
    role: "driver",
    phone: "",
    email: "",
    isActive: true,
  },
  {
    id: "employee-peter",
    name: "Peter",
    role: "driver",
    phone: "",
    email: "",
    isActive: true,
  },
  {
    id: "employee-andrew",
    name: "Andrew",
    role: "driver",
    phone: "",
    email: "",
    isActive: true,
  },
  {
    id: "employee-manny",
    name: "Manny",
    role: "helper",
    phone: "",
    email: "",
    isActive: true,
  },
  {
    id: "employee-luis",
    name: "Luis",
    role: "helper",
    phone: "",
    email: "",
    isActive: true,
  },
  {
    id: "employee-nate",
    name: "Nate",
    role: "helper",
    phone: "",
    email: "",
    isActive: true,
  },
];

export const seedDispatchRoutes: DispatchRoute[] = [
  {
    id: "route-north",
    code: "R-12",
    truckId: "truck-12",
    truck: "Truck 12",
    driverId: "employee-paul",
    driver: "Paul",
    helperId: "employee-manny",
    helper: "Manny",
    color: "#f97316",
    shift: "6:30a - 3:30p",
    region: "North / Menomonee Falls",
    isActive: true,
  },
  {
    id: "route-west",
    code: "R-18",
    truckId: "truck-18",
    truck: "Truck 18",
    driverId: "employee-peter",
    driver: "Peter",
    helperId: "employee-luis",
    helper: "Luis",
    color: "#06b6d4",
    shift: "7:00a - 4:00p",
    region: "West / Waukesha",
    isActive: true,
  },
  {
    id: "route-south",
    code: "R-05",
    truckId: "truck-05",
    truck: "Truck 05",
    driverId: "employee-andrew",
    driver: "Andrew",
    helperId: "employee-nate",
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
const TRUCKS_TABLE = "dispatch_trucks";
const EMPLOYEES_TABLE = "dispatch_employees";

function normalizeOrder(row: any): DispatchOrder {
  const deliveryStatus =
    row.delivery_status === "en_route" ||
    row.delivery_status === "arrived" ||
    row.delivery_status === "delivered" ||
    row.delivery_status === "issue"
      ? row.delivery_status
      : "not_started";

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
    stopSequence:
      row.stop_sequence === null || row.stop_sequence === undefined
        ? null
        : Number(row.stop_sequence),
    deliveryStatus,
    eta: row.eta || null,
    arrivedAt: row.arrived_at || null,
    departedAt: row.departed_at || null,
    deliveredAt: row.delivered_at || null,
    proofName: row.proof_name || null,
    proofNotes: row.proof_notes || null,
    emailSubject: row.email_subject || null,
    rawEmail: row.raw_email || null,
    signatureName: row.signature_name || null,
    signatureData: row.signature_data || null,
    photoUrls: row.photo_urls || null,
    ticketNumbers: row.ticket_numbers || null,
    inspectionStatus: row.inspection_status || null,
    checklistJson: row.checklist_json || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeRoute(row: any): DispatchRoute {
  return {
    id: String(row.id),
    code: String(row.code || ""),
    truckId: row.truck_id || null,
    truck: String(row.truck || ""),
    driverId: row.driver_id || null,
    driver: String(row.driver || ""),
    helperId: row.helper_id || null,
    helper: String(row.helper || ""),
    color: String(row.color || "#38bdf8"),
    shift: String(row.shift || ""),
    region: String(row.region || ""),
    isActive: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeTruck(row: any): DispatchTruck {
  return {
    id: String(row.id),
    label: String(row.label || ""),
    truckType: String(row.truck_type || ""),
    capacity: String(row.capacity || ""),
    licensePlate: row.license_plate || null,
    isActive: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeEmployee(row: any): DispatchEmployee {
  const role =
    row.role === "helper" || row.role === "dispatcher" ? row.role : "driver";

  return {
    id: String(row.id),
    name: String(row.name || ""),
    role,
    phone: row.phone || null,
    email: row.email || null,
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
      stop_sequence: order.assignedRouteId ? 1 : null,
      delivery_status: "not_started",
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
      truck_id: route.truckId || null,
      truck: route.truck,
      driver_id: route.driverId || null,
      driver: route.driver,
      helper_id: route.helperId || null,
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

export async function ensureSeedDispatchTrucks() {
  const { data, error } = await supabaseAdmin
    .from(TRUCKS_TABLE)
    .select("id", { count: "exact", head: false })
    .limit(1);

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if ((data || []).length > 0) return;

  const { error: insertError } = await supabaseAdmin.from(TRUCKS_TABLE).insert(
    seedDispatchTrucks.map((truck) => ({
      id: truck.id,
      label: truck.label,
      truck_type: truck.truckType,
      capacity: truck.capacity,
      license_plate: truck.licensePlate || null,
      is_active: truck.isActive !== false,
    })),
  );

  if (insertError) {
    throw new Error(formatSupabaseError(insertError));
  }
}

export async function ensureSeedDispatchEmployees() {
  const { data, error } = await supabaseAdmin
    .from(EMPLOYEES_TABLE)
    .select("id", { count: "exact", head: false })
    .limit(1);

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if ((data || []).length > 0) return;

  const { error: insertError } = await supabaseAdmin.from(EMPLOYEES_TABLE).insert(
    seedDispatchEmployees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      role: employee.role,
      phone: employee.phone || null,
      email: employee.email || null,
      is_active: employee.isActive !== false,
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

export async function getDispatchTrucks() {
  const { data, error } = await supabaseAdmin
    .from(TRUCKS_TABLE)
    .select("*")
    .eq("is_active", true)
    .order("label", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return (data || []).map(normalizeTruck);
}

export async function getDispatchEmployees() {
  const { data, error } = await supabaseAdmin
    .from(EMPLOYEES_TABLE)
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return (data || []).map(normalizeEmployee);
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
  emailSubject?: string;
  rawEmail?: string;
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
      email_subject: input.emailSubject || null,
      raw_email: input.rawEmail || null,
      status: "new",
      assigned_route_id: null,
      stop_sequence: null,
      delivery_status: "not_started",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return normalizeOrder(data);
}

export async function getNextRouteStopSequence(routeId: string) {
  const { data, error } = await supabaseAdmin
    .from(ORDERS_TABLE)
    .select("stop_sequence")
    .eq("assigned_route_id", routeId)
    .not("stop_sequence", "is", null)
    .order("stop_sequence", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  const currentMax = Number(data?.[0]?.stop_sequence || 0);
  return currentMax + 1;
}

export async function createDispatchRoute(input: {
  code: string;
  truckId?: string;
  truck: string;
  driverId?: string;
  driver: string;
  helperId?: string;
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
      truck_id: input.truckId || null,
      truck: input.truck,
      driver_id: input.driverId || null,
      driver: input.driver,
      helper_id: input.helperId || null,
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

export async function createDispatchTruck(input: {
  label: string;
  truckType?: string;
  capacity?: string;
  licensePlate?: string;
}) {
  const id = `truck-${Date.now().toString(36)}`;

  const { data, error } = await supabaseAdmin
    .from(TRUCKS_TABLE)
    .insert({
      id,
      label: input.label,
      truck_type: input.truckType || "",
      capacity: input.capacity || "",
      license_plate: input.licensePlate || null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return normalizeTruck(data);
}

export async function createDispatchEmployee(input: {
  name: string;
  role: DispatchEmployee["role"];
  phone?: string;
  email?: string;
}) {
  const id = `employee-${Date.now().toString(36)}`;

  const { data, error } = await supabaseAdmin
    .from(EMPLOYEES_TABLE)
    .insert({
      id,
      name: input.name,
      role: input.role,
      phone: input.phone || null,
      email: input.email || null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return normalizeEmployee(data);
}

export async function updateDispatchOrder(
  id: string,
  patch: {
    status?: DispatchStatus;
    assignedRouteId?: string | null;
    stopSequence?: number | null;
    deliveryStatus?: DispatchDeliveryStatus;
    eta?: string | null;
    arrivedAt?: string | null;
    departedAt?: string | null;
    deliveredAt?: string | null;
    proofName?: string | null;
    proofNotes?: string | null;
    emailSubject?: string | null;
    rawEmail?: string | null;
    signatureName?: string | null;
    signatureData?: string | null;
    photoUrls?: string | null;
    ticketNumbers?: string | null;
    inspectionStatus?: string | null;
    checklistJson?: string | null;
  },
) {
  const payload: Record<string, unknown> = {};

  if (patch.status) payload.status = patch.status;
  if (patch.assignedRouteId !== undefined) {
    payload.assigned_route_id = patch.assignedRouteId;
  }
  if (patch.stopSequence !== undefined) {
    payload.stop_sequence = patch.stopSequence;
  }
  if (patch.deliveryStatus) payload.delivery_status = patch.deliveryStatus;
  if (patch.eta !== undefined) payload.eta = patch.eta;
  if (patch.arrivedAt !== undefined) payload.arrived_at = patch.arrivedAt;
  if (patch.departedAt !== undefined) payload.departed_at = patch.departedAt;
  if (patch.deliveredAt !== undefined) payload.delivered_at = patch.deliveredAt;
  if (patch.proofName !== undefined) payload.proof_name = patch.proofName;
  if (patch.proofNotes !== undefined) payload.proof_notes = patch.proofNotes;
  if (patch.emailSubject !== undefined) payload.email_subject = patch.emailSubject;
  if (patch.rawEmail !== undefined) payload.raw_email = patch.rawEmail;
  if (patch.signatureName !== undefined) payload.signature_name = patch.signatureName;
  if (patch.signatureData !== undefined) payload.signature_data = patch.signatureData;
  if (patch.photoUrls !== undefined) payload.photo_urls = patch.photoUrls;
  if (patch.ticketNumbers !== undefined) payload.ticket_numbers = patch.ticketNumbers;
  if (patch.inspectionStatus !== undefined) payload.inspection_status = patch.inspectionStatus;
  if (patch.checklistJson !== undefined) payload.checklist_json = patch.checklistJson;

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
