import { getDispatchTravelEstimate } from "./quote-engine.server";
import { supabaseAdmin } from "./supabase.server";

export type DispatchSource = "email" | "manual";
export type DispatchStatus = "new" | "scheduled" | "hold" | "delivered";
export type DispatchDeliveryStatus =
  | "not_started"
  | "en_route"
  | "arrived"
  | "delivered"
  | "issue";

export type DispatchOrder = {
  id: string;
  orderNumber?: string | null;
  source: DispatchSource;
  customer: string;
  contact: string;
  address: string;
  city: string;
  material: string;
  quantity: string;
  unit: string;
  requestedWindow: string;
  timePreference?: string | null;
  truckPreference?: string | null;
  notes: string;
  status: DispatchStatus;
  assignedRouteId?: string | null;
  stopSequence?: number | null;
  deliveryStatus?: DispatchDeliveryStatus;
  eta?: string | null;
  travelMinutes?: number | null;
  travelMiles?: number | null;
  travelSummary?: string | null;
  arrivedAt?: string | null;
  departedAt?: string | null;
  deliveredAt?: string | null;
  proofName?: string | null;
  proofNotes?: string | null;
  emailSubject?: string | null;
  rawEmail?: string | null;
  mailboxMessageId?: string | null;
  signatureName?: string | null;
  signatureData?: string | null;
  photoUrls?: string | null;
  ticketNumbers?: string | null;
  inspectionStatus?: string | null;
  checklistJson?: string | null;
  created_at?: string;
  updated_at?: string;
};

function readEmailField(raw: string, labels: string[]) {
  for (const label of labels) {
    const match = raw.match(new RegExp(`^\\s*${label}\\s*:?\\s*(.+)$`, "im"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function decodeQuotedPrintable(raw: string) {
  return raw
    .replace(/=\r?\n/g, "")
    .replace(/(?:=[0-9A-F]{2})+/gi, (encoded) => {
      const bytes = encoded
        .match(/=([0-9A-F]{2})/gi)
        ?.map((part) => parseInt(part.slice(1), 16));
      return bytes ? Buffer.from(bytes).toString("utf8") : encoded;
    });
}

function normalizeEmailText(raw: string) {
  return decodeQuotedPrintable(raw)
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<head[\s\S]*?<\/head>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|table|h\d|td|th|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#215;|&#xD7;|&times;/gi, "x")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/^\s*=\s*$/gm, "")
    .replace(/\s+=\s*$/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textLines(raw: string) {
  return normalizeEmailText(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseShopifyCustomer(raw: string) {
  const text = normalizeEmailText(raw);
  return (
    text.match(/new order from\s+([^:.\n]+)/i)?.[1]?.trim() ||
    ""
  );
}

function parseShopifyOrderNumber(raw: string, subject = "") {
  const text = normalizeEmailText(raw);
  return (
    subject.match(/new order:\s*#?([A-Z0-9-]+)/i)?.[1]?.trim() ||
    text.match(/new order:\s*#?([A-Z0-9-]+)/i)?.[1]?.trim() ||
    text.match(/order\s+#?([A-Z0-9-]+)\s*\(/i)?.[1]?.trim() ||
    text.match(/\border\s+#?([A-Z0-9-]+)/i)?.[1]?.trim() ||
    ""
  );
}

function cleanOrderNumber(value: string) {
  return value.match(/#?\s*([A-Z0-9-]+)/i)?.[1]?.trim() || "";
}

function isProductHeader(value: string) {
  return /^(product|quantity|price|unit|units|price units?|order summary)$/i.test(
    value.trim(),
  );
}

function isShopifyProductBoundary(value: string) {
  return /^(billing address|shipping address|subtotal|shipping|tax|total|payment method|delivery or pickup preference date|please describe where|what happens next\??)$/i.test(
    value.trim(),
  );
}

function isCountryOrAddressFragment(value: string) {
  const line = value.trim();
  return (
    /^(?:united\s+states|states|ed\s+states)\s*\(us\)$/i.test(line) ||
    /\b(?:united\s+states|states|ed\s+states)\s*\(us\)\b/i.test(line) ||
    /^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(line) ||
    /^\d{3,}/.test(line)
  );
}

function isProductCandidate(value: string) {
  const line = cleanProductMaterial(value);
  return (
    !isCountryOrAddressFragment(value) &&
    !isCountryOrAddressFragment(line) &&
    /[a-z]/i.test(line) &&
    !isProductHeader(line) &&
    !isShopifyProductBoundary(line) &&
    !/@media|template_|max-width|font-|color:|background|border|padding|margin|display:|width:/i.test(line) &&
    !/[{};]/.test(line) &&
    !/^\(#?\d+\)$/i.test(line) &&
    !/^#?\d+$/.test(line) &&
    !/^order\s+#/i.test(line) &&
    !/^(subtotal|shipping|tax|total|payment method):/i.test(line) &&
    !/^\$/.test(line)
  );
}

function cleanCityValue(value: string) {
  return value
    .replace(/\bUSA\b\.?/gi, "")
    .replace(/\s*,\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function splitStreetAndCity(value: string) {
  const cleaned = value.trim();
  const cityStateZipMatch = cleaned.match(
    /^(.*?),\s*([^,]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?)(?:,\s*USA)?$/i,
  );
  if (cityStateZipMatch) {
    return {
      address: cityStateZipMatch[1].trim(),
      city: cleanCityValue(cityStateZipMatch[2]),
    };
  }

  const stateZipMatch = cleaned.match(
    /^(.*?)(?:,|\s{2,})\s*([^,\d]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)(?:,\s*USA)?$/i,
  );
  if (stateZipMatch) {
    return {
      address: stateZipMatch[1].trim(),
      city: cleanCityValue(stateZipMatch[2]),
    };
  }

  return { address: cleaned, city: "" };
}

function cleanQuantityValue(value: string) {
  const line = value.trim();
  return (
    line.match(/(?:x|\u00d7)\s*(\d+(?:\.\d+)?)/i)?.[1] ||
    line.match(/^(\d+(?:\.\d+)?)\s*(?:unit|units|ton|tons|yard|yards|gallon|gallons)?\b/i)?.[1] ||
    ""
  );
}

function normalizeDispatchUnit(value: string, fallback = "Unit") {
  const unit = value.trim();
  if (!unit || /^(price|quantity|product|amount)$/i.test(unit)) return fallback;
  if (/yards?/i.test(unit)) return "Yard";
  if (/tons?/i.test(unit)) return "Ton";
  if (/gallons?/i.test(unit)) return "Gallons";
  if (/bags?/i.test(unit)) return "Bags";
  if (/units?/i.test(unit)) return "Unit";
  return unit;
}

function cleanProductMaterial(value: string) {
  return value
    .replace(/\b(?:united\s+states|states|ed\s+states)\s*\(us\)\s*/gi, "")
    .replace(/^\s*(?:ed\s+)?states\s*\(us\)\s*/i, "")
    .replace(/^(?:product|material|item)\s*:?\s*/i, "")
    .replace(/\s*(?:x|\u00d7)\s*\d+(?:\.\d+)?\s*$/i, "")
    .replace(/\s+\$?\d+(?:\.\d{2})?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeProductLookupText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapPriceUnitLabelToDispatchUnit(value?: string | null) {
  const label = String(value || "").trim();
  if (/per\s+ton\b/i.test(label)) return "Ton";
  if (/per\s+yard\b/i.test(label)) return "Yard";
  if (/per\s+bag\b/i.test(label)) return "Bags";
  if (/per\s+gallon\b/i.test(label)) return "Gallons";
  return "";
}

export async function getDispatchUnitForMaterial(material: string) {
  const normalizedMaterial = normalizeProductLookupText(material);
  if (!normalizedMaterial) return "";

  const { data, error } = await supabaseAdmin
    .from("product_source_map")
    .select("product_title, unit_label, price_unit_label");

  if (error) {
    console.error("[DISPATCH UNIT LOOKUP ERROR]", error);
    return "";
  }

  const rows = ((data || []) as Array<{
    product_title?: string | null;
    unit_label?: string | null;
    price_unit_label?: string | null;
  }>).filter((row) => row.product_title);

  const exactMatch = rows.find(
    (row) => normalizeProductLookupText(row.product_title || "") === normalizedMaterial,
  );
  const containsMatch =
    exactMatch ||
    rows.find((row) => {
      const title = normalizeProductLookupText(row.product_title || "");
      return title.includes(normalizedMaterial) || normalizedMaterial.includes(title);
    });

  return mapPriceUnitLabelToDispatchUnit(
    containsMatch?.unit_label || containsMatch?.price_unit_label,
  );
}

function parseQuantityFromEmail(raw: string) {
  const normalized = normalizeEmailText(raw);
  return (
    normalized.match(/(?:^|\s)(?:x|\u00d7)\s*(\d+(?:\.\d+)?)(?:\s|$)/i)?.[1] ||
    normalized.match(/\bQuantity\b[\s:]+(\d+(?:\.\d+)?)/i)?.[1] ||
    ""
  );
}

function parseShopifyProduct(raw: string) {
  const lines = textLines(raw);
  const quantityLineIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => {
      if (!/(?:x|\u00d7)\s*\d+/i.test(line)) return false;
      const window = lines
        .slice(Math.max(0, index - 4), Math.min(lines.length, index + 3))
        .join(" ");
      return /product|price|\(#?\d+\)|subtotal|shipping|tax|total/i.test(window);
    })
    .map(({ index }) => index);
  const quantityLineIndex = quantityLineIndexes[0] ?? -1;

  const product = parseShopifyProductAtLine(raw, quantityLineIndex);
  if (product.material || product.quantity) return product;

  const productIndex = lines.findIndex((line) => /^product$/i.test(line));
  const material =
    lines
      .slice(productIndex >= 0 ? productIndex + 1 : 0)
      .find(
        (line) =>
          isProductCandidate(line),
      ) || "";

  let parsedQuantity = "";
  if (material) {
    const materialIndex = lines.findIndex((line) => line.includes(material));
    const nearbyLines =
      materialIndex >= 0
        ? lines.slice(materialIndex + 1, Math.min(lines.length, materialIndex + 8))
        : lines;
    parsedQuantity =
      nearbyLines
        .map((line) => cleanQuantityValue(line))
        .find(Boolean) || "";
  }

  if (!parsedQuantity) {
    parsedQuantity = parseQuantityFromEmail(raw);
  }

  return { material: cleanProductMaterial(material), quantity: parsedQuantity };
}

function parseShopifyProductAtLine(raw: string, quantityLineIndex: number) {
  const lines = textLines(raw);
  if (quantityLineIndex < 0) return { material: "", quantity: "" };

  const quantity =
    lines[quantityLineIndex].match(/(?:x|\u00d7)\s*(\d+(?:\.\d+)?)/i)?.[1] || "";

  let material = "";
  const sameLineBeforeQuantity = lines[quantityLineIndex]
    .split(/(?:x|\u00d7)\s*\d+/i)[0]
    .trim();
  const sameLineCandidates = sameLineBeforeQuantity
    .split(/\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  material = sameLineCandidates.find(isProductCandidate) || "";

  const sameLineMaterial = lines[quantityLineIndex]
    .replace(/(?:x|\u00d7)\s*\d+(?:\.\d+)?[\s\S]*$/i, "")
    .trim();
  if (
    !material &&
    sameLineMaterial &&
    isProductCandidate(sameLineMaterial)
  ) {
    material = sameLineMaterial;
  }

  for (let index = quantityLineIndex - 1; index >= 0; index -= 1) {
    if (material) break;
    const candidate = lines[index];
    if (isShopifyProductBoundary(candidate)) break;
    if (isProductCandidate(candidate)) {
      material = candidate;
      break;
    }
  }

  return { material: cleanProductMaterial(material), quantity };
}

function parseShopifyProducts(raw: string) {
  const lines = textLines(raw);
  const productStart = lines.findIndex((line) => /^product$/i.test(line));
  const productEndCandidates = [
    lines.findIndex((line) => /^subtotal:?/i.test(line)),
    lines.findIndex((line) => /^billing address\b/i.test(line)),
    lines.findIndex((line) => /^shipping address\b/i.test(line)),
  ].filter((index) => index > productStart);
  const productEnd =
    productStart >= 0 && productEndCandidates.length
      ? Math.min(...productEndCandidates)
      : lines.length;
  const quantityLineIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => {
    if (productStart >= 0 && (index <= productStart || index >= productEnd)) {
      return false;
    }
    if (!/(?:x|\u00d7)\s*\d+/i.test(line)) return false;
    const window = lines
      .slice(Math.max(0, index - 4), Math.min(lines.length, index + 3))
      .join(" ");
    return /product|price|\(#?\d+\)|subtotal|shipping|tax|total/i.test(window);
  })
    .map(({ index }) => index);

  const products = quantityLineIndexes
    .map((index) => parseShopifyProductAtLine(raw, index))
    .filter((product) => product.material && product.quantity);

  const seen = new Set<string>();
  const uniqueProducts = products.filter((product) => {
    const key = `${product.material.toLowerCase()}::${product.quantity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueProducts.length ? uniqueProducts : [parseShopifyProduct(raw)].filter((product) => product.material);
}

function parseShopifyShipping(raw: string) {
  const lines = textLines(raw);
  const start = lines.findIndex((line) => /^shipping address\b/i.test(line));
  if (start < 0) return { customer: "", address: "", city: "", contact: "" };

  const block: string[] = [];
  for (const line of lines.slice(start)) {
    if (block.length && /^what happens next\??$/i.test(line)) break;
    if (block.length && /^billing address\b/i.test(line)) break;
    const stripped = line.replace(/^shipping address\s*/i, "").trim();
    if (stripped) block.push(stripped);
  }

  const cleaned = block
    .flatMap((line) => line.split(/\s{2,}/))
    .map((line) => line.trim())
    .filter(Boolean);
  const contact = cleaned.find((line) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line)) || "";
  const customer = cleaned.find((line) => !/\d/.test(line) && !/address/i.test(line) && !/,/.test(line)) || "";
  const rawAddress = cleaned.find((line) => /\d/.test(line) && !/^\d{7,}$/.test(line) && !/@/.test(line) && !/^\s*[A-Z]{2}\s+\d{5}/i.test(line)) || "";
  const splitAddress = splitStreetAndCity(rawAddress);
  const rawCity =
    cleaned.find((line) => /,\s*[A-Z]{2}\s+\d{5}/i.test(line)) ||
    cleaned.find((line) => /\b[A-Z]{2}\s+\d{5}/i.test(line)) ||
    "";
  const city = splitAddress.city || cleanCityValue(rawCity);

  return { customer, address: splitAddress.address, city, contact };
}

function parseShopifyDeliveryNotes(raw: string) {
  const text = normalizeEmailText(raw);
  return (
    text
      .match(/Please describe where you would like your order dropped off:\s*([\s\S]+?)(?:Billing address|Shipping address|What Happens Next\?|$)/i)?.[1]
      ?.trim() || ""
  );
}

function isBadParsedValue(value: string) {
  return !value || /^=?\s*$/.test(value) || /^(price|price units?|quantity|unit|units)$/i.test(value);
}

export function detectTimePreference(text: string) {
  if (/\bmorning\b|\bam\b|a\.m\./i.test(text)) return "Morning";
  if (/\bafternoon\b|\bnoon\b|\bpm\b|p\.m\./i.test(text)) return "Afternoon";
  if (/\bevening\b|\bnight\b/i.test(text)) return "Evening";
  return "";
}

export function parseDispatchEmail(raw: string) {
  const normalized = normalizeEmailText(raw);
  const shipping = parseShopifyShipping(raw);
  const shopifyProduct = parseShopifyProduct(raw);
  const shopifyProducts = parseShopifyProducts(raw);
  const shopifyNotes = parseShopifyDeliveryNotes(raw);
  const subject = readEmailField(normalized, ["Subject"]);
  const orderNumber = cleanOrderNumber(
    readEmailField(normalized, ["Order Number", "Order No"]) ||
      parseShopifyOrderNumber(raw, subject),
  );
  const contact =
    readEmailField(normalized, ["Email", "Contact", "Customer Email"]) ||
    shipping.contact ||
    normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ||
    "";
  const customer =
    readEmailField(normalized, ["Customer", "Client", "Name", "Company"]) ||
    parseShopifyCustomer(raw) ||
    shipping.customer ||
    subject.replace(/^(order|delivery|quote)\s*[:-]\s*/i, "").trim();
  const address = readEmailField(normalized, [
    "Address",
    "Delivery Address",
    "Jobsite",
    "Job Site",
    "Ship To",
  ]) || shipping.address;
  const rawCity = readEmailField(normalized, ["City", "City/State", "Location"]) || shipping.city;
  const labelledMaterial = readEmailField(normalized, ["Material", "Product", "Item"]);
  const labelledQuantity = readEmailField(normalized, ["Quantity", "Qty", "Amount"]);
  const material = cleanProductMaterial(
    isBadParsedValue(labelledMaterial) ? shopifyProduct.material : labelledMaterial,
  );
  const quantity = cleanQuantityValue(
    isBadParsedValue(labelledQuantity) ? shopifyProduct.quantity : labelledQuantity,
  );
  const unit = normalizeDispatchUnit(readEmailField(normalized, ["Unit", "UOM"]), "Unit");
  const products = isBadParsedValue(labelledMaterial)
    ? shopifyProducts.map((product) => ({
        material: cleanProductMaterial(product.material),
        quantity: cleanQuantityValue(product.quantity),
      }))
    : [{ material, quantity }];
  const splitAddress = splitStreetAndCity(address);
  const cleanAddress = splitAddress.address;
  const city = cleanCityValue(splitAddress.city || rawCity);
  const requestedWindow =
    normalized.match(/Delivery or Pickup Preference Date:\s*([^\n]+)/i)?.[1]?.trim() ||
    readEmailField(normalized, ["Requested Window", "Delivery Window", "Requested Date", "Date", "When"]) ||
    "Needs scheduling";
  const truckPreference = readEmailField(normalized, ["Truck", "Truck Preference", "Equipment"]);
  const notes =
    readEmailField(normalized, ["Notes", "Instructions", "Special Instructions"]) ||
    shopifyNotes;
  const timePreference = detectTimePreference(`${requestedWindow}\n${notes}\n${normalized}`);

  return {
    subject,
    orderNumber,
    customer: customer || "Email Order",
    contact,
    address: cleanAddress,
    city,
    material,
    quantity,
    products: products.filter((product) => product.material),
    unit,
    requestedWindow,
    timePreference,
    truckPreference,
    notes,
  };
}

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
  tons?: string | null;
  yards?: string | null;
  capacity?: string;
  licensePlate?: string | null;
  isActive?: boolean;
  created_at?: string;
  updated_at?: string;
};

function getLegacyTruckTons(capacity?: string | null) {
  return String(capacity || "").match(/(\d+(?:\.\d+)?)\s*tons?/i)?.[1] || "";
}

function getLegacyTruckYards(capacity?: string | null) {
  return String(capacity || "").match(/(\d+(?:\.\d+)?)\s*yards?/i)?.[1] || "";
}

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
    tons: "22",
    yards: "",
    capacity: "22 TonS",
    licensePlate: "GHS-12",
    isActive: true,
  },
  {
    id: "truck-18",
    label: "Truck 18",
    truckType: "Walking floor",
    tons: "",
    yards: "25",
    capacity: "25 YardS",
    licensePlate: "GHS-18",
    isActive: true,
  },
  {
    id: "truck-05",
    label: "Truck 05",
    truckType: "Tri-axle",
    tons: "22",
    yards: "",
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
const SETTINGS_TABLE = "dispatch_settings";

function normalizeOrder(row: any): DispatchOrder {
  const deliveryStatus =
    row.delivery_status === "en_route" ||
    row.delivery_status === "arrived" ||
    row.delivery_status === "delivered" ||
    row.delivery_status === "issue"
      ? row.delivery_status
      : "not_started";
  const requestedWindow = String(row.requested_window || "");
  const notes = String(row.notes || "");
  const rawEmail = row.raw_email || null;
  const derivedQuantity =
    String(row.quantity || "") ||
    (rawEmail ? parseQuantityFromEmail(String(rawEmail)) : "");
  const derivedTimePreference =
    row.time_preference ||
    detectTimePreference(`${requestedWindow}\n${notes}\n${rawEmail || ""}`) ||
    null;

  return {
    id: String(row.id),
    orderNumber: row.order_number || null,
    source: row.source === "email" ? "email" : "manual",
    customer: String(row.customer || ""),
    contact: String(row.contact || ""),
    address: String(row.address || ""),
    city: String(row.city || ""),
    material: String(row.material || ""),
    quantity: derivedQuantity,
    unit: String(row.unit || ""),
    requestedWindow,
    timePreference: derivedTimePreference,
    truckPreference: row.truck_preference || null,
    notes,
    status:
      row.status === "scheduled" || row.status === "hold" || row.status === "delivered"
        ? row.status
        : "new",
    assignedRouteId: row.assigned_route_id || null,
    stopSequence:
      row.stop_sequence === null || row.stop_sequence === undefined
        ? null
        : Number(row.stop_sequence),
    deliveryStatus,
    eta: row.eta || null,
    travelMinutes:
      row.travel_minutes === null || row.travel_minutes === undefined
        ? null
        : Number(row.travel_minutes),
    travelMiles:
      row.travel_miles === null || row.travel_miles === undefined
        ? null
        : Number(row.travel_miles),
    travelSummary: row.travel_summary || null,
    arrivedAt: row.arrived_at || null,
    departedAt: row.departed_at || null,
    deliveredAt: row.delivered_at || null,
    proofName: row.proof_name || null,
    proofNotes: row.proof_notes || null,
    emailSubject: row.email_subject || null,
    rawEmail,
    mailboxMessageId: row.mailbox_message_id || null,
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
  const capacity = String(row.capacity || "");
  return {
    id: String(row.id),
    label: String(row.label || ""),
    truckType: String(row.truck_type || ""),
    tons: row.tons === null || row.tons === undefined ? getLegacyTruckTons(capacity) : String(row.tons),
    yards: row.yards === null || row.yards === undefined ? getLegacyTruckYards(capacity) : String(row.yards),
    capacity,
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

function buildDispatchDestinationAddress(address?: string | null, city?: string | null) {
  return [address, city].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

export async function getDispatchOriginAddress() {
  const { data, error } = await supabaseAdmin
    .from("origin_addresses")
    .select("address")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[DISPATCH MAP ORIGIN ERROR]", formatSupabaseError(error));
  }

  return (
    String(data?.address || "").trim() ||
    "W185 N7487 Narrow Ln, Menomonee Falls, WI 53051"
  );
}

async function buildDispatchTravelPayload(address?: string | null, city?: string | null) {
  const destination = buildDispatchDestinationAddress(address, city);
  if (!destination) {
    return {
      travel_minutes: null,
      travel_miles: null,
      travel_summary: null,
    };
  }

  const estimate = await getDispatchTravelEstimate(destination);
  if (!estimate || estimate.error) {
    return {
      travel_minutes: null,
      travel_miles: null,
      travel_summary: estimate?.summary || estimate?.error || null,
    };
  }

  return {
    travel_minutes: estimate.minutes,
    travel_miles: estimate.miles,
    travel_summary: estimate.summary,
  };
}

export async function ensureSeedDispatchOrders() {
  if (process.env.DISPATCH_SEED_EXAMPLE_ORDERS !== "true") {
    return;
  }

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
      order_number: order.orderNumber || null,
      source: order.source,
      customer: order.customer,
      contact: order.contact,
      address: order.address,
      city: order.city,
      material: order.material,
      quantity: order.quantity,
      unit: order.unit,
      requested_window: order.requestedWindow,
      time_preference: order.timePreference || null,
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
      capacity: truck.capacity || "",
      tons: truck.tons || null,
      yards: truck.yards || null,
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

export async function getDispatchOrderByMailboxMessageId(messageId: string) {
  const { data, error } = await supabaseAdmin
    .from(ORDERS_TABLE)
    .select("*")
    .eq("mailbox_message_id", messageId)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return data ? normalizeOrder(data) : null;
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

function getDispatchLocalDate() {
  const timeZone = process.env.DISPATCH_RESET_TIMEZONE || "America/Chicago";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function resetDispatchRoutesForNewDay() {
  const today = getDispatchLocalDate();
  const settingKey = "last_daily_route_reset";

  const { data: setting, error: settingError } = await supabaseAdmin
    .from(SETTINGS_TABLE)
    .select("value")
    .eq("key", settingKey)
    .maybeSingle();

  if (settingError) {
    console.error("[DISPATCH DAILY RESET SKIPPED]", formatSupabaseError(settingError));
    return { reset: false, date: today };
  }

  if (setting?.value === today) {
    return { reset: false, date: today };
  }

  const hasPreviousResetDate = Boolean(setting?.value);

  const { error: upsertError } = await supabaseAdmin
    .from(SETTINGS_TABLE)
    .upsert({
      key: settingKey,
      value: today,
      updated_at: new Date().toISOString(),
    });

  if (upsertError) {
    console.error("[DISPATCH DAILY RESET SKIPPED]", formatSupabaseError(upsertError));
    return { reset: false, date: today };
  }

  if (!hasPreviousResetDate) {
    return { reset: false, date: today };
  }

  const { error: ordersError } = await supabaseAdmin
    .from(ORDERS_TABLE)
    .update({
      status: "new",
      assigned_route_id: null,
      stop_sequence: null,
      eta: null,
      delivery_status: "not_started",
      arrived_at: null,
      departed_at: null,
    })
    .neq("status", "delivered");

  if (ordersError) {
    throw new Error(formatSupabaseError(ordersError));
  }

  const { error: routesError } = await supabaseAdmin
    .from(ROUTES_TABLE)
    .update({ is_active: false })
    .eq("is_active", true);

  if (routesError) {
    throw new Error(formatSupabaseError(routesError));
  }

  return { reset: true, date: today };
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
  orderNumber?: string;
  customer: string;
  contact?: string;
  address: string;
  city?: string;
  material: string;
  quantity?: string;
  unit?: string;
  requestedWindow?: string;
  timePreference?: string;
  truckPreference?: string;
  notes?: string;
  emailSubject?: string;
  rawEmail?: string;
  mailboxMessageId?: string;
}) {
  const id = `D-${Date.now().toString().slice(-6)}`;
  const travelPayload = await buildDispatchTravelPayload(input.address, input.city);

  const { data, error } = await supabaseAdmin
    .from(ORDERS_TABLE)
    .insert({
      id,
      order_number: input.orderNumber || null,
      source: input.source,
      customer: input.customer,
      contact: input.contact || "",
      address: input.address,
      city: input.city || "",
      material: input.material,
      quantity: input.quantity || "",
      unit: input.unit || "Ton",
      requested_window: input.requestedWindow || "Needs scheduling",
      time_preference: input.timePreference || null,
      truck_preference: input.truckPreference || null,
      notes: input.notes || "",
      email_subject: input.emailSubject || null,
      raw_email: input.rawEmail || null,
      mailbox_message_id: input.mailboxMessageId || null,
      status: "new",
      assigned_route_id: null,
      stop_sequence: null,
      delivery_status: "not_started",
      ...travelPayload,
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

export async function updateDispatchRoute(
  id: string,
  patch: {
    code?: string;
    truckId?: string | null;
    truck?: string;
    driverId?: string | null;
    driver?: string;
    helperId?: string | null;
    helper?: string;
    color?: string;
    shift?: string;
    region?: string;
  },
) {
  const payload: Record<string, unknown> = {};

  if (patch.code !== undefined) payload.code = patch.code;
  if (patch.truckId !== undefined) payload.truck_id = patch.truckId;
  if (patch.truck !== undefined) payload.truck = patch.truck;
  if (patch.driverId !== undefined) payload.driver_id = patch.driverId;
  if (patch.driver !== undefined) payload.driver = patch.driver;
  if (patch.helperId !== undefined) payload.helper_id = patch.helperId;
  if (patch.helper !== undefined) payload.helper = patch.helper;
  if (patch.color !== undefined) payload.color = patch.color;
  if (patch.shift !== undefined) payload.shift = patch.shift;
  if (patch.region !== undefined) payload.region = patch.region;

  const { data, error } = await supabaseAdmin
    .from(ROUTES_TABLE)
    .update(payload)
    .eq("id", id)
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
  tons?: string;
  yards?: string;
  licensePlate?: string;
}) {
  const id = `truck-${Date.now().toString(36)}`;

  const { data, error } = await supabaseAdmin
    .from(TRUCKS_TABLE)
    .insert({
      id,
      label: input.label,
      truck_type: input.truckType || "",
      capacity: "",
      tons: input.tons || null,
      yards: input.yards || null,
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

export async function updateDispatchTruck(
  id: string,
  patch: {
    label?: string;
    truckType?: string;
    tons?: string | null;
    yards?: string | null;
    licensePlate?: string | null;
  },
) {
  const payload: Record<string, unknown> = {};

  if (patch.label !== undefined) payload.label = patch.label;
  if (patch.truckType !== undefined) payload.truck_type = patch.truckType;
  if (patch.tons !== undefined) payload.tons = patch.tons;
  if (patch.yards !== undefined) payload.yards = patch.yards;
  if (patch.licensePlate !== undefined) payload.license_plate = patch.licensePlate;

  const { data, error } = await supabaseAdmin
    .from(TRUCKS_TABLE)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return normalizeTruck(data);
}

export async function deleteDispatchTruck(id: string) {
  const { data, error } = await supabaseAdmin
    .from(TRUCKS_TABLE)
    .update({ is_active: false })
    .eq("id", id)
    .select("id");

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (!data?.length) {
    throw new Error(`No dispatch truck found for ${id}`);
  }
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

export async function updateDispatchEmployee(
  id: string,
  patch: {
    name?: string;
    role?: DispatchEmployee["role"];
    phone?: string | null;
    email?: string | null;
  },
) {
  const payload: Record<string, unknown> = {};

  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.role !== undefined) payload.role = patch.role;
  if (patch.phone !== undefined) payload.phone = patch.phone;
  if (patch.email !== undefined) payload.email = patch.email;

  const { data, error } = await supabaseAdmin
    .from(EMPLOYEES_TABLE)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return normalizeEmployee(data);
}

export async function deleteDispatchEmployee(id: string) {
  const { data, error } = await supabaseAdmin
    .from(EMPLOYEES_TABLE)
    .update({ is_active: false })
    .eq("id", id)
    .select("id");

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (!data?.length) {
    throw new Error(`No dispatch employee found for ${id}`);
  }
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
    mailboxMessageId?: string | null;
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
  if (patch.mailboxMessageId !== undefined) payload.mailbox_message_id = patch.mailboxMessageId;
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

export async function updateDispatchOrderDetails(
  id: string,
  patch: {
    orderNumber?: string | null;
    customer?: string;
    contact?: string;
    address?: string;
    city?: string;
    material?: string;
    quantity?: string;
    unit?: string;
    requestedWindow?: string;
    timePreference?: string | null;
    truckPreference?: string | null;
    notes?: string;
    status?: DispatchStatus;
  },
) {
  const payload: Record<string, unknown> = {};

  if (patch.orderNumber !== undefined) payload.order_number = patch.orderNumber;
  if (patch.customer !== undefined) payload.customer = patch.customer;
  if (patch.contact !== undefined) payload.contact = patch.contact;
  if (patch.address !== undefined) payload.address = patch.address;
  if (patch.city !== undefined) payload.city = patch.city;
  if (patch.material !== undefined) payload.material = patch.material;
  if (patch.quantity !== undefined) payload.quantity = patch.quantity;
  if (patch.unit !== undefined) payload.unit = patch.unit;
  if (patch.requestedWindow !== undefined) {
    payload.requested_window = patch.requestedWindow;
  }
  if (patch.timePreference !== undefined) {
    payload.time_preference = patch.timePreference;
  }
  if (patch.truckPreference !== undefined) {
    payload.truck_preference = patch.truckPreference;
  }
  if (patch.notes !== undefined) payload.notes = patch.notes;
  if (patch.status !== undefined) payload.status = patch.status;

  if (patch.address !== undefined || patch.city !== undefined) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from(ORDERS_TABLE)
      .select("address, city")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      throw new Error(formatSupabaseError(currentError));
    }

    Object.assign(
      payload,
      await buildDispatchTravelPayload(
        patch.address !== undefined ? patch.address : current?.address,
        patch.city !== undefined ? patch.city : current?.city,
      ),
    );
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

export async function deleteDispatchOrder(id: string) {
  const { data, error } = await supabaseAdmin
    .from(ORDERS_TABLE)
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (!data?.length) {
    throw new Error(`No dispatch order found for ${id}`);
  }
}
