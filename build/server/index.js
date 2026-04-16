var _a;
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, redirect, createCookie, useLoaderData, useActionData, useFetcher, useNavigation, useLocation, Form, data, UNSAFE_withErrorBoundaryProps, Link } from "react-router";
import { renderToPipeableStream } from "react-dom/server";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { useState, useDeferredValue, useMemo, useEffect } from "react";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}
const prisma = global.prismaGlobal ?? new PrismaClient();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}
if (!supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}
const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);
function toNumberOrUndefined(value) {
  return value === null || value === void 0 || value === "" ? void 0 : Number(value);
}
async function getProductOptionsFromSupabase() {
  const { data: data2, error } = await supabaseAdmin.from("product_source_map").select("*").order("product_title", { ascending: true });
  if (error) {
    console.error("[GET PRODUCT OPTIONS FROM SUPABASE ERROR]", error);
    return [];
  }
  return (data2 || []).filter((row) => row.sku).map((row) => ({
    sku: row.sku,
    variantId: row.variant_id || "",
    title: row.product_title || row.sku,
    vendor: row.pickup_vendor || "",
    imageUrl: row.image_url || "",
    unitLabel: row.unit_label || row.price_unit_label || "",
    price: toNumberOrUndefined(row.price),
    contractorTier1Price: toNumberOrUndefined(
      row.contractor_tier_1_price ?? row.tier_1_price
    ),
    contractorTier2Price: toNumberOrUndefined(
      row.contractor_tier_2_price ?? row.tier_2_price
    )
  }));
}
async function getLatestProductSyncTimestamp() {
  const { data: data2, error } = await supabaseAdmin.from("product_source_map").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error("[GET PRODUCT SYNC TIMESTAMP ERROR]", error);
    return null;
  }
  return (data2 == null ? void 0 : data2.updated_at) || null;
}
async function syncProductOptionsToSupabase(products) {
  if (!products.length) return;
  const skus = products.map((product) => product.sku);
  const { data: existingRows, error: existingError } = await supabaseAdmin.from("product_source_map").select("sku, variant_id, product_title, pickup_vendor, image_url, price").in("sku", skus);
  if (existingError) {
    console.error("[GET EXISTING PRODUCT OPTIONS ERROR]", existingError);
    throw existingError;
  }
  const existingBySku = new Map(
    (existingRows || []).map((row) => [
      row.sku,
      row
    ])
  );
  const rows = products.map((product) => {
    const existing = existingBySku.get(product.sku);
    return {
      sku: product.sku,
      variant_id: product.variantId || (existing == null ? void 0 : existing.variant_id) || null,
      product_title: product.title || (existing == null ? void 0 : existing.product_title) || product.sku,
      pickup_vendor: product.vendor || (existing == null ? void 0 : existing.pickup_vendor) || "",
      image_url: product.imageUrl || (existing == null ? void 0 : existing.image_url) || null,
      price: product.price === null || product.price === void 0 ? (existing == null ? void 0 : existing.price) === null || (existing == null ? void 0 : existing.price) === void 0 ? null : Number(existing.price) : Number(product.price),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  });
  const { error } = await supabaseAdmin.from("product_source_map").upsert(rows, { onConflict: "sku" });
  if (error) {
    console.error("[SYNC PRODUCT OPTIONS ERROR]", error);
    throw error;
  }
}
async function fetchProductOptionsFromShopify(admin) {
  var _a2, _b, _c, _d, _e;
  const response = await admin.graphql(`
    query SyncProductsForQuotes {
      products(first: 100, sortKey: TITLE) {
        nodes {
          title
          vendor
          featuredImage {
            url
          }
          variants(first: 50) {
            nodes {
              id
              sku
              title
              price
              image {
                url
              }
            }
          }
        }
      }
    }
  `);
  const json = await response.json();
  const products = ((_b = (_a2 = json == null ? void 0 : json.data) == null ? void 0 : _a2.products) == null ? void 0 : _b.nodes) || [];
  const options = [];
  for (const product of products) {
    const productTitle = (product == null ? void 0 : product.title) || "";
    const vendor = (product == null ? void 0 : product.vendor) || "";
    const productImage = ((_c = product == null ? void 0 : product.featuredImage) == null ? void 0 : _c.url) || "";
    for (const variant of ((_d = product == null ? void 0 : product.variants) == null ? void 0 : _d.nodes) || []) {
      const sku = ((variant == null ? void 0 : variant.sku) || "").trim();
      if (!sku) continue;
      const variantTitle = ((variant == null ? void 0 : variant.title) || "").trim();
      const title = variantTitle && variantTitle !== "Default Title" ? `${productTitle} - ${variantTitle}` : productTitle;
      options.push({
        sku,
        variantId: (variant == null ? void 0 : variant.id) || "",
        title,
        vendor,
        imageUrl: ((_e = variant == null ? void 0 : variant.image) == null ? void 0 : _e.url) || productImage || "",
        price: (variant == null ? void 0 : variant.price) === null || (variant == null ? void 0 : variant.price) === void 0 ? void 0 : Number(variant.price)
      });
    }
  }
  return options.sort((a, b) => a.title.localeCompare(b.title));
}
async function ensureProductOptionsFresh(admin, maxAgeMs = 30 * 60 * 1e3) {
  const lastUpdatedAt = await getLatestProductSyncTimestamp();
  const isStale = !lastUpdatedAt || Date.now() - new Date(lastUpdatedAt).getTime() > maxAgeMs;
  if (!isStale) {
    return {
      synced: false,
      syncedCount: 0,
      lastUpdatedAt
    };
  }
  const products = await fetchProductOptionsFromShopify(admin);
  await syncProductOptionsToSupabase(products);
  return {
    synced: true,
    syncedCount: products.length,
    lastUpdatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
console.log("SHOPIFY_APP_URL =", process.env.SHOPIFY_APP_URL);
console.log("APP_URL =", process.env.APP_URL);
console.log("HOST =", process.env.HOST);
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  isEmbeddedApp: true,
  future: {
    expiringOfflineAccessTokens: true,
    unstable_newEmbeddedAuthStrategy: true
  },
  hooks: {
    afterAuth: async ({ admin, session }) => {
      try {
        console.log("[afterAuth] syncing products for", session.shop);
        const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
        const webhookCallbackUrl = `${appUrl}/webhooks/products/update`;
        await admin.graphql(`
      mutation {
        webhookSubscriptionCreate(
          topic: PRODUCTS_UPDATE,
          webhookSubscription: {
            callbackUrl: "${webhookCallbackUrl}",
            format: JSON
          }
        ) {
          userErrors {
            field
            message
          }
        }
      }
`);
        const syncResult = await ensureProductOptionsFresh(admin, 0);
        console.log("[afterAuth] synced", syncResult.syncedCount, "product variants");
      } catch (error) {
        console.error("[afterAuth] product sync failed", error);
      }
      try {
        await shopify.registerWebhooks({ session });
      } catch (error) {
        console.error("[afterAuth] webhook registration failed", error);
      }
    }
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.October25;
shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
function handleRequest(request, responseStatusCode, responseHeaders, reactRouterContext) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(ServerRouter, { context: reactRouterContext, url: request.url }),
      {
        onShellReady() {
          shellRendered = true;
          responseHeaders.set("Content-Type", "text/html");
          shopify.addDocumentResponseHeaders(request, responseHeaders);
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        }
      }
    );
    setTimeout(abort, 5e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest
}, Symbol.toStringTag, { value: "Module" }));
const links = () => {
  return [];
};
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root,
  links
}, Symbol.toStringTag, { value: "Module" }));
async function loader$8({
  request
}) {
  const url = new URL(request.url);
  const destination = `/app${url.search}`;
  return redirect(destination);
}
const route$1 = UNSAFE_withComponentProps(function Index() {
  return null;
});
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: route$1,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
async function saveCustomQuote(input) {
  const { data: data2, error } = await supabaseAdmin.from("custom_delivery_quotes").insert({
    shop: input.shop,
    customer_name: input.customerName || null,
    customer_email: input.customerEmail || null,
    customer_phone: input.customerPhone || null,
    address1: input.address1,
    address2: input.address2 || null,
    city: input.city,
    province: input.province,
    postal_code: input.postalCode,
    country: input.country,
    quote_total_cents: input.quoteTotalCents,
    service_name: input.serviceName || null,
    shipping_details: input.shippingDetails || null,
    description: input.description || null,
    eta: input.eta || null,
    summary: null,
    source_breakdown: input.sourceBreakdown,
    line_items: input.lineItems
  }).select("id").single();
  if (error) {
    console.error("[SAVE CUSTOM QUOTE ERROR]", error);
    throw error;
  }
  return data2;
}
async function getRecentCustomQuotes(limit = 20) {
  const { data: data2, error } = await supabaseAdmin.from("custom_delivery_quotes").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("[GET RECENT CUSTOM QUOTES ERROR]", error);
    return [];
  }
  return data2 || [];
}
async function getCustomQuoteById(id) {
  const { data: data2, error } = await supabaseAdmin.from("custom_delivery_quotes").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[GET CUSTOM QUOTE ERROR]", error);
    return null;
  }
  return data2 || null;
}
async function deleteCustomQuote(id) {
  const { error } = await supabaseAdmin.from("custom_delivery_quotes").delete().eq("id", id);
  if (error) {
    console.error("[DELETE CUSTOM QUOTE ERROR]", error);
    throw error;
  }
  return { id };
}
const cookieSecret = process.env.QUOTE_ACCESS_COOKIE_SECRET || "dev-secret-change-me";
const adminQuoteCookie = createCookie("admin_quote_access", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: true,
  secrets: [cookieSecret],
  maxAge: 60 * 60 * 12
});
async function hasAdminQuoteAccess(request) {
  const cookieHeader = request.headers.get("Cookie");
  const cookieValue = await adminQuoteCookie.parse(cookieHeader);
  return cookieValue === "ok";
}
function getAdminQuotePassword() {
  return process.env.ADMIN_QUOTE_PASSWORD || "";
}
function normalizeQuoteAudience(value) {
  if (value === "contractor") return "contractor";
  if (value === "custom") return "custom";
  return "customer";
}
function normalizeContractorTier(value) {
  return value === "tier2" ? "tier2" : "tier1";
}
function getUnitPriceForProduct(product, audience, contractorTier) {
  if (audience === "contractor") {
    if (contractorTier === "tier2") {
      return product.contractorTier2Price ?? product.contractorTier1Price ?? product.price ?? 0;
    }
    return product.contractorTier1Price ?? product.contractorTier2Price ?? product.price ?? 0;
  }
  if (audience === "custom") {
    return product.price ?? product.contractorTier1Price ?? product.contractorTier2Price ?? 0;
  }
  return product.price ?? 0;
}
function getPricingLabel(audience, contractorTier) {
  if (audience === "contractor") {
    return contractorTier === "tier2" ? "Contractor Tier 2" : "Contractor Tier 1";
  }
  if (audience === "custom") {
    return "Custom";
  }
  return "Customer";
}
let googlePlacesPromise = null;
function loadGooglePlaces(apiKey) {
  var _a2, _b;
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available"));
  }
  if ((_b = (_a2 = window.google) == null ? void 0 : _a2.maps) == null ? void 0 : _b.places) {
    return Promise.resolve();
  }
  if (googlePlacesPromise) {
    return googlePlacesPromise;
  }
  googlePlacesPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-google-places="true"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Places"))
      );
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googlePlaces = "true";
    script.onload = () => {
      var _a3, _b2;
      if ((_b2 = (_a3 = window.google) == null ? void 0 : _a3.maps) == null ? void 0 : _b2.places) {
        resolve();
      } else {
        reject(new Error("Google Places loaded, but places library missing"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load Google Places"));
    document.head.appendChild(script);
  });
  return googlePlacesPromise;
}
function attachAddressAutocomplete(options) {
  var _a2, _b;
  if (typeof window === "undefined" || !((_b = (_a2 = window.google) == null ? void 0 : _a2.maps) == null ? void 0 : _b.places)) {
    console.error("[GOOGLE PLACES] places library not available");
    return;
  }
  const address1 = document.getElementById(options.address1Id);
  const city = document.getElementById(options.cityId);
  const province = document.getElementById(options.provinceId);
  const postalCode = document.getElementById(options.postalCodeId);
  const country = document.getElementById(options.countryId);
  if (!address1 || !city || !province || !postalCode || !country) {
    console.error("[GOOGLE PLACES] missing address inputs");
    return;
  }
  const autocomplete = new window.google.maps.places.Autocomplete(address1, {
    types: ["address"],
    componentRestrictions: { country: ["us"] },
    fields: ["address_components", "formatted_address"]
  });
  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    const components = (place == null ? void 0 : place.address_components) || [];
    let streetNumber = "";
    let route26 = "";
    let locality = "";
    let administrativeArea = "";
    let zip = "";
    let countryCode = "US";
    for (const component of components) {
      const types = component.types || [];
      if (types.includes("street_number")) streetNumber = component.long_name || "";
      if (types.includes("route")) route26 = component.long_name || "";
      if (types.includes("locality")) locality = component.long_name || "";
      if (types.includes("administrative_area_level_1")) {
        administrativeArea = component.short_name || component.long_name || "";
      }
      if (types.includes("postal_code")) zip = component.long_name || "";
      if (types.includes("country")) {
        countryCode = component.short_name || component.long_name || "US";
      }
    }
    address1.value = [streetNumber, route26].filter(Boolean).join(" ").trim();
    city.value = locality;
    province.value = administrativeArea;
    postalCode.value = zip;
    country.value = countryCode;
  });
}
const DEFAULT_APP_SETTINGS = {
  useTestFlatRate: false,
  testFlatRateCents: 5e3,
  enableCalculatedRates: true,
  enableRemoteSurcharge: true,
  enableDebugLogging: false,
  showVendorSource: true
};
function mapRowToSettings(row, shop) {
  return {
    shop,
    useTestFlatRate: (row == null ? void 0 : row.use_test_flat_rate) ?? DEFAULT_APP_SETTINGS.useTestFlatRate,
    testFlatRateCents: (row == null ? void 0 : row.test_flat_rate_cents) ?? DEFAULT_APP_SETTINGS.testFlatRateCents,
    enableCalculatedRates: (row == null ? void 0 : row.enable_calculated_rates) ?? DEFAULT_APP_SETTINGS.enableCalculatedRates,
    enableRemoteSurcharge: (row == null ? void 0 : row.enable_remote_surcharge) ?? DEFAULT_APP_SETTINGS.enableRemoteSurcharge,
    enableDebugLogging: (row == null ? void 0 : row.enable_debug_logging) ?? DEFAULT_APP_SETTINGS.enableDebugLogging,
    showVendorSource: (row == null ? void 0 : row.show_vendor_source) ?? DEFAULT_APP_SETTINGS.showVendorSource
  };
}
async function getAppSettings(shop) {
  const { data: data2, error } = await supabaseAdmin.from("shopify_app_settings").select("*").eq("shop", shop).maybeSingle();
  if (error) {
    console.error("[GET APP SETTINGS ERROR]", error);
    return {
      shop,
      ...DEFAULT_APP_SETTINGS
    };
  }
  return mapRowToSettings(data2, shop);
}
async function saveAppSettings(shop, values) {
  const payload = {
    shop,
    use_test_flat_rate: values.useTestFlatRate,
    test_flat_rate_cents: values.testFlatRateCents,
    enable_calculated_rates: values.enableCalculatedRates,
    enable_remote_surcharge: values.enableRemoteSurcharge,
    enable_debug_logging: values.enableDebugLogging,
    show_vendor_source: values.showVendorSource,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const { data: data2, error } = await supabaseAdmin.from("shopify_app_settings").upsert(payload, { onConflict: "shop" }).select("*").single();
  if (error) {
    console.error("[SAVE APP SETTINGS ERROR]", error);
    throw error;
  }
  return mapRowToSettings(data2, shop);
}
const DEFAULT_MAX_QTY_PER_TRUCK = 22;
const RATE_PER_MINUTE = 2.08;
const MAX_DELIVERY_RADIUS_MILES = 50;
const OUTSIDE_RADIUS_PHONE = "(262) 345-4001";
const TTL_SHORT = 6e4;
const TTL_LONG = 10 * 6e4;
const FALLBACK_MATERIAL_RULES = [
  {
    prefix: "100",
    material_name: "Aggregate",
    truck_capacity: 22,
    vendor_source: "Aggregate",
    is_active: true,
    sort_order: 100
  },
  {
    prefix: "300",
    material_name: "Mulch",
    truck_capacity: 25,
    vendor_source: "Mulch",
    is_active: true,
    sort_order: 300
  },
  {
    prefix: "400",
    material_name: "Soil",
    truck_capacity: 25,
    vendor_source: "Soil",
    is_active: true,
    sort_order: 400
  },
  {
    prefix: "499",
    material_name: "Field Run",
    truck_capacity: 20,
    vendor_source: "Field Run",
    is_active: true,
    sort_order: 499
  }
];
function getCache(entry2) {
  if (!entry2) return null;
  if (Date.now() > entry2.expiresAt) return null;
  return entry2.value;
}
function setCache(value, ttlMs) {
  return {
    value,
    expiresAt: Date.now() + ttlMs
  };
}
let materialRulesCache = null;
let activeOriginCache = null;
const vendorOriginCache = /* @__PURE__ */ new Map();
const distanceMatrixCache = /* @__PURE__ */ new Map();
async function getActiveOriginAddress() {
  const cached = getCache(activeOriginCache);
  if (cached) return cached;
  const { data: data2 } = await supabaseAdmin.from("origin_addresses").select("label, address").eq("is_active", true).limit(1).single();
  const result = data2 || {
    label: "Menomonee Falls",
    address: "W185 N7487 Narrow Ln, Menomonee Falls, WI 53051"
  };
  activeOriginCache = setCache(result, TTL_SHORT);
  return result;
}
async function getOriginFromVendorLabel(vendorLabel) {
  if (!vendorLabel) return null;
  const cleaned = vendorLabel.trim();
  const cacheKey = cleaned.toLowerCase();
  const cached = vendorOriginCache.get(cacheKey);
  const cachedValue = getCache(cached || null);
  if (cachedValue !== null) return cachedValue;
  let data2 = null;
  const exact = await supabaseAdmin.from("origin_addresses").select("label, address").ilike("label", cleaned).limit(1).maybeSingle();
  if (exact.data) {
    data2 = exact.data;
  } else {
    const contains = await supabaseAdmin.from("origin_addresses").select("label, address").ilike("label", `%${cleaned}%`).limit(1).maybeSingle();
    data2 = contains.data || null;
  }
  vendorOriginCache.set(cacheKey, setCache(data2, TTL_LONG));
  return data2;
}
async function getMaterialRules() {
  const cached = getCache(materialRulesCache);
  if (cached) return cached;
  const { data: data2, error } = await supabaseAdmin.from("shipping_material_rules").select("prefix, material_name, truck_capacity, vendor_source, is_active, sort_order").eq("is_active", true).order("sort_order", { ascending: true });
  const result = error || !data2 || data2.length === 0 ? FALLBACK_MATERIAL_RULES : data2;
  materialRulesCache = setCache(result, TTL_SHORT);
  return result;
}
function normalizeSku(value) {
  return (value || "").trim();
}
function getMaterialFromSku(sku, rules) {
  const normalizedSku = normalizeSku(sku);
  const match = normalizedSku.match(/^(\d{3})/);
  const prefix = match ? match[1] : null;
  if (!prefix) {
    return {
      prefix: null,
      materialName: "Material",
      truckCapacity: DEFAULT_MAX_QTY_PER_TRUCK,
      fallbackVendorSource: ""
    };
  }
  const rule = rules.find((entry2) => entry2.prefix === prefix);
  if (!rule) {
    return {
      prefix,
      materialName: "Material",
      truckCapacity: DEFAULT_MAX_QTY_PER_TRUCK,
      fallbackVendorSource: ""
    };
  }
  return {
    prefix,
    materialName: rule.material_name,
    truckCapacity: Number(rule.truck_capacity) || DEFAULT_MAX_QTY_PER_TRUCK,
    fallbackVendorSource: rule.vendor_source || ""
  };
}
function buildServiceName(materialNames, totalTrucks) {
  const uniqueMaterials = Array.from(new Set(materialNames)).map((name) => (name || "").trim()).filter(Boolean);
  let baseName = "Green Hills Delivery";
  if (uniqueMaterials.length === 1) {
    baseName = `${uniqueMaterials[0]} Delivery`;
  } else if (uniqueMaterials.length > 1) {
    baseName = "Bulk Material Delivery";
  }
  if (totalTrucks > 1) {
    return `${baseName} (${totalTrucks} Loads)`;
  }
  return baseName;
}
function buildServiceDescription(totalTrucks, sourceText) {
  const baseDescription = totalTrucks > 1 ? `${totalTrucks} truck loads required for this order` : "Standard delivery pricing";
  return `${baseDescription}${sourceText || ""}`;
}
function normalizeAddressKey(address) {
  return address.trim().toLowerCase();
}
async function getDistanceMatrix(origins, destinations, googleMapsApiKey) {
  const originKey = origins.map(normalizeAddressKey).join("||");
  const destinationKey = destinations.map(normalizeAddressKey).join("||");
  const cacheKey = `${originKey}>>>${destinationKey}`;
  const cached = distanceMatrixCache.get(cacheKey);
  const cachedValue = getCache(cached || null);
  if (cachedValue !== null) return cachedValue;
  const mapsUrl = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  mapsUrl.searchParams.set("origins", origins.join("|"));
  mapsUrl.searchParams.set("destinations", destinations.join("|"));
  mapsUrl.searchParams.set("key", googleMapsApiKey);
  mapsUrl.searchParams.set("units", "imperial");
  const res = await fetch(mapsUrl.toString());
  const data2 = await res.json();
  if (data2.status !== "OK" || !data2.rows) {
    distanceMatrixCache.set(cacheKey, setCache(null, TTL_SHORT));
    return null;
  }
  const matrix = data2.rows.map(
    (row) => (row.elements || []).map((element) => {
      var _a2, _b;
      if (!element || element.status !== "OK" || ((_a2 = element.duration) == null ? void 0 : _a2.value) === void 0 || ((_b = element.distance) == null ? void 0 : _b.value) === void 0) {
        return null;
      }
      return {
        minutes: element.duration.value / 60,
        miles: Math.round(element.distance.value / 1609.34 * 10) / 10
      };
    })
  );
  distanceMatrixCache.set(cacheKey, setCache(matrix, TTL_LONG));
  return matrix;
}
async function getQuote(input) {
  var _a2, _b, _c, _d, _e;
  const settings = await getAppSettings(input.shop);
  if (!settings.enableCalculatedRates) {
    return {
      serviceName: "Delivery Unavailable",
      serviceCode: "CUSTOM_DELIVERY",
      cents: 0,
      description: "Calculated delivery rates are currently disabled",
      eta: "Unavailable",
      summary: "Calculated delivery rates are currently disabled"
    };
  }
  if (settings.useTestFlatRate) {
    return {
      serviceName: "Test Delivery Rate",
      serviceCode: "CUSTOM_DELIVERY",
      cents: settings.testFlatRateCents,
      description: "Test flat rate enabled",
      eta: "2–4 business days",
      summary: `Test flat rate: $${(settings.testFlatRateCents / 100).toFixed(2)}`
    };
  }
  const destinationParts = [
    input.address1,
    input.address2,
    input.city,
    input.province,
    input.postalCode,
    input.country
  ].filter(Boolean);
  const customerAddress = destinationParts.join(", ");
  if (!customerAddress) {
    return {
      serviceName: "Delivery Unavailable",
      serviceCode: "CUSTOM_DELIVERY",
      cents: 0,
      description: "Missing destination address",
      eta: "Unavailable",
      summary: "Missing destination address"
    };
  }
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    return {
      serviceName: "Delivery Unavailable",
      serviceCode: "CUSTOM_DELIVERY",
      cents: 0,
      description: "Google Maps API key is not configured",
      eta: "Unavailable",
      summary: "Google Maps API key is not configured"
    };
  }
  const materialRules = await getMaterialRules();
  const defaultYard = await getActiveOriginAddress();
  const shippableItems = input.items.filter((item) => item.requiresShipping !== false);
  const groupedItems = {};
  const materialLabels = [];
  const sourceLabels = [];
  for (const item of shippableItems) {
    const itemQty = item.quantity || 1;
    const { prefix, materialName, truckCapacity, fallbackVendorSource } = getMaterialFromSku(item.sku, materialRules);
    const pickupVendorLabel = item.pickupVendor || fallbackVendorSource || defaultYard.label;
    const pickupOrigin = await getOriginFromVendorLabel(pickupVendorLabel) || defaultYard;
    materialLabels.push(materialName);
    if (settings.showVendorSource && pickupOrigin.label) {
      sourceLabels.push(pickupOrigin.label);
    }
    const groupKey = [
      pickupOrigin.address,
      pickupOrigin.label,
      materialName,
      truckCapacity
    ].join("|");
    if (!groupedItems[groupKey]) {
      groupedItems[groupKey] = {
        qty: 0,
        materialName,
        truckCapacity,
        pickupVendor: pickupOrigin.label,
        pickupAddress: pickupOrigin.address
      };
    }
    groupedItems[groupKey].qty += itemQty;
    if (settings.enableDebugLogging) {
      console.log(
        `[QUOTE ITEM] prefix=${prefix || "none"} sku=${item.sku || "none"} material=${materialName} pickupVendor=${pickupOrigin.label} qty=${itemQty} capacity=${truckCapacity}`
      );
    }
  }
  let totalDeliveryCostCents = 0;
  let totalTrucks = 0;
  let maxOneWayMiles = 0;
  const groups = Object.values(groupedItems);
  const pickupAddresses = Array.from(new Set(groups.map((group) => group.pickupAddress)));
  const origins = [defaultYard.address, ...pickupAddresses, customerAddress];
  const destinations = [defaultYard.address, customerAddress];
  const matrix = await getDistanceMatrix(origins, destinations, googleMapsApiKey);
  if (!matrix) {
    return {
      serviceName: "Delivery Unavailable",
      serviceCode: "CUSTOM_DELIVERY",
      cents: 0,
      description: "Unable to calculate delivery route",
      eta: "Unavailable",
      summary: "Unable to calculate delivery route"
    };
  }
  const customerOriginIndex = origins.length - 1;
  const destinationYardIndex = 0;
  const destinationCustomerIndex = 1;
  const pickupIndexMap = /* @__PURE__ */ new Map();
  pickupAddresses.forEach((address, index) => {
    pickupIndexMap.set(address, index + 1);
  });
  for (const group of groups) {
    const trucksForGroup = Math.max(1, Math.ceil(group.qty / group.truckCapacity));
    const pickupOriginIndex = pickupIndexMap.get(group.pickupAddress);
    if (pickupOriginIndex === void 0) continue;
    const pickupToYard = (_a2 = matrix[pickupOriginIndex]) == null ? void 0 : _a2[destinationYardIndex];
    const pickupToCustomer = (_b = matrix[pickupOriginIndex]) == null ? void 0 : _b[destinationCustomerIndex];
    const customerToYard = (_c = matrix[customerOriginIndex]) == null ? void 0 : _c[destinationYardIndex];
    if (!pickupToYard || !pickupToCustomer || !customerToYard) continue;
    const totalLoopMinutes = pickupToYard.minutes + pickupToCustomer.minutes + customerToYard.minutes;
    const totalLoopMiles = pickupToYard.miles + pickupToCustomer.miles + customerToYard.miles;
    const oneWayMilesForRadiusCheck = pickupToCustomer.miles;
    if (oneWayMilesForRadiusCheck > maxOneWayMiles) {
      maxOneWayMiles = oneWayMilesForRadiusCheck;
    }
    let groupCostDollars = totalLoopMinutes * RATE_PER_MINUTE * trucksForGroup;
    if (settings.enableRemoteSurcharge && input.postalCode.startsWith("9")) {
      groupCostDollars += 3;
    }
    totalDeliveryCostCents += Math.round(groupCostDollars * 100);
    totalTrucks += trucksForGroup;
    if (settings.enableDebugLogging) {
      console.log(
        `[QUOTE GROUP BATCH] source=${group.pickupVendor} material=${group.materialName} qty=${group.qty} capacity=${group.truckCapacity} trucks=${trucksForGroup} customerMiles=${oneWayMilesForRadiusCheck} loopMiles=${totalLoopMiles} cost=${groupCostDollars.toFixed(2)}`
      );
    }
  }
  if (totalTrucks === 0) {
    const yardToCustomer = (_d = matrix[0]) == null ? void 0 : _d[destinationCustomerIndex];
    const customerToYard = (_e = matrix[customerOriginIndex]) == null ? void 0 : _e[destinationYardIndex];
    if (yardToCustomer && customerToYard) {
      maxOneWayMiles = yardToCustomer.miles;
      let fallbackDollars = (yardToCustomer.minutes + customerToYard.minutes) * RATE_PER_MINUTE;
      if (settings.enableRemoteSurcharge && input.postalCode.startsWith("9")) {
        fallbackDollars += 3;
      }
      totalDeliveryCostCents = Math.round(fallbackDollars * 100);
      totalTrucks = 1;
    }
  }
  if (maxOneWayMiles > MAX_DELIVERY_RADIUS_MILES) {
    return {
      serviceName: "Call for delivery quote",
      serviceCode: "CALL_FOR_QUOTE",
      cents: 1,
      description: "Outside delivery area — please call for custom quote",
      eta: "Same business day",
      summary: "Custom delivery quote required",
      outsideDeliveryArea: true,
      outsideDeliveryMiles: maxOneWayMiles,
      outsideDeliveryRadius: MAX_DELIVERY_RADIUS_MILES,
      outsideDeliveryPhone: OUTSIDE_RADIUS_PHONE
    };
  }
  const uniqueSources = Array.from(new Set(sourceLabels)).filter(Boolean);
  const sourceText = settings.showVendorSource && uniqueSources.length > 0 ? ` Source: ${uniqueSources.join(", ")}.` : "";
  return {
    serviceName: buildServiceName(materialLabels, totalTrucks),
    serviceCode: "CUSTOM_DELIVERY",
    cents: totalDeliveryCostCents,
    description: buildServiceDescription(totalTrucks, sourceText),
    eta: "2–4 business days",
    summary: `Shipping: $${(totalDeliveryCostCents / 100).toFixed(2)}`,
    outsideDeliveryArea: false,
    outsideDeliveryMiles: maxOneWayMiles,
    outsideDeliveryRadius: MAX_DELIVERY_RADIUS_MILES,
    outsideDeliveryPhone: OUTSIDE_RADIUS_PHONE
  };
}
function getSourceBreakdown(selectedLines) {
  const grouped = /* @__PURE__ */ new Map();
  for (const line of selectedLines) {
    const existing = grouped.get(line.vendor) || {
      vendor: line.vendor,
      quantity: 0,
      items: []
    };
    existing.quantity += line.quantity;
    existing.items.push(`${line.title} (${line.sku})`);
    grouped.set(line.vendor, existing);
  }
  return Array.from(grouped.values());
}
function formatQuantityWithUnit(quantity, unitLabel) {
  const normalizedQuantity = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, "");
  const normalizedUnit = String(unitLabel || "").trim();
  return normalizedUnit ? `${normalizedQuantity} ${normalizedUnit}` : `Qty ${normalizedQuantity}`;
}
async function loader$7({
  request
}) {
  const url = new URL(request.url);
  if (url.searchParams.get("logout") === "1") {
    return redirect("/custom-quote", {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("", {
          maxAge: 0
        })
      }
    });
  }
  const allowed = await hasAdminQuoteAccess(request);
  const products = allowed ? await getProductOptionsFromSupabase() : [];
  const recentQuotes = allowed ? await getRecentCustomQuotes(15) : [];
  return data({
    allowed,
    products,
    recentQuotes,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
  });
}
async function action$d({
  request
}) {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  if (intent === "login") {
    const password = String(form.get("password") || "");
    const expected = getAdminQuotePassword();
    if (!expected || password !== expected) {
      return data({
        allowed: false,
        loginError: "Invalid password",
        products: [],
        recentQuotes: [],
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
      }, {
        status: 401
      });
    }
    const products2 = await getProductOptionsFromSupabase();
    const recentQuotes2 = await getRecentCustomQuotes(15);
    return data({
      allowed: true,
      products: products2,
      recentQuotes: recentQuotes2,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
    }, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("ok")
      }
    });
  }
  const allowed = await hasAdminQuoteAccess(request);
  if (!allowed) {
    return data({
      allowed: false,
      loginError: "Please log in",
      products: [],
      recentQuotes: [],
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
    }, {
      status: 401
    });
  }
  const products = await getProductOptionsFromSupabase();
  const recentQuotes = await getRecentCustomQuotes(15);
  const customerName = String(form.get("customerName") || "");
  const customerEmail = String(form.get("customerEmail") || "").trim();
  const customerPhone = String(form.get("customerPhone") || "").trim();
  const address1 = String(form.get("address1") || "");
  const address2 = String(form.get("address2") || "");
  const city = String(form.get("city") || "");
  const province = String(form.get("province") || "");
  const postalCode = String(form.get("postalCode") || "");
  const country = String(form.get("country") || "US");
  const quoteAudience = normalizeQuoteAudience(form.get("quoteAudience"));
  const contractorTier = normalizeContractorTier(form.get("contractorTier"));
  const pricingLabel = getPricingLabel(quoteAudience, contractorTier);
  const customDeliveryAmountInput = String(form.get("customDeliveryAmount") || "").trim();
  const customTaxRateInput = String(form.get("customTaxRate") || "").trim();
  const customNotes = String(form.get("customNotes") || "").trim();
  const customShippingQuantityInput = String(form.get("customShippingQuantity") || "").trim();
  const customShippingUnit = String(form.get("customShippingUnit") || "miles").trim() === "hours" ? "hours" : "miles";
  const customShippingRateInput = String(form.get("customShippingRate") || "").trim();
  const customDeliveryAmountValue = Number(customDeliveryAmountInput);
  const customTaxRateValue = Number(customTaxRateInput);
  const customShippingQuantityValue = Number(customShippingQuantityInput);
  const customShippingRateValue = Number(customShippingRateInput);
  const hasCustomShippingCalculation = quoteAudience === "custom" && customShippingQuantityInput !== "" && customShippingRateInput !== "" && Number.isFinite(customShippingQuantityValue) && Number.isFinite(customShippingRateValue);
  const rawLines = JSON.parse(String(form.get("linesJson") || "[]"));
  const selectedProducts = rawLines.map((line) => {
    const sku = String((line == null ? void 0 : line.sku) || "").trim();
    const quantity = Number((line == null ? void 0 : line.quantity) || 0);
    const product = products.find((p) => p.sku === sku);
    const baseUnitPrice = product ? getUnitPriceForProduct(product, quoteAudience, contractorTier) : 0;
    const overrideTitle = String((line == null ? void 0 : line.customTitle) || "").trim();
    const rawCustomPrice = String((line == null ? void 0 : line.customPrice) || "").trim();
    const overridePrice = quoteAudience === "custom" && rawCustomPrice !== "" ? Number(rawCustomPrice) : null;
    const unitPrice = overridePrice !== null && Number.isFinite(overridePrice) ? overridePrice : baseUnitPrice;
    if (!sku || quantity <= 0 || !product) return null;
    return {
      title: overrideTitle || product.title,
      sku: product.sku,
      vendor: product.vendor,
      unitLabel: product.unitLabel || "",
      quantity,
      price: unitPrice
    };
  }).filter(Boolean);
  if (selectedProducts.length === 0) {
    return data({
      allowed: true,
      products,
      recentQuotes,
      ok: false,
      message: "Add at least one product line with a selected product and quantity greater than 0.",
      customerName,
      customerEmail,
      customerPhone,
      address: {
        address1,
        address2,
        city,
        province,
        postalCode,
        country
      },
      quoteAudience,
      contractorTier,
      customDeliveryAmount: customDeliveryAmountInput,
      customTaxRate: customTaxRateInput,
      customShippingQuantity: customShippingQuantityInput,
      customShippingUnit,
      customShippingRate: customShippingRateInput,
      customNotes,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
    }, {
      status: 400
    });
  }
  if (!address1 || !city || !province || !postalCode) {
    return data({
      allowed: true,
      products,
      recentQuotes,
      ok: false,
      message: "Address 1, city, state, and ZIP are required.",
      customerName,
      customerEmail,
      customerPhone,
      address: {
        address1,
        address2,
        city,
        province,
        postalCode,
        country
      },
      quoteAudience,
      contractorTier,
      customDeliveryAmount: customDeliveryAmountInput,
      customTaxRate: customTaxRateInput,
      customShippingQuantity: customShippingQuantityInput,
      customShippingUnit,
      customShippingRate: customShippingRateInput,
      customNotes,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
    }, {
      status: 400
    });
  }
  const shop = process.env.SHOPIFY_STORE_DOMAIN || "darfaz-2e.myshopify.com";
  const deliveryQuote = await getQuote({
    shop,
    postalCode,
    country,
    province,
    city,
    address1,
    address2,
    items: selectedProducts.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      requiresShipping: true,
      pickupVendor: item.vendor,
      price: item.price
    }))
  });
  const productsSubtotal = selectedProducts.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
  const deliveryAmount = Number(deliveryQuote.cents || 0) / 100;
  const effectiveDeliveryAmount = hasCustomShippingCalculation ? customShippingQuantityValue * customShippingRateValue : quoteAudience === "custom" && customDeliveryAmountInput !== "" ? Number.isFinite(customDeliveryAmountValue) ? customDeliveryAmountValue : deliveryAmount : deliveryAmount;
  const taxableSubtotal = productsSubtotal + effectiveDeliveryAmount;
  const taxRate = quoteAudience === "custom" && customTaxRateInput !== "" ? Number.isFinite(customTaxRateValue) ? customTaxRateValue : Number(process.env.QUOTE_TAX_RATE || "0") : Number(process.env.QUOTE_TAX_RATE || "0");
  const taxAmount = taxableSubtotal * taxRate;
  const totalAmount = taxableSubtotal + taxAmount;
  const effectiveServiceName = deliveryQuote.serviceName;
  const effectiveEta = deliveryQuote.eta;
  const effectiveSummary = deliveryQuote.summary;
  const effectiveDescription = quoteAudience === "custom" && customNotes ? customNotes : deliveryQuote.description;
  const shippingCalculationText = hasCustomShippingCalculation ? `${customShippingQuantityValue.toFixed(2)} ${customShippingUnit} x $${customShippingRateValue.toFixed(2)} = $${effectiveDeliveryAmount.toFixed(2)}` : null;
  const sourceBreakdown = getSourceBreakdown(selectedProducts);
  let savedQuoteId = null;
  if (intent === "save") {
    const saved = await saveCustomQuote({
      shop,
      customerName,
      customerEmail,
      customerPhone,
      address1,
      address2,
      city,
      province,
      postalCode,
      country,
      quoteTotalCents: Math.round(totalAmount * 100),
      serviceName: effectiveServiceName,
      shippingDetails: shippingCalculationText || void 0,
      description: `${effectiveDescription} Pricing: ${pricingLabel}.`,
      eta: effectiveEta,
      sourceBreakdown,
      lineItems: selectedProducts.map((product) => {
        var _a2;
        return {
          ...product,
          variantId: ((_a2 = products.find((entry2) => entry2.sku === product.sku)) == null ? void 0 : _a2.variantId) || null,
          audience: quoteAudience,
          contractorTier: quoteAudience === "contractor" ? contractorTier : null,
          pricingLabel
        };
      })
    });
    savedQuoteId = saved.id;
  }
  return data({
    allowed: true,
    products,
    recentQuotes,
    ok: true,
    customerName,
    customerEmail,
    customerPhone,
    address: {
      address1,
      address2,
      city,
      province,
      postalCode,
      country
    },
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    savedQuoteId,
    selectedLines: selectedProducts,
    sourceBreakdown,
    pricing: {
      pricingLabel,
      productsSubtotal,
      deliveryAmount: effectiveDeliveryAmount,
      taxRate,
      taxAmount,
      totalAmount
    },
    deliveryQuote: {
      ...deliveryQuote,
      serviceName: effectiveServiceName,
      eta: effectiveEta,
      summary: effectiveSummary,
      description: effectiveDescription,
      cents: Math.round(effectiveDeliveryAmount * 100)
    },
    quoteAudience,
    contractorTier,
    customDeliveryAmount: customDeliveryAmountInput,
    customTaxRate: customTaxRateInput,
    customShippingQuantity: customShippingQuantityInput,
    customShippingUnit,
    customShippingRate: customShippingRateInput,
    shippingCalculationText,
    customNotes
  });
}
const styles$2 = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top, #1f2937 0%, #111827 45%, #030712 100%)",
    color: "#f9fafb",
    padding: "32px 20px 60px",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  shell: {
    maxWidth: "1280px",
    margin: "0 auto"
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    marginBottom: "24px",
    flexWrap: "wrap"
  },
  title: {
    margin: 0,
    fontSize: "34px",
    fontWeight: 800,
    letterSpacing: "-0.02em"
  },
  subtitle: {
    marginTop: "8px",
    color: "#9ca3af",
    fontSize: "15px"
  },
  logout: {
    color: "#cbd5e1",
    textDecoration: "none",
    border: "1px solid #374151",
    background: "rgba(17, 24, 39, 0.75)",
    padding: "10px 14px",
    borderRadius: "10px",
    fontWeight: 600
  },
  card: {
    background: "rgba(17, 24, 39, 0.88)",
    border: "1px solid #1f2937",
    borderRadius: "18px",
    padding: "22px",
    boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
    backdropFilter: "blur(10px)"
  },
  sectionTitle: {
    margin: "0 0 14px 0",
    fontSize: "20px",
    fontWeight: 700,
    color: "#f8fafc"
  },
  sectionSub: {
    margin: "0 0 18px 0",
    color: "#9ca3af",
    fontSize: "14px"
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#d1d5db",
    marginBottom: "6px"
  },
  input: {
    width: "100%",
    background: "#0f172a",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "14px",
    outline: "none"
  },
  buttonPrimary: {
    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "12px 18px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(37, 99, 235, 0.35)"
  },
  buttonSecondary: {
    background: "#0f766e",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "12px 18px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(15, 118, 110, 0.35)"
  },
  buttonGhost: {
    background: "#111827",
    color: "#e5e7eb",
    border: "1px solid #374151",
    borderRadius: "12px",
    padding: "12px 18px",
    fontWeight: 600,
    cursor: "pointer"
  },
  tabRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "18px"
  },
  tabButton: {
    borderRadius: "999px",
    padding: "10px 16px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#cbd5e1",
    cursor: "pointer",
    fontWeight: 700
  },
  tabButtonActive: {
    background: "linear-gradient(135deg, #0f766e 0%, #115e59 100%)",
    color: "#f0fdfa",
    border: "1px solid #14b8a6",
    boxShadow: "0 10px 24px rgba(20, 184, 166, 0.2)"
  },
  statusOk: {
    marginTop: "18px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "rgba(22, 163, 74, 0.15)",
    border: "1px solid rgba(34, 197, 94, 0.5)",
    color: "#dcfce7"
  },
  statusErr: {
    marginTop: "18px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "rgba(220, 38, 38, 0.15)",
    border: "1px solid rgba(248, 113, 113, 0.5)",
    color: "#fee2e2"
  }
};
const customQuote = UNSAFE_withComponentProps(function PublicCustomQuotePage() {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const draftOrderFetcher = useFetcher();
  const deleteQuoteFetcher = useFetcher();
  const navigation = useNavigation();
  const location = useLocation();
  const isSubmitting = navigation.state === "submitting";
  const allowed = (actionData == null ? void 0 : actionData.allowed) ?? loaderData.allowed;
  const products = (actionData == null ? void 0 : actionData.products) ?? loaderData.products ?? [];
  const recentQuotes = (actionData == null ? void 0 : actionData.recentQuotes) ?? loaderData.recentQuotes ?? [];
  const googleMapsApiKey = (actionData == null ? void 0 : actionData.googleMapsApiKey) ?? loaderData.googleMapsApiKey ?? "";
  const embeddedQs = location.search || "";
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const urlParams = new URLSearchParams(location.search);
  const initialAudience = normalizeQuoteAudience(urlParams.get("audience"));
  const initialTier = normalizeContractorTier(urlParams.get("tier"));
  const createDraftOrderAction = location.pathname.startsWith("/app/") ? `/app/api/create-draft-order${embeddedQs}` : `/api/create-draft-order${embeddedQs}`;
  const deleteQuoteAction = location.pathname.startsWith("/app/") ? `/app/api/delete-quote${embeddedQs}` : `/api/delete-quote${embeddedQs}`;
  const quoteReviewHref = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  const logoutHref = isEmbeddedRoute ? "/app/custom-quote?logout=1" : "/custom-quote?logout=1";
  const mobileDashboardHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const [googleStatus, setGoogleStatus] = useState("Not loaded");
  const [quoteAudience, setQuoteAudience] = useState(normalizeQuoteAudience((actionData == null ? void 0 : actionData.quoteAudience) ?? initialAudience));
  const [contractorTier, setContractorTier] = useState(normalizeContractorTier((actionData == null ? void 0 : actionData.contractorTier) ?? initialTier));
  const [lines, setLines] = useState([{
    sku: "",
    quantity: "",
    search: "",
    customTitle: "",
    customPrice: ""
  }]);
  const [selectedHistoryQuoteId, setSelectedHistoryQuoteId] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [historyDetailsOpen, setHistoryDetailsOpen] = useState({
    customer: true,
    lineItems: false,
    sourceBreakdown: false
  });
  const deferredLines = useDeferredValue(lines);
  const productSearchIndex = useMemo(() => products.map((product) => ({
    product,
    haystack: `${product.title} ${product.sku} ${product.vendor}`.toLowerCase()
  })), [products]);
  useEffect(() => {
    if (!allowed) return;
    if (!googleMapsApiKey) {
      setGoogleStatus("Missing API key");
      return;
    }
    loadGooglePlaces(googleMapsApiKey).then(() => {
      attachAddressAutocomplete({
        address1Id: "quote-address1",
        cityId: "quote-city",
        provinceId: "quote-province",
        postalCodeId: "quote-postalCode",
        countryId: "quote-country"
      });
      setGoogleStatus("Loaded");
    }).catch((error) => {
      console.error("[GOOGLE PLACES LOAD ERROR]", error);
      setGoogleStatus(`Error: ${error.message}`);
    });
  }, [allowed, googleMapsApiKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 820px)");
    const updateViewport = () => setIsMobile(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);
  useEffect(() => {
    var _a3, _b2;
    if (((_a3 = deleteQuoteFetcher.data) == null ? void 0 : _a3.ok) && ((_b2 = deleteQuoteFetcher.data) == null ? void 0 : _b2.deletedQuoteId)) {
      setSelectedHistoryQuoteId((current) => current === deleteQuoteFetcher.data.deletedQuoteId ? null : current);
    }
  }, [deleteQuoteFetcher.data]);
  useEffect(() => {
    setQuoteAudience(normalizeQuoteAudience((actionData == null ? void 0 : actionData.quoteAudience) ?? initialAudience));
    setContractorTier(normalizeContractorTier((actionData == null ? void 0 : actionData.contractorTier) ?? initialTier));
  }, [actionData == null ? void 0 : actionData.quoteAudience, actionData == null ? void 0 : actionData.contractorTier, initialAudience, initialTier]);
  const quoteText = useMemo(() => {
    var _a3;
    if (!(actionData == null ? void 0 : actionData.pricing) || !(actionData == null ? void 0 : actionData.deliveryQuote)) return "";
    const linesText = ((_a3 = actionData.selectedLines) == null ? void 0 : _a3.map((line) => `${formatQuantityWithUnit(Number(line.quantity || 0), line.unitLabel)} ${line.title}: $${(Number(line.price || 0) * Number(line.quantity || 0)).toFixed(2)}`).join("\n")) || "";
    return [linesText, `Delivery Fee: $${Number(actionData.pricing.deliveryAmount).toFixed(2)}`, `Tax: $${Number(actionData.pricing.taxAmount).toFixed(2)}`, `Total: $${Number(actionData.pricing.totalAmount).toFixed(2)}`].filter(Boolean).join("\n");
  }, [actionData]);
  const selectedHistoryQuote = useMemo(() => recentQuotes.find((quote) => quote.id === selectedHistoryQuoteId) || null, [recentQuotes, selectedHistoryQuoteId]);
  const mobileActionButtonStyle = {
    ...styles$2.buttonGhost,
    minHeight: isMobile ? 48 : void 0,
    width: isMobile ? "100%" : void 0,
    justifyContent: "center"
  };
  const mobileTabLinkStyle = (active) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 56,
    borderRadius: 14,
    textDecoration: "none",
    color: active ? "#38bdf8" : "#94a3b8",
    background: active ? "rgba(14, 165, 233, 0.12)" : "transparent",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.01em"
  });
  const mobileTabIconStyle = (active) => ({
    width: 24,
    height: 24,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: active ? "rgba(14, 165, 233, 0.18)" : "rgba(51, 65, 85, 0.35)",
    color: active ? "#38bdf8" : "#cbd5e1",
    fontSize: 12,
    lineHeight: 1
  });
  const mobileBottomNavStyle = {
    position: "fixed",
    left: 12,
    right: 12,
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
    zIndex: 30,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 20,
    background: "rgba(15, 23, 42, 0.96)",
    border: "1px solid rgba(30, 41, 59, 0.95)",
    boxShadow: "0 18px 38px rgba(2, 6, 23, 0.45)",
    backdropFilter: "blur(14px)"
  };
  function toggleHistorySection(key) {
    setHistoryDetailsOpen((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }
  const historyQuoteText = useMemo(() => {
    var _a3;
    if (!selectedHistoryQuote) return "";
    const linesText = ((_a3 = selectedHistoryQuote.line_items) == null ? void 0 : _a3.map((line) => {
      const lineTotal = Number(line.price || 0) * Number(line.quantity || 0);
      return `${line.title} (${line.sku}) x ${line.quantity} — $${lineTotal.toFixed(2)}`;
    }).join("\n")) || "";
    return [`Customer: ${selectedHistoryQuote.customer_name || ""}`, `Email: ${selectedHistoryQuote.customer_email || ""}`, `Phone: ${selectedHistoryQuote.customer_phone || ""}`, `Address: ${selectedHistoryQuote.address1 || ""}, ${selectedHistoryQuote.city || ""}, ${selectedHistoryQuote.province || ""} ${selectedHistoryQuote.postal_code || ""}`, `Total: $${(Number(selectedHistoryQuote.quote_total_cents || 0) / 100).toFixed(2)}`, `Service: ${selectedHistoryQuote.service_name || ""}`, selectedHistoryQuote.shipping_details ? `Shipping Details: ${selectedHistoryQuote.shipping_details}` : null, `ETA: ${selectedHistoryQuote.eta || ""}`, `Summary: ${selectedHistoryQuote.summary || ""}`, `Notes: ${selectedHistoryQuote.description || ""}`, "", linesText].filter(Boolean).join("\n");
  }, [selectedHistoryQuote]);
  function updateLine(index, patch) {
    setLines((prev) => prev.map((line, i) => i === index ? {
      ...line,
      ...patch
    } : line));
  }
  function addLine() {
    setLines((prev) => [...prev, {
      sku: "",
      quantity: "",
      search: "",
      customTitle: "",
      customPrice: ""
    }]);
  }
  function removeLine(index) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }
  function filteredProducts(index) {
    var _a3;
    const search = (((_a3 = deferredLines[index]) == null ? void 0 : _a3.search) || "").toLowerCase().trim();
    if (!search) return [];
    return productSearchIndex.filter((entry2) => entry2.haystack.includes(search)).map((entry2) => entry2.product).slice(0, 12);
  }
  async function copyQuote() {
    if (!quoteText) return;
    await navigator.clipboard.writeText(quoteText);
    alert("Quote copied");
  }
  async function copyHistoryQuote() {
    if (!historyQuoteText) return;
    await navigator.clipboard.writeText(historyQuoteText);
    alert("Saved quote copied");
  }
  if (!allowed) {
    return /* @__PURE__ */ jsx("div", {
      style: styles$2.page,
      children: /* @__PURE__ */ jsx("div", {
        style: {
          ...styles$2.shell,
          maxWidth: "520px"
        },
        children: /* @__PURE__ */ jsxs("div", {
          style: styles$2.card,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$2.title,
            children: "Custom Quote Portal"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$2.subtitle,
            children: "Enter the admin password to access the quote tool."
          }), /* @__PURE__ */ jsxs(Form, {
            method: "post",
            autoComplete: "off",
            style: {
              marginTop: "22px"
            },
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "login"
            }), /* @__PURE__ */ jsx("label", {
              style: styles$2.label,
              children: "Admin Password"
            }), /* @__PURE__ */ jsx("input", {
              type: "password",
              name: "password",
              autoComplete: "current-password",
              style: styles$2.input
            }), (actionData == null ? void 0 : actionData.loginError) ? /* @__PURE__ */ jsx("div", {
              style: styles$2.statusErr,
              children: actionData.loginError
            }) : null, /* @__PURE__ */ jsx("button", {
              type: "submit",
              style: {
                ...styles$2.buttonPrimary,
                marginTop: "18px",
                width: "100%"
              },
              children: "Unlock Quote Tool"
            })]
          })]
        })
      })
    });
  }
  return /* @__PURE__ */ jsxs("div", {
    style: {
      ...styles$2.page,
      padding: isMobile ? "20px 14px 120px" : styles$2.page.padding,
      overflowX: "clip"
    },
    children: [/* @__PURE__ */ jsxs("div", {
      style: styles$2.shell,
      children: [isMobile ? /* @__PURE__ */ jsxs("div", {
        style: {
          marginBottom: 18
        },
        children: [/* @__PURE__ */ jsx("h1", {
          style: {
            ...styles$2.title,
            fontSize: "28px"
          },
          children: "Custom Quote Tool"
        }), /* @__PURE__ */ jsx("div", {
          style: styles$2.subtitle,
          children: "Full quote builder with products, delivery, tax, images, and saved history."
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            marginTop: 8,
            color: "#64748b",
            fontSize: 13
          },
          children: ["Loaded products: ", products.length, " · Google Places: ", googleStatus]
        })]
      }) : /* @__PURE__ */ jsxs("div", {
        style: styles$2.hero,
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$2.title,
            children: "Custom Quote Tool"
          }), /* @__PURE__ */ jsx("div", {
            style: styles$2.subtitle,
            children: "Full quote builder with products, delivery, tax, images, and saved history."
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              marginTop: 8,
              color: "#64748b",
              fontSize: 13
            },
            children: ["Loaded products: ", products.length, " · Google Places: ", googleStatus]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            display: "flex",
            gap: 12,
            flexWrap: "wrap"
          },
          children: [/* @__PURE__ */ jsx("a", {
            href: mobileDashboardHref,
            style: styles$2.logout,
            children: "Dashboard"
          }), /* @__PURE__ */ jsx("a", {
            href: quoteReviewHref,
            style: styles$2.logout,
            children: "Review Quotes"
          }), /* @__PURE__ */ jsx("a", {
            href: logoutHref,
            style: styles$2.logout,
            children: "Log out"
          })]
        })]
      }), /* @__PURE__ */ jsxs(Form, {
        method: "post",
        style: {
          display: "grid",
          gap: "22px"
        },
        children: [/* @__PURE__ */ jsx("input", {
          type: "hidden",
          name: "quoteAudience",
          value: quoteAudience
        }), /* @__PURE__ */ jsx("input", {
          type: "hidden",
          name: "contractorTier",
          value: contractorTier
        }), /* @__PURE__ */ jsx("input", {
          type: "hidden",
          name: "linesJson",
          value: JSON.stringify(lines)
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            ...styles$2.card,
            padding: isMobile ? "18px" : styles$2.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$2.sectionTitle,
            children: "Quote Type"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$2.sectionSub,
            children: "Switch between standard customer pricing and contractor tier pricing."
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$2.tabRow,
            children: [/* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setQuoteAudience("customer"),
              style: {
                ...styles$2.tabButton,
                minHeight: isMobile ? 46 : void 0,
                flex: isMobile ? "1 1 110px" : void 0,
                textAlign: "center",
                ...quoteAudience === "customer" ? styles$2.tabButtonActive : {}
              },
              children: "Customer"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setQuoteAudience("contractor"),
              style: {
                ...styles$2.tabButton,
                minHeight: isMobile ? 46 : void 0,
                flex: isMobile ? "1 1 110px" : void 0,
                textAlign: "center",
                ...quoteAudience === "contractor" ? styles$2.tabButtonActive : {}
              },
              children: "Contractor"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setQuoteAudience("custom"),
              style: {
                ...styles$2.tabButton,
                minHeight: isMobile ? 46 : void 0,
                flex: isMobile ? "1 1 110px" : void 0,
                textAlign: "center",
                ...quoteAudience === "custom" ? styles$2.tabButtonActive : {}
              },
              children: "Custom"
            })]
          }), quoteAudience === "contractor" ? /* @__PURE__ */ jsxs("div", {
            style: {
              maxWidth: 280
            },
            children: [/* @__PURE__ */ jsx("label", {
              style: styles$2.label,
              children: "Contractor Tier"
            }), /* @__PURE__ */ jsxs("select", {
              name: "contractorTierUi",
              value: contractorTier,
              onChange: (e) => setContractorTier(normalizeContractorTier(e.target.value)),
              style: styles$2.input,
              children: [/* @__PURE__ */ jsx("option", {
                value: "tier1",
                children: "Tier 1"
              }), /* @__PURE__ */ jsx("option", {
                value: "tier2",
                children: "Tier 2"
              })]
            })]
          }) : quoteAudience === "custom" ? /* @__PURE__ */ jsx("div", {
            style: {
              color: "#93c5fd",
              fontSize: 14
            },
            children: "Custom mode keeps the same quote flow but lets you override line titles, unit prices, delivery, shipping math, tax, and notes."
          }) : null]
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            ...styles$2.card,
            padding: isMobile ? "18px" : styles$2.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$2.sectionTitle,
            children: "Customer & Delivery Address"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$2.sectionSub,
            children: "Start typing the street address and choose a suggestion."
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              display: "grid",
              gap: "14px"
            },
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$2.label,
                children: "Customer Name"
              }), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "customerName",
                autoComplete: "name",
                defaultValue: (actionData == null ? void 0 : actionData.customerName) || "",
                style: styles$2.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$2.label,
                children: "Email Address"
              }), /* @__PURE__ */ jsx("input", {
                type: "email",
                name: "customerEmail",
                autoComplete: "email",
                defaultValue: (actionData == null ? void 0 : actionData.customerEmail) || "",
                style: styles$2.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$2.label,
                children: "Phone Number"
              }), /* @__PURE__ */ jsx("input", {
                type: "tel",
                name: "customerPhone",
                autoComplete: "tel",
                defaultValue: (actionData == null ? void 0 : actionData.customerPhone) || "",
                style: styles$2.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$2.label,
                children: "Address 1"
              }), /* @__PURE__ */ jsx("input", {
                id: "quote-address1",
                type: "text",
                name: "address1",
                autoComplete: "street-address",
                defaultValue: ((_a2 = actionData == null ? void 0 : actionData.address) == null ? void 0 : _a2.address1) || "",
                style: styles$2.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$2.label,
                children: "Address 2"
              }), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "address2",
                autoComplete: "address-line2",
                defaultValue: ((_b = actionData == null ? void 0 : actionData.address) == null ? void 0 : _b.address2) || "",
                style: styles$2.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "1.3fr 0.8fr 0.8fr 0.8fr",
                gap: "14px"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "City"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-city",
                  type: "text",
                  name: "city",
                  autoComplete: "address-level2",
                  defaultValue: ((_c = actionData == null ? void 0 : actionData.address) == null ? void 0 : _c.city) || "",
                  style: styles$2.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "State"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-province",
                  type: "text",
                  name: "province",
                  autoComplete: "address-level1",
                  defaultValue: ((_d = actionData == null ? void 0 : actionData.address) == null ? void 0 : _d.province) || "WI",
                  style: styles$2.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "ZIP"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-postalCode",
                  type: "text",
                  name: "postalCode",
                  autoComplete: "postal-code",
                  defaultValue: ((_e = actionData == null ? void 0 : actionData.address) == null ? void 0 : _e.postalCode) || "",
                  style: styles$2.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "Country"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-country",
                  type: "text",
                  name: "country",
                  autoComplete: "country-name",
                  defaultValue: ((_f = actionData == null ? void 0 : actionData.address) == null ? void 0 : _f.country) || "US",
                  style: styles$2.input
                })]
              })]
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            ...styles$2.card,
            padding: isMobile ? "18px" : styles$2.card.padding
          },
          children: [/* @__PURE__ */ jsxs("div", {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: isMobile ? "flex-start" : "center",
              gap: "16px",
              marginBottom: "14px",
              flexWrap: "wrap"
            },
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("h2", {
                style: styles$2.sectionTitle,
                children: "Quote Lines"
              }), /* @__PURE__ */ jsx("p", {
                style: styles$2.sectionSub,
                children: "Search by product, SKU, or vendor. Click a result to select it."
              })]
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: addLine,
              style: styles$2.buttonGhost,
              children: "Add Line"
            })]
          }), /* @__PURE__ */ jsx("div", {
            style: {
              display: "grid",
              gap: "16px"
            },
            children: lines.map((line, index) => {
              const selectedProduct = products.find((p) => p.sku === line.sku);
              const matches = filteredProducts(index);
              return /* @__PURE__ */ jsxs("div", {
                style: {
                  border: "1px solid #1f2937",
                  background: "rgba(2, 6, 23, 0.72)",
                  borderRadius: "16px",
                  padding: isMobile ? "14px" : "16px",
                  display: "grid",
                  gap: "12px",
                  overflowX: "clip"
                },
                children: [/* @__PURE__ */ jsxs("div", {
                  style: {
                    display: "grid",
                    gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(360px, 1fr) 160px 120px",
                    gap: "12px",
                    alignItems: "end"
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$2.label,
                      children: "Search Product"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "text",
                      value: line.search,
                      onChange: (e) => updateLine(index, {
                        search: e.target.value,
                        sku: ""
                      }),
                      placeholder: "Type product name, SKU, or vendor",
                      style: styles$2.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$2.label,
                      children: "Quantity"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "number",
                      min: "0",
                      step: "1",
                      value: line.quantity,
                      onChange: (e) => updateLine(index, {
                        quantity: e.target.value
                      }),
                      style: styles$2.input
                    })]
                  }), /* @__PURE__ */ jsx("button", {
                    type: "button",
                    onClick: () => removeLine(index),
                    disabled: lines.length === 1,
                    style: {
                      ...styles$2.buttonGhost,
                      minHeight: isMobile ? 46 : void 0,
                      width: isMobile ? "100%" : void 0
                    },
                    children: "Remove"
                  })]
                }), selectedProduct ? /* @__PURE__ */ jsxs("div", {
                  style: {
                    display: "flex",
                    alignItems: isMobile ? "flex-start" : "center",
                    flexWrap: isMobile ? "wrap" : "nowrap",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: "12px",
                    background: "rgba(37, 99, 235, 0.12)",
                    border: "1px solid rgba(96, 165, 250, 0.35)",
                    color: "#dbeafe"
                  },
                  children: [selectedProduct.imageUrl ? /* @__PURE__ */ jsx("img", {
                    src: selectedProduct.imageUrl,
                    alt: selectedProduct.title,
                    loading: "lazy",
                    decoding: "async",
                    style: {
                      width: 52,
                      height: 52,
                      objectFit: "cover",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.08)",
                      flexShrink: 0
                    }
                  }) : /* @__PURE__ */ jsx("div", {
                    style: {
                      width: 52,
                      height: 52,
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid #334155",
                      flexShrink: 0
                    }
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: {
                        fontWeight: 700
                      },
                      children: quoteAudience === "custom" && line.customTitle ? line.customTitle : selectedProduct.title
                    }), /* @__PURE__ */ jsxs("div", {
                      style: {
                        fontSize: 13,
                        color: "#bfdbfe"
                      },
                      children: [selectedProduct.sku, " — ", selectedProduct.vendor]
                    }), /* @__PURE__ */ jsxs("div", {
                      style: {
                        fontSize: 13,
                        color: "#bfdbfe"
                      },
                      children: ["Unit Price: $", (() => {
                        const customPriceValue = Number(line.customPrice || "");
                        const displayPrice = quoteAudience === "custom" && String(line.customPrice || "").trim() !== "" && Number.isFinite(customPriceValue) ? customPriceValue : getUnitPriceForProduct(selectedProduct, quoteAudience, contractorTier);
                        return Number(displayPrice).toFixed(2);
                      })()]
                    })]
                  })]
                }) : null, selectedProduct && quoteAudience === "custom" ? /* @__PURE__ */ jsxs("div", {
                  style: {
                    display: "grid",
                    gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(260px, 1fr) 180px",
                    gap: "12px"
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$2.label,
                      children: "Custom Line Title"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "text",
                      value: line.customTitle || "",
                      onChange: (e) => updateLine(index, {
                        customTitle: e.target.value
                      }),
                      placeholder: selectedProduct.title,
                      style: styles$2.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$2.label,
                      children: "Custom Unit Price"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      value: line.customPrice || "",
                      onChange: (e) => updateLine(index, {
                        customPrice: e.target.value
                      }),
                      placeholder: String(getUnitPriceForProduct(selectedProduct, quoteAudience, contractorTier)),
                      style: styles$2.input
                    })]
                  })]
                }) : null, !selectedProduct && line.search.trim() ? /* @__PURE__ */ jsx("div", {
                  style: {
                    border: "1px solid #334155",
                    borderRadius: "14px",
                    maxHeight: "280px",
                    overflowY: "auto",
                    background: "#020617"
                  },
                  children: matches.length === 0 ? /* @__PURE__ */ jsx("div", {
                    style: {
                      padding: "14px",
                      color: "#94a3b8"
                    },
                    children: "No matching products"
                  }) : matches.map((product) => /* @__PURE__ */ jsxs("button", {
                    type: "button",
                    onClick: () => updateLine(index, {
                      sku: product.sku,
                      search: `${product.title} (${product.sku}) — ${product.vendor}`
                    }),
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      textAlign: "left",
                      padding: "14px",
                      border: "none",
                      borderBottom: "1px solid #111827",
                      background: "transparent",
                      color: "#f8fafc",
                      cursor: "pointer"
                    },
                    children: [product.imageUrl ? /* @__PURE__ */ jsx("img", {
                      src: product.imageUrl,
                      alt: product.title,
                      loading: "lazy",
                      decoding: "async",
                      style: {
                        width: 44,
                        height: 44,
                        objectFit: "cover",
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.08)",
                        flexShrink: 0
                      }
                    }) : /* @__PURE__ */ jsx("div", {
                      style: {
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: "#1e293b",
                        border: "1px solid #334155",
                        flexShrink: 0
                      }
                    }), /* @__PURE__ */ jsxs("div", {
                      children: [/* @__PURE__ */ jsx("div", {
                        style: {
                          fontWeight: 700
                        },
                        children: product.title
                      }), /* @__PURE__ */ jsxs("div", {
                        style: {
                          fontSize: "13px",
                          color: "#94a3b8",
                          marginTop: "4px"
                        },
                        children: [product.sku, " — ", product.vendor]
                      }), /* @__PURE__ */ jsxs("div", {
                        style: {
                          fontSize: "13px",
                          color: "#94a3b8",
                          marginTop: "4px"
                        },
                        children: ["$", Number(getUnitPriceForProduct(product, quoteAudience, contractorTier)).toFixed(2)]
                      })]
                    })]
                  }, product.sku))
                }) : null]
              }, index);
            })
          })]
        }), quoteAudience === "custom" ? /* @__PURE__ */ jsxs("div", {
          style: {
            ...styles$2.card,
            padding: isMobile ? "18px" : styles$2.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$2.sectionTitle,
            children: "Custom Adjustments"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$2.sectionSub,
            children: "Override delivery, tax, and the customer-facing quote details before calculating or saving."
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              display: "grid",
              gap: "14px"
            },
            children: [/* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "180px 180px",
                gap: "14px"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "Delivery Amount"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customDeliveryAmount",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customDeliveryAmount) || "",
                  placeholder: "Use calculated delivery",
                  style: styles$2.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "Tax Rate"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customTaxRate",
                  min: "0",
                  step: "0.0001",
                  defaultValue: (actionData == null ? void 0 : actionData.customTaxRate) || "",
                  placeholder: "Example: 0.055",
                  style: styles$2.input
                })]
              })]
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "160px 160px 180px",
                gap: "14px"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "Shipping Qty"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customShippingQuantity",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customShippingQuantity) || "",
                  placeholder: "Miles or hours",
                  style: styles$2.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "Shipping Unit"
                }), /* @__PURE__ */ jsxs("select", {
                  name: "customShippingUnit",
                  defaultValue: (actionData == null ? void 0 : actionData.customShippingUnit) || "miles",
                  style: styles$2.input,
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "miles",
                    children: "Miles"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "hours",
                    children: "Hours"
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "Price Per Unit"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customShippingRate",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customShippingRate) || "",
                  placeholder: "Rate per mile/hour",
                  style: styles$2.input
                })]
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: {
                color: "#93c5fd",
                fontSize: 13
              },
              children: "If shipping quantity and price per unit are both filled in, the delivery amount will use `quantity x rate` and override the manual delivery amount above."
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$2.label,
                children: "Notes"
              }), /* @__PURE__ */ jsx("textarea", {
                name: "customNotes",
                defaultValue: (actionData == null ? void 0 : actionData.customNotes) || "",
                placeholder: "Use calculated notes",
                style: {
                  ...styles$2.input,
                  minHeight: 110,
                  resize: "vertical"
                }
              })]
            })]
          })]
        }) : null, /* @__PURE__ */ jsxs("div", {
          style: {
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            flexDirection: isMobile ? "column" : "row",
            position: isMobile ? "sticky" : "static",
            bottom: isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 76px)" : void 0,
            zIndex: isMobile ? 20 : void 0,
            padding: isMobile ? "12px" : 0,
            borderRadius: isMobile ? 16 : void 0,
            background: isMobile ? "rgba(2, 6, 23, 0.92)" : "transparent",
            border: isMobile ? "1px solid rgba(51, 65, 85, 0.9)" : "none",
            boxShadow: isMobile ? "0 18px 32px rgba(2, 6, 23, 0.4)" : "none",
            backdropFilter: isMobile ? "blur(12px)" : "none"
          },
          children: [/* @__PURE__ */ jsx("button", {
            type: "submit",
            name: "intent",
            value: "quote",
            style: {
              ...styles$2.buttonPrimary,
              width: isMobile ? "100%" : void 0,
              minHeight: isMobile ? 50 : void 0
            },
            children: isSubmitting ? "Calculating..." : "Get Full Quote"
          }), /* @__PURE__ */ jsx("button", {
            type: "submit",
            name: "intent",
            value: "save",
            style: {
              ...styles$2.buttonSecondary,
              width: isMobile ? "100%" : void 0,
              minHeight: isMobile ? 50 : void 0
            },
            children: isSubmitting ? "Saving..." : "Save Quote"
          })]
        })]
      }), (actionData == null ? void 0 : actionData.message) ? /* @__PURE__ */ jsx("div", {
        style: {
          ...actionData.ok ? styles$2.statusOk : styles$2.statusErr,
          fontSize: isMobile ? 16 : void 0,
          fontWeight: isMobile ? 700 : void 0
        },
        children: actionData.message
      }) : null, (actionData == null ? void 0 : actionData.savedQuoteId) ? /* @__PURE__ */ jsxs("div", {
        style: {
          ...styles$2.statusOk,
          fontSize: isMobile ? 16 : void 0,
          fontWeight: isMobile ? 700 : void 0
        },
        children: ["Quote saved successfully. ID: ", actionData.savedQuoteId]
      }) : null, (actionData == null ? void 0 : actionData.pricing) && (actionData == null ? void 0 : actionData.deliveryQuote) ? /* @__PURE__ */ jsxs("div", {
        style: {
          marginTop: "24px",
          display: "grid",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1.2fr 1fr",
          gap: "20px"
        },
        children: [/* @__PURE__ */ jsxs("div", {
          style: {
            ...styles$2.card,
            padding: isMobile ? "18px" : styles$2.card.padding
          },
          children: [/* @__PURE__ */ jsxs("div", {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: isMobile ? "flex-start" : "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "16px"
            },
            children: [/* @__PURE__ */ jsx("h2", {
              style: {
                ...styles$2.sectionTitle,
                margin: 0
              },
              children: "Full Quote Result"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: copyQuote,
              style: styles$2.buttonGhost,
              children: "Copy Quote"
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              display: "grid",
              gap: "10px",
              color: "#e5e7eb"
            },
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("strong", {
                style: {
                  color: "#93c5fd"
                },
                children: "Pricing:"
              }), " ", actionData.pricing.pricingLabel]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("strong", {
                style: {
                  color: "#93c5fd"
                },
                children: "Products:"
              }), " $", Number(actionData.pricing.productsSubtotal).toFixed(2)]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("strong", {
                style: {
                  color: "#93c5fd"
                },
                children: actionData.shippingCalculationText ? "Shipping:" : "Delivery:"
              }), " ", "$", Number(actionData.pricing.deliveryAmount).toFixed(2)]
            }), actionData.shippingCalculationText ? /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("strong", {
                style: {
                  color: "#93c5fd"
                },
                children: "Shipping Calc:"
              }), " ", actionData.shippingCalculationText]
            }) : null, /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("strong", {
                style: {
                  color: "#93c5fd"
                },
                children: "Tax:"
              }), " $", Number(actionData.pricing.taxAmount).toFixed(2)]
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                marginTop: 8,
                paddingTop: 10,
                borderTop: "1px solid #334155",
                fontSize: isMobile ? 22 : 18,
                fontWeight: 800
              },
              children: ["TOTAL: $", Number(actionData.pricing.totalAmount).toFixed(2)]
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                marginTop: 14
              },
              children: [/* @__PURE__ */ jsx("strong", {
                style: {
                  color: "#93c5fd"
                },
                children: "Delivery Service:"
              }), " ", actionData.deliveryQuote.serviceName]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("strong", {
                style: {
                  color: "#93c5fd"
                },
                children: "ETA:"
              }), " ", actionData.deliveryQuote.eta]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("strong", {
                style: {
                  color: "#93c5fd"
                },
                children: actionData.shippingCalculationText ? "Custom Shipping:" : "Notes:"
              }), " ", actionData.deliveryQuote.description]
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            ...styles$2.card,
            padding: isMobile ? "18px" : styles$2.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$2.sectionTitle,
            children: "Source Breakdown"
          }), /* @__PURE__ */ jsx("div", {
            style: {
              display: "grid",
              gap: "12px"
            },
            children: (_g = actionData.sourceBreakdown) == null ? void 0 : _g.map((source, index) => /* @__PURE__ */ jsxs("div", {
              style: {
                border: "1px solid #1f2937",
                borderRadius: "12px",
                padding: "14px",
                background: "rgba(2, 6, 23, 0.72)"
              },
              children: [/* @__PURE__ */ jsx("div", {
                style: {
                  fontWeight: 700,
                  color: "#f8fafc"
                },
                children: source.vendor
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  color: "#93c5fd",
                  marginTop: "4px"
                },
                children: ["Total Qty: ", source.quantity]
              }), /* @__PURE__ */ jsx("div", {
                style: {
                  color: "#9ca3af",
                  marginTop: "8px",
                  fontSize: "14px"
                },
                children: source.items.join(", ")
              })]
            }, `${source.vendor}-${index}`))
          })]
        })]
      }) : null, recentQuotes.length ? /* @__PURE__ */ jsxs("div", {
        style: {
          ...styles$2.card,
          marginTop: 24,
          padding: isMobile ? "18px" : styles$2.card.padding
        },
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles$2.sectionTitle,
          children: "Recent Quotes"
        }), /* @__PURE__ */ jsx("div", {
          style: {
            display: "grid",
            gap: 12
          },
          children: recentQuotes.map((quote) => /* @__PURE__ */ jsxs("button", {
            type: "button",
            onClick: () => setSelectedHistoryQuoteId(quote.id),
            style: {
              textAlign: "left",
              width: "100%",
              border: "1px solid #1f2937",
              borderRadius: 12,
              padding: isMobile ? 16 : 14,
              background: "rgba(2, 6, 23, 0.72)",
              color: "#f8fafc",
              cursor: "pointer",
              overflowWrap: "anywhere",
              minHeight: isMobile ? 88 : void 0
            },
            children: [/* @__PURE__ */ jsx("div", {
              style: {
                fontWeight: 700
              },
              children: quote.customer_name || "Unnamed customer"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                color: "#93c5fd",
                marginTop: 4
              },
              children: ["$", (quote.quote_total_cents / 100).toFixed(2), " —", " ", quote.service_name || "Quote"]
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                color: "#9ca3af",
                marginTop: 6,
                fontSize: 14
              },
              children: [quote.address1, ", ", quote.city, ", ", quote.province, " ", quote.postal_code]
            }), /* @__PURE__ */ jsx("div", {
              style: {
                color: "#64748b",
                marginTop: 6,
                fontSize: 12
              },
              children: new Date(quote.created_at).toLocaleString()
            })]
          }, quote.id))
        })]
      }) : null, selectedHistoryQuote ? /* @__PURE__ */ jsxs("div", {
        style: {
          ...styles$2.card,
          marginTop: 24,
          padding: isMobile ? "18px" : styles$2.card.padding
        },
        children: [/* @__PURE__ */ jsxs("div", {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px"
          },
          children: [/* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("h2", {
              style: {
                ...styles$2.sectionTitle,
                margin: 0
              },
              children: "Saved Quote Detail"
            }), /* @__PURE__ */ jsx("div", {
              style: {
                color: "#64748b",
                fontSize: 13,
                marginTop: 6
              },
              children: new Date(selectedHistoryQuote.created_at).toLocaleString()
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              display: "flex",
              gap: 12,
              flexWrap: "wrap"
            },
            children: [/* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: copyHistoryQuote,
              style: mobileActionButtonStyle,
              children: "Copy Saved Quote"
            }), /* @__PURE__ */ jsxs(deleteQuoteFetcher.Form, {
              method: "post",
              action: deleteQuoteAction,
              onSubmit: (event) => {
                if (!window.confirm("Delete this quote? This can't be undone.")) {
                  event.preventDefault();
                }
              },
              children: [/* @__PURE__ */ jsx("input", {
                type: "hidden",
                name: "quoteId",
                value: selectedHistoryQuote.id
              }), /* @__PURE__ */ jsx("button", {
                type: "submit",
                style: mobileActionButtonStyle,
                children: deleteQuoteFetcher.state === "submitting" ? "Deleting..." : "Delete Quote"
              })]
            })]
          })]
        }), /* @__PURE__ */ jsxs(draftOrderFetcher.Form, {
          method: "post",
          action: createDraftOrderAction,
          style: {
            marginBottom: 16,
            display: "flex",
            gap: 12,
            flexWrap: "wrap"
          },
          children: [/* @__PURE__ */ jsx("input", {
            type: "hidden",
            name: "quoteId",
            value: selectedHistoryQuote.id
          }), /* @__PURE__ */ jsx("button", {
            type: "submit",
            style: styles$2.buttonPrimary,
            children: draftOrderFetcher.state === "submitting" ? "Creating Draft Order..." : "Send To Shopify"
          }), ((_h = draftOrderFetcher.data) == null ? void 0 : _h.draftOrderAdminUrl) ? /* @__PURE__ */ jsx("a", {
            href: draftOrderFetcher.data.draftOrderAdminUrl,
            target: "_blank",
            rel: "noreferrer",
            style: mobileActionButtonStyle,
            children: "Open Draft Order"
          }) : null, ((_i = draftOrderFetcher.data) == null ? void 0 : _i.draftOrderInvoiceUrl) ? /* @__PURE__ */ jsx("a", {
            href: draftOrderFetcher.data.draftOrderInvoiceUrl,
            target: "_blank",
            rel: "noreferrer",
            style: mobileActionButtonStyle,
            children: "Open Invoice"
          }) : null]
        }), ((_j = draftOrderFetcher.data) == null ? void 0 : _j.message) ? /* @__PURE__ */ jsx("div", {
          style: {
            ...draftOrderFetcher.data.ok ? styles$2.statusOk : styles$2.statusErr,
            fontSize: isMobile ? 16 : void 0,
            fontWeight: isMobile ? 700 : void 0
          },
          children: draftOrderFetcher.data.message
        }) : null, ((_k = deleteQuoteFetcher.data) == null ? void 0 : _k.message) ? /* @__PURE__ */ jsx("div", {
          style: {
            ...deleteQuoteFetcher.data.ok ? styles$2.statusOk : styles$2.statusErr,
            fontSize: isMobile ? 16 : void 0,
            fontWeight: isMobile ? 700 : void 0
          },
          children: deleteQuoteFetcher.data.message
        }) : null, /* @__PURE__ */ jsxs("div", {
          style: {
            display: "grid",
            gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1.2fr 1fr",
            gap: "20px"
          },
          children: [/* @__PURE__ */ jsxs("div", {
            style: {
              display: "grid",
              gap: "10px",
              color: "#e5e7eb"
            },
            children: [/* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => toggleHistorySection("customer"),
              style: mobileActionButtonStyle,
              children: historyDetailsOpen.customer ? "Hide Quote Info" : "Show Quote Info"
            }), historyDetailsOpen.customer ? /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gap: "10px"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "Customer:"
                }), " ", selectedHistoryQuote.customer_name || "Unnamed customer"]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "Email:"
                }), " ", selectedHistoryQuote.customer_email || "N/A"]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "Phone:"
                }), " ", selectedHistoryQuote.customer_phone || "N/A"]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "Address:"
                }), " ", selectedHistoryQuote.address1, ", ", selectedHistoryQuote.city, ",", " ", selectedHistoryQuote.province, " ", selectedHistoryQuote.postal_code]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  fontSize: isMobile ? 22 : void 0,
                  fontWeight: isMobile ? 800 : void 0
                },
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "Total:"
                }), " $", (Number(selectedHistoryQuote.quote_total_cents || 0) / 100).toFixed(2)]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "Service:"
                }), " ", selectedHistoryQuote.service_name || "Quote"]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "ETA:"
                }), " ", selectedHistoryQuote.eta || "N/A"]
              }), selectedHistoryQuote.shipping_details ? /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "Shipping Details:"
                }), " ", selectedHistoryQuote.shipping_details]
              }) : null, /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "Summary:"
                }), " ", selectedHistoryQuote.summary || "N/A"]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: {
                    color: "#93c5fd"
                  },
                  children: "Notes:"
                }), " ", selectedHistoryQuote.description || "N/A"]
              })]
            }) : null, /* @__PURE__ */ jsxs("div", {
              style: {
                marginTop: 10
              },
              children: [/* @__PURE__ */ jsx("button", {
                type: "button",
                onClick: () => toggleHistorySection("lineItems"),
                style: mobileActionButtonStyle,
                children: historyDetailsOpen.lineItems ? "Hide Line Items" : "Show Line Items"
              }), historyDetailsOpen.lineItems ? /* @__PURE__ */ jsx("div", {
                style: {
                  display: "grid",
                  gap: 10,
                  marginTop: 10
                },
                children: (selectedHistoryQuote.line_items || []).map((line, index) => /* @__PURE__ */ jsxs("div", {
                  style: {
                    border: "1px solid #1f2937",
                    borderRadius: 12,
                    padding: 12,
                    background: "rgba(2, 6, 23, 0.72)",
                    overflowWrap: "anywhere"
                  },
                  children: [/* @__PURE__ */ jsx("div", {
                    style: {
                      fontWeight: 700
                    },
                    children: line.title
                  }), /* @__PURE__ */ jsxs("div", {
                    style: {
                      color: "#93c5fd",
                      marginTop: 4
                    },
                    children: [line.sku, " · Qty ", line.quantity]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: {
                      color: "#9ca3af",
                      marginTop: 4,
                      fontSize: 14
                    },
                    children: ["Unit $", Number(line.price || 0).toFixed(2), " · Total $", (Number(line.price || 0) * Number(line.quantity || 0)).toFixed(2)]
                  })]
                }, `${line.sku}-${index}`))
              }) : null]
            })]
          }), /* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => toggleHistorySection("sourceBreakdown"),
              style: mobileActionButtonStyle,
              children: historyDetailsOpen.sourceBreakdown ? "Hide Source Breakdown" : "Show Source Breakdown"
            }), historyDetailsOpen.sourceBreakdown ? /* @__PURE__ */ jsx("div", {
              style: {
                display: "grid",
                gap: 12,
                marginTop: 10
              },
              children: (selectedHistoryQuote.source_breakdown || []).map((source, index) => /* @__PURE__ */ jsxs("div", {
                style: {
                  border: "1px solid #1f2937",
                  borderRadius: "12px",
                  padding: "14px",
                  background: "rgba(2, 6, 23, 0.72)",
                  overflowWrap: "anywhere"
                },
                children: [/* @__PURE__ */ jsx("div", {
                  style: {
                    fontWeight: 700,
                    color: "#f8fafc"
                  },
                  children: source.vendor
                }), /* @__PURE__ */ jsxs("div", {
                  style: {
                    color: "#93c5fd",
                    marginTop: "4px"
                  },
                  children: ["Total Qty: ", source.quantity]
                }), /* @__PURE__ */ jsx("div", {
                  style: {
                    color: "#9ca3af",
                    marginTop: "8px",
                    fontSize: "14px"
                  },
                  children: source.items.join(", ")
                })]
              }, `${source.vendor}-${index}`))
            }) : null]
          })]
        })]
      }) : null]
    }), isMobile ? /* @__PURE__ */ jsxs("div", {
      style: mobileBottomNavStyle,
      children: [/* @__PURE__ */ jsxs("a", {
        href: mobileDashboardHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "D"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dashboard"
        })]
      }), /* @__PURE__ */ jsxs("a", {
        href: isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote",
        style: mobileTabLinkStyle(true),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(true),
          children: "Q"
        }), /* @__PURE__ */ jsx("span", {
          children: "Quote Tool"
        })]
      }), /* @__PURE__ */ jsxs("a", {
        href: quoteReviewHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "R"
        }), /* @__PURE__ */ jsx("span", {
          children: "Review"
        })]
      })]
    }) : null]
  });
});
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$d,
  default: customQuote,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
function formatMoney$1(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}
function buildQuoteSearchText(quote) {
  const lineText = (quote.line_items || []).map((line) => [line.title, line.sku, line.vendor, line.pricingLabel, line.audience, line.contractorTier].filter(Boolean).join(" ")).join(" ");
  const sourceText = Array.isArray(quote.source_breakdown) ? quote.source_breakdown.map((entry2) => [entry2 == null ? void 0 : entry2.vendor, ...Array.isArray(entry2 == null ? void 0 : entry2.items) ? entry2.items : []].filter(Boolean).join(" ")).join(" ") : "";
  return [quote.id, quote.customer_name, quote.customer_email, quote.customer_phone, quote.address1, quote.address2, quote.city, quote.province, quote.postal_code, quote.country, quote.service_name, quote.shipping_details, quote.description, quote.summary, quote.eta, lineText, sourceText].filter(Boolean).join(" ").toLowerCase();
}
const styles$1 = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top left, rgba(30, 64, 175, 0.24), transparent 35%), linear-gradient(180deg, #020617 0%, #0f172a 55%, #111827 100%)",
    color: "#f8fafc",
    padding: "32px 20px 56px",
    fontFamily: '"Avenir Next", "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif'
  },
  shell: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "grid",
    gap: "20px"
  },
  card: {
    background: "rgba(15, 23, 42, 0.88)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 22px 48px rgba(2, 6, 23, 0.34)",
    backdropFilter: "blur(10px)"
  },
  title: {
    margin: 0,
    fontSize: "clamp(2rem, 4vw, 3rem)",
    fontWeight: 800,
    letterSpacing: "-0.04em"
  },
  subtitle: {
    margin: "10px 0 0",
    color: "#94a3b8",
    lineHeight: 1.6
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: "#cbd5e1"
  },
  input: {
    width: "100%",
    borderRadius: "14px",
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.92)",
    color: "#f8fafc",
    padding: "14px 16px",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box"
  },
  buttonPrimary: {
    border: "none",
    borderRadius: "14px",
    padding: "12px 18px",
    background: "linear-gradient(135deg, #2563eb, #14b8a6)",
    color: "#eff6ff",
    fontWeight: 800,
    cursor: "pointer"
  },
  buttonGhost: {
    border: "1px solid rgba(148, 163, 184, 0.28)",
    borderRadius: "14px",
    padding: "12px 18px",
    background: "rgba(15, 23, 42, 0.62)",
    color: "#e2e8f0",
    fontWeight: 700,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  },
  statusOk: {
    marginTop: "16px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "rgba(22, 163, 74, 0.15)",
    border: "1px solid rgba(34, 197, 94, 0.5)",
    color: "#dcfce7"
  },
  statusErr: {
    marginTop: "16px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "rgba(220, 38, 38, 0.15)",
    border: "1px solid rgba(248, 113, 113, 0.5)",
    color: "#fee2e2"
  }
};
async function loader$6({
  request
}) {
  const url = new URL(request.url);
  const isEmbeddedRoute = url.pathname.startsWith("/app/");
  const reviewPath = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  if (url.searchParams.get("logout") === "1") {
    return redirect(reviewPath, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("", {
          maxAge: 0
        })
      }
    });
  }
  const allowed = await hasAdminQuoteAccess(request);
  const quotes = allowed ? await getRecentCustomQuotes(250) : [];
  return data({
    allowed,
    quotes
  });
}
async function action$c({
  request
}) {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  if (intent !== "login") {
    return data({
      allowed: false,
      loginError: "Invalid request",
      quotes: []
    }, {
      status: 400
    });
  }
  const password = String(form.get("password") || "");
  const expected = getAdminQuotePassword();
  if (!expected || password !== expected) {
    return data({
      allowed: false,
      loginError: "Invalid password",
      quotes: []
    }, {
      status: 401
    });
  }
  return data({
    allowed: true,
    loginError: null,
    quotes: await getRecentCustomQuotes(250)
  }, {
    headers: {
      "Set-Cookie": await adminQuoteCookie.serialize("ok")
    }
  });
}
const quoteReview = UNSAFE_withComponentProps(function QuoteReviewPage() {
  var _a2, _b, _c, _d, _e;
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const location = useLocation();
  const draftOrderFetcher = useFetcher();
  const deleteQuoteFetcher = useFetcher();
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const urlParams = new URLSearchParams(location.search);
  const requestedQuoteId = urlParams.get("quote");
  const allowed = (actionData == null ? void 0 : actionData.allowed) ?? loaderData.allowed;
  const quotes = (actionData == null ? void 0 : actionData.quotes) || loaderData.quotes || [];
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedQuoteId, setSelectedQuoteId] = useState(requestedQuoteId || ((_a2 = quotes[0]) == null ? void 0 : _a2.id) || null);
  const [isMobile, setIsMobile] = useState(false);
  const [detailSectionsOpen, setDetailSectionsOpen] = useState({
    customer: true,
    lineItems: false
  });
  const createDraftOrderAction = isEmbeddedRoute ? `/app/api/create-draft-order${location.search || ""}` : `/api/create-draft-order${location.search || ""}`;
  const deleteQuoteAction = isEmbeddedRoute ? `/app/api/delete-quote${location.search || ""}` : `/api/delete-quote${location.search || ""}`;
  const quoteToolHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const mobileDashboardHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const indexedQuotes = useMemo(() => quotes.map((quote) => ({
    quote,
    haystack: buildQuoteSearchText(quote)
  })), [quotes]);
  const filteredQuotes = useMemo(() => {
    const trimmed = deferredQuery.trim().toLowerCase();
    if (!trimmed) return indexedQuotes.map((entry2) => entry2.quote);
    return indexedQuotes.filter((entry2) => entry2.haystack.includes(trimmed)).map((entry2) => entry2.quote);
  }, [deferredQuery, indexedQuotes]);
  const selectedQuote = filteredQuotes.find((quote) => quote.id === selectedQuoteId) || filteredQuotes[0] || null;
  const mobileActionButtonStyle = {
    ...styles$1.buttonGhost,
    minHeight: isMobile ? 48 : void 0,
    width: isMobile ? "100%" : void 0
  };
  const mobileTabLinkStyle = (active) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 56,
    borderRadius: 14,
    textDecoration: "none",
    color: active ? "#38bdf8" : "#94a3b8",
    background: active ? "rgba(14, 165, 233, 0.12)" : "transparent",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.01em"
  });
  const mobileTabIconStyle = (active) => ({
    width: 24,
    height: 24,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: active ? "rgba(14, 165, 233, 0.18)" : "rgba(51, 65, 85, 0.35)",
    color: active ? "#38bdf8" : "#cbd5e1",
    fontSize: 12,
    lineHeight: 1
  });
  const mobileBottomNavStyle = {
    position: "fixed",
    left: 12,
    right: 12,
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
    zIndex: 30,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 20,
    background: "rgba(15, 23, 42, 0.96)",
    border: "1px solid rgba(30, 41, 59, 0.95)",
    boxShadow: "0 18px 38px rgba(2, 6, 23, 0.45)",
    backdropFilter: "blur(14px)"
  };
  function toggleDetailSection(key) {
    setDetailSectionsOpen((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }
  useEffect(() => {
    var _a3, _b2;
    if (((_a3 = deleteQuoteFetcher.data) == null ? void 0 : _a3.ok) && ((_b2 = deleteQuoteFetcher.data) == null ? void 0 : _b2.deletedQuoteId)) {
      setSelectedQuoteId((current) => current === deleteQuoteFetcher.data.deletedQuoteId ? null : current);
    }
  }, [deleteQuoteFetcher.data]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 900px)");
    const updateViewport = () => setIsMobile(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);
  useEffect(() => {
    if (requestedQuoteId) {
      setSelectedQuoteId(requestedQuoteId);
    }
  }, [requestedQuoteId]);
  if (!allowed) {
    return /* @__PURE__ */ jsx("div", {
      style: {
        ...styles$1.page,
        padding: isMobile ? "20px 14px 40px" : styles$1.page.padding
      },
      children: /* @__PURE__ */ jsx("div", {
        style: {
          ...styles$1.shell,
          maxWidth: 520
        },
        children: /* @__PURE__ */ jsxs("div", {
          style: styles$1.card,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$1.title,
            children: "Quote Review"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$1.subtitle,
            children: "Enter the admin password to search saved quotes and send them to Shopify."
          }), /* @__PURE__ */ jsxs(Form, {
            method: "post",
            autoComplete: "off",
            style: {
              marginTop: 22
            },
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "login"
            }), /* @__PURE__ */ jsx("label", {
              style: styles$1.label,
              children: "Admin Password"
            }), /* @__PURE__ */ jsx("input", {
              type: "password",
              name: "password",
              autoComplete: "current-password",
              style: styles$1.input
            }), (actionData == null ? void 0 : actionData.loginError) ? /* @__PURE__ */ jsx("div", {
              style: styles$1.statusErr,
              children: actionData.loginError
            }) : null, /* @__PURE__ */ jsx("button", {
              type: "submit",
              style: {
                ...styles$1.buttonPrimary,
                marginTop: 16
              },
              children: "Open Quote Review"
            })]
          })]
        })
      })
    });
  }
  return /* @__PURE__ */ jsxs("div", {
    style: {
      ...styles$1.page,
      padding: isMobile ? "20px 14px 120px" : styles$1.page.padding,
      overflowX: "clip"
    },
    children: [/* @__PURE__ */ jsxs("div", {
      style: styles$1.shell,
      children: [isMobile ? /* @__PURE__ */ jsxs("div", {
        style: {
          marginBottom: 18
        },
        children: [/* @__PURE__ */ jsx("h1", {
          style: {
            ...styles$1.title,
            fontSize: "2.2rem"
          },
          children: "Quote Review"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$1.subtitle,
          children: "Search across customer info, address, notes, SKU, product titles, vendors, and saved quote details."
        })]
      }) : /* @__PURE__ */ jsx("div", {
        style: styles$1.card,
        children: /* @__PURE__ */ jsxs("div", {
          style: {
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center"
          },
          children: [/* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("h1", {
              style: styles$1.title,
              children: "Quote Review"
            }), /* @__PURE__ */ jsx("p", {
              style: styles$1.subtitle,
              children: "Search across customer info, address, notes, SKU, product titles, vendors, and saved quote details."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              display: "flex",
              gap: 12,
              flexWrap: "wrap"
            },
            children: [/* @__PURE__ */ jsx("a", {
              href: mobileDashboardHref,
              style: styles$1.buttonGhost,
              children: "Dashboard"
            }), /* @__PURE__ */ jsx("a", {
              href: quoteToolHref,
              style: styles$1.buttonGhost,
              children: "Open Quote Tool"
            }), /* @__PURE__ */ jsx("a", {
              href: "?logout=1",
              style: styles$1.buttonGhost,
              children: "Log Out"
            })]
          })]
        })
      }), /* @__PURE__ */ jsxs("div", {
        style: {
          ...styles$1.card,
          display: "grid",
          gap: 14,
          padding: isMobile ? "18px" : styles$1.card.padding
        },
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("label", {
            style: styles$1.label,
            children: "Search Saved Quotes"
          }), /* @__PURE__ */ jsx("input", {
            type: "search",
            value: query,
            onChange: (event) => setQuery(event.target.value),
            placeholder: "Search by customer, email, city, ZIP, summary, SKU, vendor, quote ID...",
            style: styles$1.input
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            color: "#94a3b8",
            fontSize: 14
          },
          children: ["Showing ", filteredQuotes.length, " of ", quotes.length, " saved quotes"]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: {
          display: "grid",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(320px, 420px) minmax(0, 1fr)",
          gap: 20,
          alignItems: "start"
        },
        children: [/* @__PURE__ */ jsx("div", {
          style: {
            ...styles$1.card,
            maxHeight: isMobile ? "none" : "70vh",
            overflowY: isMobile ? "visible" : "auto",
            padding: isMobile ? "18px" : styles$1.card.padding
          },
          children: /* @__PURE__ */ jsx("div", {
            style: {
              display: "grid",
              gap: 12
            },
            children: filteredQuotes.length === 0 ? /* @__PURE__ */ jsx("div", {
              style: {
                color: "#94a3b8"
              },
              children: "No saved quotes matched your search."
            }) : filteredQuotes.map((quote) => /* @__PURE__ */ jsxs("button", {
              type: "button",
              onClick: () => setSelectedQuoteId(quote.id),
              style: {
                textAlign: "left",
                padding: isMobile ? 16 : 14,
                borderRadius: 16,
                border: (selectedQuote == null ? void 0 : selectedQuote.id) === quote.id ? "1px solid rgba(45, 212, 191, 0.6)" : "1px solid rgba(51, 65, 85, 0.9)",
                background: (selectedQuote == null ? void 0 : selectedQuote.id) === quote.id ? "rgba(20, 184, 166, 0.14)" : "rgba(2, 6, 23, 0.7)",
                color: "#f8fafc",
                cursor: "pointer",
                overflowWrap: "anywhere",
                minHeight: isMobile ? 92 : void 0
              },
              children: [/* @__PURE__ */ jsx("div", {
                style: {
                  fontWeight: 800
                },
                children: quote.customer_name || quote.customer_email || "Unnamed quote"
              }), /* @__PURE__ */ jsx("div", {
                style: {
                  marginTop: 6,
                  color: "#bfdbfe",
                  fontSize: 13
                },
                children: quote.customer_email || "No email"
              }), /* @__PURE__ */ jsx("div", {
                style: {
                  marginTop: 4,
                  color: "#cbd5e1",
                  fontSize: 13
                },
                children: quote.customer_phone || "No phone"
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  marginTop: 6,
                  color: "#94a3b8",
                  fontSize: 13
                },
                children: [quote.address1, ", ", quote.city, ", ", quote.province, " ", quote.postal_code]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  marginTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 13,
                  color: "#cbd5e1"
                },
                children: [/* @__PURE__ */ jsx("span", {
                  children: formatMoney$1(quote.quote_total_cents)
                }), /* @__PURE__ */ jsx("span", {
                  children: new Date(quote.created_at).toLocaleString()
                })]
              })]
            }, quote.id))
          })
        }), /* @__PURE__ */ jsx("div", {
          style: {
            ...styles$1.card,
            padding: isMobile ? "18px" : styles$1.card.padding
          },
          children: selectedQuote ? /* @__PURE__ */ jsxs(Fragment, {
            children: [/* @__PURE__ */ jsxs("div", {
              style: {
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                alignItems: isMobile ? "flex-start" : "center"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: {
                    margin: 0,
                    fontSize: 24
                  },
                  children: "Saved Quote Detail"
                }), /* @__PURE__ */ jsxs("div", {
                  style: {
                    color: "#94a3b8",
                    marginTop: 6,
                    fontSize: 14
                  },
                  children: ["Quote ID: ", selectedQuote.id]
                }), /* @__PURE__ */ jsx("div", {
                  style: {
                    color: "#94a3b8",
                    marginTop: 4,
                    fontSize: 14
                  },
                  children: new Date(selectedQuote.created_at).toLocaleString()
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  width: isMobile ? "100%" : void 0
                },
                children: [/* @__PURE__ */ jsxs(draftOrderFetcher.Form, {
                  method: "post",
                  action: createDraftOrderAction,
                  style: {
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    width: isMobile ? "100%" : void 0
                  },
                  children: [/* @__PURE__ */ jsx("input", {
                    type: "hidden",
                    name: "quoteId",
                    value: selectedQuote.id
                  }), /* @__PURE__ */ jsx("button", {
                    type: "submit",
                    style: {
                      ...styles$1.buttonPrimary,
                      width: isMobile ? "100%" : void 0
                    },
                    children: draftOrderFetcher.state === "submitting" ? "Creating Draft Order..." : "Send To Shopify"
                  }), ((_b = draftOrderFetcher.data) == null ? void 0 : _b.draftOrderAdminUrl) ? /* @__PURE__ */ jsx("a", {
                    href: draftOrderFetcher.data.draftOrderAdminUrl,
                    target: "_blank",
                    rel: "noreferrer",
                    style: mobileActionButtonStyle,
                    children: "Open Draft Order"
                  }) : null, ((_c = draftOrderFetcher.data) == null ? void 0 : _c.draftOrderInvoiceUrl) ? /* @__PURE__ */ jsx("a", {
                    href: draftOrderFetcher.data.draftOrderInvoiceUrl,
                    target: "_blank",
                    rel: "noreferrer",
                    style: mobileActionButtonStyle,
                    children: "Open Invoice"
                  }) : null]
                }), /* @__PURE__ */ jsxs(deleteQuoteFetcher.Form, {
                  method: "post",
                  action: deleteQuoteAction,
                  onSubmit: (event) => {
                    if (!window.confirm("Delete this quote? This can't be undone.")) {
                      event.preventDefault();
                    }
                  },
                  children: [/* @__PURE__ */ jsx("input", {
                    type: "hidden",
                    name: "quoteId",
                    value: selectedQuote.id
                  }), /* @__PURE__ */ jsx("button", {
                    type: "submit",
                    style: mobileActionButtonStyle,
                    children: deleteQuoteFetcher.state === "submitting" ? "Deleting..." : "Delete Quote"
                  })]
                })]
              })]
            }), ((_d = draftOrderFetcher.data) == null ? void 0 : _d.message) ? /* @__PURE__ */ jsx("div", {
              style: {
                ...draftOrderFetcher.data.ok ? styles$1.statusOk : styles$1.statusErr,
                fontSize: isMobile ? 16 : void 0,
                fontWeight: isMobile ? 700 : void 0
              },
              children: draftOrderFetcher.data.message
            }) : null, ((_e = deleteQuoteFetcher.data) == null ? void 0 : _e.message) ? /* @__PURE__ */ jsx("div", {
              style: {
                ...deleteQuoteFetcher.data.ok ? styles$1.statusOk : styles$1.statusErr,
                fontSize: isMobile ? 16 : void 0,
                fontWeight: isMobile ? 700 : void 0
              },
              children: deleteQuoteFetcher.data.message
            }) : null, /* @__PURE__ */ jsxs("div", {
              style: {
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1.1fr 1fr",
                gap: 20
              },
              children: [/* @__PURE__ */ jsxs("div", {
                style: {
                  display: "grid",
                  gap: 10
                },
                children: [/* @__PURE__ */ jsx("button", {
                  type: "button",
                  onClick: () => toggleDetailSection("customer"),
                  style: mobileActionButtonStyle,
                  children: detailSectionsOpen.customer ? "Hide Quote Info" : "Show Quote Info"
                }), detailSectionsOpen.customer ? /* @__PURE__ */ jsxs("div", {
                  style: {
                    display: "grid",
                    gap: 10,
                    overflowWrap: "anywhere"
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Customer:"
                    }), " ", selectedQuote.customer_name || "Unnamed customer"]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Email:"
                    }), " ", selectedQuote.customer_email || "N/A"]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Phone:"
                    }), " ", selectedQuote.customer_phone || "N/A"]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Address:"
                    }), " ", selectedQuote.address1, ", ", selectedQuote.city, ",", " ", selectedQuote.province, " ", selectedQuote.postal_code]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Country:"
                    }), " ", selectedQuote.country || "US"]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: {
                      fontSize: isMobile ? 22 : void 0,
                      fontWeight: isMobile ? 800 : void 0
                    },
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Total:"
                    }), " ", formatMoney$1(selectedQuote.quote_total_cents)]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Service:"
                    }), " ", selectedQuote.service_name || "Quote"]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "ETA:"
                    }), " ", selectedQuote.eta || "N/A"]
                  }), selectedQuote.shipping_details ? /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Shipping Details:"
                    }), " ", selectedQuote.shipping_details]
                  }) : null, /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Summary:"
                    }), " ", selectedQuote.summary || "N/A"]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Notes:"
                    }), " ", selectedQuote.description || "N/A"]
                  })]
                }) : null]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  display: "grid",
                  gap: 12
                },
                children: [/* @__PURE__ */ jsx("button", {
                  type: "button",
                  onClick: () => toggleDetailSection("lineItems"),
                  style: mobileActionButtonStyle,
                  children: detailSectionsOpen.lineItems ? "Hide Line Items" : "Show Line Items"
                }), detailSectionsOpen.lineItems ? /* @__PURE__ */ jsx(Fragment, {
                  children: (selectedQuote.line_items || []).length === 0 ? /* @__PURE__ */ jsx("div", {
                    style: {
                      color: "#94a3b8"
                    },
                    children: "No saved line items."
                  }) : (selectedQuote.line_items || []).map((line, index) => /* @__PURE__ */ jsxs("div", {
                    style: {
                      border: "1px solid #1f2937",
                      borderRadius: 14,
                      padding: 14,
                      background: "rgba(2, 6, 23, 0.72)",
                      overflowWrap: "anywhere"
                    },
                    children: [/* @__PURE__ */ jsx("div", {
                      style: {
                        fontWeight: 700
                      },
                      children: line.title
                    }), /* @__PURE__ */ jsxs("div", {
                      style: {
                        color: "#94a3b8",
                        marginTop: 4,
                        fontSize: 14
                      },
                      children: [line.sku, " ", line.vendor ? `- ${line.vendor}` : ""]
                    }), /* @__PURE__ */ jsxs("div", {
                      style: {
                        color: "#cbd5e1",
                        marginTop: 8,
                        fontSize: 14
                      },
                      children: ["Qty ", line.quantity, " at $", Number(line.price || 0).toFixed(2), line.pricingLabel ? ` - ${line.pricingLabel}` : ""]
                    })]
                  }, `${line.sku}-${index}`))
                }) : null]
              })]
            })]
          }) : /* @__PURE__ */ jsx("div", {
            style: {
              color: "#94a3b8"
            },
            children: "Select a saved quote to review it."
          })
        })]
      })]
    }), isMobile ? /* @__PURE__ */ jsxs("div", {
      style: mobileBottomNavStyle,
      children: [/* @__PURE__ */ jsxs("a", {
        href: mobileDashboardHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "D"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dashboard"
        })]
      }), /* @__PURE__ */ jsxs("a", {
        href: quoteToolHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "Q"
        }), /* @__PURE__ */ jsx("span", {
          children: "Quote Tool"
        })]
      }), /* @__PURE__ */ jsxs("a", {
        href: isEmbeddedRoute ? "/app/quote-review" : "/quote-review",
        style: mobileTabLinkStyle(true),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(true),
          children: "R"
        }), /* @__PURE__ */ jsx("span", {
          children: "Review"
        })]
      })]
    }) : null]
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$c,
  default: quoteReview,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
function formatMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}
const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top, #1f2937 0%, #111827 45%, #030712 100%)",
    color: "#f9fafb",
    padding: "20px 14px 120px",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflowX: "clip"
  },
  shell: {
    maxWidth: "760px",
    margin: "0 auto",
    display: "grid",
    gap: "16px"
  },
  card: {
    background: "rgba(17, 24, 39, 0.9)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    borderRadius: "20px",
    padding: "18px",
    boxShadow: "0 18px 34px rgba(2, 6, 23, 0.35)",
    backdropFilter: "blur(12px)"
  },
  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: 800,
    letterSpacing: "-0.03em"
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#94a3b8",
    lineHeight: 1.5
  },
  sectionTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 800,
    color: "#f8fafc"
  },
  sectionSub: {
    margin: "6px 0 0",
    color: "#94a3b8",
    fontSize: "14px"
  },
  button: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    textDecoration: "none",
    color: "#f8fafc",
    borderRadius: "18px",
    padding: "18px 16px",
    background: "linear-gradient(135deg, rgba(37, 99, 235, 0.22), rgba(15, 118, 110, 0.18))",
    border: "1px solid rgba(96, 165, 250, 0.28)",
    minHeight: "96px",
    justifyContent: "center"
  },
  buttonTitle: {
    fontSize: "17px",
    fontWeight: 800
  },
  buttonSub: {
    fontSize: "13px",
    color: "#bfdbfe",
    lineHeight: 1.45
  },
  smallButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.86)",
    color: "#e2e8f0",
    textDecoration: "none",
    fontWeight: 700
  },
  input: {
    width: "100%",
    borderRadius: "14px",
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.92)",
    color: "#f8fafc",
    padding: "14px 16px",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box"
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#cbd5e1"
  },
  bottomNav: {
    position: "fixed",
    left: 12,
    right: 12,
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
    zIndex: 30,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 20,
    background: "rgba(15, 23, 42, 0.96)",
    border: "1px solid rgba(30, 41, 59, 0.95)",
    boxShadow: "0 18px 38px rgba(2, 6, 23, 0.45)",
    backdropFilter: "blur(14px)"
  },
  navLink: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 56,
    borderRadius: 14,
    color: "#94a3b8",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "11px",
    letterSpacing: "0.01em"
  },
  statusErr: {
    marginTop: "16px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "rgba(220, 38, 38, 0.15)",
    border: "1px solid rgba(248, 113, 113, 0.5)",
    color: "#fee2e2",
    fontWeight: 700
  }
};
function navLinkStyle(active) {
  return {
    ...styles.navLink,
    color: active ? "#38bdf8" : "#94a3b8",
    background: active ? "rgba(14, 165, 233, 0.12)" : "transparent"
  };
}
function navIconStyle(active) {
  return {
    width: 24,
    height: 24,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: active ? "rgba(14, 165, 233, 0.18)" : "rgba(51, 65, 85, 0.35)",
    color: active ? "#38bdf8" : "#cbd5e1",
    fontSize: 12,
    lineHeight: 1
  };
}
async function loader$5({
  request
}) {
  const url = new URL(request.url);
  const isEmbeddedRoute = url.pathname.startsWith("/app/");
  const dashboardPath = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  if (url.searchParams.get("logout") === "1") {
    return redirect(dashboardPath, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("", {
          maxAge: 0
        })
      }
    });
  }
  const allowed = await hasAdminQuoteAccess(request);
  const recentQuotes = allowed ? await getRecentCustomQuotes(8) : [];
  return data({
    allowed,
    recentQuotes
  });
}
async function action$b({
  request
}) {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  if (intent !== "login") {
    return data({
      allowed: false,
      loginError: "Invalid request",
      recentQuotes: []
    }, {
      status: 400
    });
  }
  const password = String(form.get("password") || "");
  const expected = getAdminQuotePassword();
  if (!expected || password !== expected) {
    return data({
      allowed: false,
      loginError: "Invalid password",
      recentQuotes: []
    }, {
      status: 401
    });
  }
  return data({
    allowed: true,
    loginError: null,
    recentQuotes: await getRecentCustomQuotes(8)
  }, {
    headers: {
      "Set-Cookie": await adminQuoteCookie.serialize("ok")
    }
  });
}
const mobileDashboard = UNSAFE_withComponentProps(function MobileDashboardPage() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const location = useLocation();
  const allowed = (actionData == null ? void 0 : actionData.allowed) ?? loaderData.allowed;
  const recentQuotes = (actionData == null ? void 0 : actionData.recentQuotes) || loaderData.recentQuotes || [];
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const quoteToolBase = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const reviewHref = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  const dashboardHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  if (!allowed) {
    return /* @__PURE__ */ jsx("div", {
      style: styles.page,
      children: /* @__PURE__ */ jsx("div", {
        style: styles.shell,
        children: /* @__PURE__ */ jsxs("div", {
          style: styles.card,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles.title,
            children: "Mobile Dashboard"
          }), /* @__PURE__ */ jsx("p", {
            style: styles.subtitle,
            children: "Enter the admin password to open the mobile quote workspace."
          }), /* @__PURE__ */ jsxs(Form, {
            method: "post",
            autoComplete: "off",
            style: {
              marginTop: 22
            },
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "login"
            }), /* @__PURE__ */ jsx("label", {
              style: styles.label,
              children: "Admin Password"
            }), /* @__PURE__ */ jsx("input", {
              type: "password",
              name: "password",
              autoComplete: "current-password",
              style: styles.input
            }), (actionData == null ? void 0 : actionData.loginError) ? /* @__PURE__ */ jsx("div", {
              style: styles.statusErr,
              children: actionData.loginError
            }) : null, /* @__PURE__ */ jsx("button", {
              type: "submit",
              style: {
                ...styles.smallButton,
                marginTop: 16,
                background: "linear-gradient(135deg, #2563eb, #14b8a6)",
                color: "#eff6ff"
              },
              children: "Open Mobile Dashboard"
            })]
          })]
        })
      })
    });
  }
  return /* @__PURE__ */ jsxs("div", {
    style: styles.page,
    children: [/* @__PURE__ */ jsxs("div", {
      style: styles.shell,
      children: [/* @__PURE__ */ jsxs("div", {
        style: {
          ...styles.card,
          position: "sticky",
          top: 10,
          zIndex: 18
        },
        children: [/* @__PURE__ */ jsx("h1", {
          style: styles.title,
          children: "Local Contractor Quote"
        }), /* @__PURE__ */ jsx("p", {
          style: styles.subtitle,
          children: "Quick mobile entry point for building quotes, reviewing history, and jumping into the right pricing mode fast."
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles.card,
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles.sectionTitle,
          children: "Start A Quote"
        }), /* @__PURE__ */ jsx("p", {
          style: styles.sectionSub,
          children: "Choose the quote mode you want before opening the full builder."
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            display: "grid",
            gap: 12,
            marginTop: 14
          },
          children: [/* @__PURE__ */ jsxs("a", {
            href: `${quoteToolBase}?audience=customer`,
            style: styles.button,
            children: [/* @__PURE__ */ jsx("span", {
              style: styles.buttonTitle,
              children: "Customer Quote"
            }), /* @__PURE__ */ jsx("span", {
              style: styles.buttonSub,
              children: "Standard customer pricing and normal quote flow."
            })]
          }), /* @__PURE__ */ jsxs("a", {
            href: `${quoteToolBase}?audience=contractor&tier=tier1`,
            style: styles.button,
            children: [/* @__PURE__ */ jsx("span", {
              style: styles.buttonTitle,
              children: "Contractor Quote"
            }), /* @__PURE__ */ jsx("span", {
              style: styles.buttonSub,
              children: "Open the builder with contractor pricing ready to go."
            })]
          }), /* @__PURE__ */ jsxs("a", {
            href: `${quoteToolBase}?audience=custom`,
            style: styles.button,
            children: [/* @__PURE__ */ jsx("span", {
              style: styles.buttonTitle,
              children: "Custom Quote"
            }), /* @__PURE__ */ jsx("span", {
              style: styles.buttonSub,
              children: "Editable pricing, shipping math, and manual adjustments."
            })]
          })]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles.card,
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles.sectionTitle,
          children: "Quick Actions"
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            display: "grid",
            gap: 12,
            marginTop: 14
          },
          children: [/* @__PURE__ */ jsx("a", {
            href: quoteToolBase,
            style: styles.smallButton,
            children: "Open Quote Tool"
          }), /* @__PURE__ */ jsx("a", {
            href: reviewHref,
            style: styles.smallButton,
            children: "Review Quotes"
          }), /* @__PURE__ */ jsx("a", {
            href: `${dashboardHref}?logout=1`,
            style: styles.smallButton,
            children: "Log Out"
          })]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles.card,
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles.sectionTitle,
          children: "Recent Quotes"
        }), /* @__PURE__ */ jsx("p", {
          style: styles.sectionSub,
          children: "Open review with a recent quote ready to inspect."
        }), /* @__PURE__ */ jsx("div", {
          style: {
            display: "grid",
            gap: 12,
            marginTop: 14
          },
          children: recentQuotes.length === 0 ? /* @__PURE__ */ jsx("div", {
            style: {
              color: "#94a3b8"
            },
            children: "No recent quotes yet."
          }) : recentQuotes.map((quote) => /* @__PURE__ */ jsxs("a", {
            href: `${reviewHref}?quote=${encodeURIComponent(quote.id)}`,
            style: {
              ...styles.button,
              minHeight: "unset",
              overflowWrap: "anywhere"
            },
            children: [/* @__PURE__ */ jsx("span", {
              style: styles.buttonTitle,
              children: quote.customer_name || quote.customer_email || "Unnamed quote"
            }), /* @__PURE__ */ jsxs("span", {
              style: styles.buttonSub,
              children: [formatMoney(quote.quote_total_cents), " · ", quote.city, ", ", quote.province]
            }), /* @__PURE__ */ jsx("span", {
              style: {
                ...styles.buttonSub,
                color: "#94a3b8"
              },
              children: new Date(quote.created_at).toLocaleString()
            })]
          }, quote.id))
        })]
      })]
    }), /* @__PURE__ */ jsxs("div", {
      style: styles.bottomNav,
      children: [/* @__PURE__ */ jsxs("a", {
        href: dashboardHref,
        style: navLinkStyle(true),
        children: [/* @__PURE__ */ jsx("span", {
          style: navIconStyle(true),
          children: "D"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dashboard"
        })]
      }), /* @__PURE__ */ jsxs("a", {
        href: quoteToolBase,
        style: navLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: navIconStyle(false),
          children: "Q"
        }), /* @__PURE__ */ jsx("span", {
          children: "Quote Tool"
        })]
      }), /* @__PURE__ */ jsxs("a", {
        href: reviewHref,
        style: navLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: navIconStyle(false),
          children: "R"
        }), /* @__PURE__ */ jsx("span", {
          children: "Review"
        })]
      })]
    })]
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$b,
  default: mobileDashboard,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const loader$4 = async ({
  request
}) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const errors = loginErrorMessage(await login(request));
  return {
    errors,
    shop
  };
};
const action$a = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const route = UNSAFE_withComponentProps(function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const {
    errors
  } = actionData || loaderData;
  const [shop, setShop] = useState(loaderData.shop || "");
  return /* @__PURE__ */ jsx(AppProvider, {
    embedded: false,
    children: /* @__PURE__ */ jsx("s-page", {
      children: /* @__PURE__ */ jsx(Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-section", {
          heading: "Log in",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            name: "shop",
            label: "Shop domain",
            details: "example.myshopify.com",
            value: shop,
            onChange: (e) => setShop(e.currentTarget.value),
            autocomplete: "off",
            error: errors.shop
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Log in"
          })]
        })
      })
    })
  });
});
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$a,
  default: route,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
async function loader$3({
  request
}) {
  await authenticate.admin(request);
  return null;
}
const auth_$ = UNSAFE_withComponentProps(function AuthCatchAll() {
  return null;
});
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: auth_$,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
async function loader$2({
  request
}) {
  const {
    admin
  } = await authenticate.admin(request);
  try {
    const syncStatus = await ensureProductOptionsFresh(admin);
    return data({
      lastProductSyncAt: syncStatus.lastUpdatedAt,
      justSynced: syncStatus.synced,
      syncedCount: syncStatus.syncedCount
    });
  } catch (error) {
    console.error("[AUTO PRODUCT SYNC ERROR]", error);
    return data({
      lastProductSyncAt: await getLatestProductSyncTimestamp(),
      justSynced: false,
      syncedCount: 0
    });
  }
}
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  return boundary.error(null);
});
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const app = UNSAFE_withComponentProps(function AppLayout() {
  const loaderData = useLoaderData();
  const location = useLocation();
  const qs = location.search || "";
  const lastSyncLabel = (loaderData == null ? void 0 : loaderData.lastProductSyncAt) ? new Date(loaderData.lastProductSyncAt).toLocaleString() : "Never";
  return /* @__PURE__ */ jsxs("div", {
    style: {
      minHeight: "100vh",
      background: "#0f172a",
      color: "#f8fafc"
    },
    children: [/* @__PURE__ */ jsxs("nav", {
      style: {
        display: "flex",
        gap: "12px",
        padding: "16px 20px",
        borderBottom: "1px solid #1e293b",
        alignItems: "center",
        flexWrap: "wrap",
        background: "#111827"
      },
      children: [/* @__PURE__ */ jsx(Link, {
        to: `/app${qs}`,
        style: {
          color: "#e5e7eb",
          textDecoration: "none",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #334155",
          background: "#0f172a"
        },
        children: "Dashboard"
      }), /* @__PURE__ */ jsx(Link, {
        to: `/app/admin${qs}`,
        style: {
          color: "#e5e7eb",
          textDecoration: "none",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #334155",
          background: "#0f172a"
        },
        children: "Admin"
      }), /* @__PURE__ */ jsx(Link, {
        to: `/app/custom-quote${qs}`,
        style: {
          color: "#e5e7eb",
          textDecoration: "none",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #334155",
          background: "#0f172a"
        },
        children: "Custom Quote"
      }), /* @__PURE__ */ jsx("a", {
        href: "/custom-quote",
        target: "_blank",
        rel: "noreferrer",
        style: {
          color: "#e5e7eb",
          textDecoration: "none",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #334155",
          background: "#0f172a"
        },
        children: "Quote Portal"
      }), /* @__PURE__ */ jsxs(Form, {
        method: "post",
        action: `/api/sync-products${qs}`,
        style: {
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 12
        },
        children: [/* @__PURE__ */ jsxs("div", {
          style: {
            padding: "8px 12px",
            borderRadius: "999px",
            border: "1px solid #334155",
            background: (loaderData == null ? void 0 : loaderData.justSynced) ? "rgba(22, 163, 74, 0.16)" : "#0f172a",
            color: (loaderData == null ? void 0 : loaderData.justSynced) ? "#86efac" : "#cbd5e1",
            fontSize: 12,
            lineHeight: 1.2,
            whiteSpace: "nowrap"
          },
          children: [(loaderData == null ? void 0 : loaderData.justSynced) ? "Auto-synced now" : "Product sync", /* @__PURE__ */ jsx("span", {
            style: {
              color: "#94a3b8",
              marginLeft: 6
            },
            children: lastSyncLabel
          })]
        }), /* @__PURE__ */ jsx("button", {
          type: "submit",
          style: {
            padding: "10px 14px",
            borderRadius: "10px",
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer"
          },
          children: "Sync Shopify Products"
        })]
      })]
    }), /* @__PURE__ */ jsx("div", {
      style: {
        padding: "20px"
      },
      children: /* @__PURE__ */ jsx(Outlet, {})
    })]
  });
});
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  headers,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const CARRIER_NAME = "GHS Shipping Calc";
const LIST_CARRIER_SERVICES = `#graphql
  query CarrierServices {
    carrierServices(first: 20) {
      nodes {
        id
        name
        active
        callbackUrl
        supportsServiceDiscovery
      }
    }
  }
`;
const CREATE_CARRIER_SERVICE = `#graphql
  mutation CreateCarrierService($input: DeliveryCarrierServiceCreateInput!) {
    carrierServiceCreate(input: $input) {
      carrierService {
        id
        name
        active
        callbackUrl
        supportsServiceDiscovery
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const UPDATE_CARRIER_SERVICE = `#graphql
  mutation UpdateCarrierService($id: ID!, $input: DeliveryCarrierServiceUpdateInput!) {
    carrierServiceUpdate(id: $id, input: $input) {
      carrierService {
        id
        name
        active
        callbackUrl
        supportsServiceDiscovery
      }
      userErrors {
        field
        message
      }
    }
  }
`;
async function registerCarrierService(admin) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) {
    return {
      ok: false,
      step: "env",
      message: "SHOPIFY_APP_URL is missing"
    };
  }
  const callbackUrl = `${appUrl.replace(/\/$/, "")}/api/carrier-service`;
  try {
    const listResponse = await admin.graphql(LIST_CARRIER_SERVICES);
    const listJson = await listResponse.json();
    const carriers = ((_b = (_a2 = listJson == null ? void 0 : listJson.data) == null ? void 0 : _a2.carrierServices) == null ? void 0 : _b.nodes) || [];
    const existing = carriers.find((service) => service.name === CARRIER_NAME);
    if (existing) {
      const needsUpdate = existing.callbackUrl !== callbackUrl || existing.active !== true || existing.supportsServiceDiscovery !== true;
      if (!needsUpdate) {
        return {
          ok: true,
          step: "exists",
          message: "Carrier service already exists and is correct",
          carrier: existing,
          callbackUrl
        };
      }
      const updateResponse = await admin.graphql(UPDATE_CARRIER_SERVICE, {
        variables: {
          id: existing.id,
          input: {
            name: CARRIER_NAME,
            callbackUrl,
            active: true,
            supportsServiceDiscovery: true
          }
        }
      });
      const updateJson = await updateResponse.json();
      const updateErrors = ((_d = (_c = updateJson == null ? void 0 : updateJson.data) == null ? void 0 : _c.carrierServiceUpdate) == null ? void 0 : _d.userErrors) || [];
      if (updateErrors.length > 0) {
        return {
          ok: false,
          step: "update",
          message: "Carrier update failed",
          errors: updateErrors,
          raw: updateJson,
          callbackUrl
        };
      }
      return {
        ok: true,
        step: "updated",
        message: "Carrier service updated",
        carrier: (_f = (_e = updateJson == null ? void 0 : updateJson.data) == null ? void 0 : _e.carrierServiceUpdate) == null ? void 0 : _f.carrierService,
        callbackUrl
      };
    }
    const createResponse = await admin.graphql(CREATE_CARRIER_SERVICE, {
      variables: {
        input: {
          name: CARRIER_NAME,
          callbackUrl,
          active: true,
          supportsServiceDiscovery: true
        }
      }
    });
    const createJson = await createResponse.json();
    const createErrors = ((_h = (_g = createJson == null ? void 0 : createJson.data) == null ? void 0 : _g.carrierServiceCreate) == null ? void 0 : _h.userErrors) || [];
    if (createErrors.length > 0) {
      return {
        ok: false,
        step: "create",
        message: "Carrier creation failed",
        errors: createErrors,
        raw: createJson,
        callbackUrl
      };
    }
    return {
      ok: true,
      step: "created",
      message: "Carrier service created",
      carrier: (_j = (_i = createJson == null ? void 0 : createJson.data) == null ? void 0 : _i.carrierServiceCreate) == null ? void 0 : _j.carrierService,
      callbackUrl
    };
  } catch (error) {
    return {
      ok: false,
      step: "exception",
      message: (error == null ? void 0 : error.message) || "Unknown error",
      error: String(error),
      callbackUrl
    };
  }
}
async function loader$1({
  request
}) {
  const {
    admin,
    session
  } = await authenticate.admin(request);
  await registerCarrierService(admin);
  const settings = await getAppSettings(session.shop);
  return data({
    settings
  });
}
async function action$9({
  request
}) {
  const {
    session
  } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    const savedSettings = await saveAppSettings(session.shop, {
      useTestFlatRate: form.get("useTestFlatRate") === "on",
      testFlatRateCents: Number(form.get("testFlatRateCents") || 5e3),
      enableCalculatedRates: form.get("enableCalculatedRates") === "on",
      enableRemoteSurcharge: form.get("enableRemoteSurcharge") === "on",
      enableDebugLogging: form.get("enableDebugLogging") === "on",
      showVendorSource: form.get("showVendorSource") === "on"
    });
    return data({
      ok: true,
      message: "Settings saved successfully.",
      settings: savedSettings
    });
  } catch (error) {
    console.error("[APP SETTINGS ACTION ERROR]", error);
    return data({
      ok: false,
      message: (error == null ? void 0 : error.message) || "Failed to save settings."
    }, {
      status: 500
    });
  }
}
const app__index = UNSAFE_withComponentProps(function AppIndex() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const settings = (actionData == null ? void 0 : actionData.settings) ?? loaderData.settings;
  const isSaving = navigation.state === "submitting";
  return /* @__PURE__ */ jsxs("div", {
    style: {
      padding: 30,
      maxWidth: 800
    },
    children: [/* @__PURE__ */ jsx("h1", {
      style: {
        fontSize: 28,
        marginBottom: 8
      },
      children: "Local Delivery Admin"
    }), /* @__PURE__ */ jsx("p", {
      style: {
        marginBottom: 24
      },
      children: "Manage shipping behavior for testing and live checkout."
    }), (actionData == null ? void 0 : actionData.message) ? /* @__PURE__ */ jsx("div", {
      style: {
        marginBottom: 20,
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid",
        borderColor: actionData.ok ? "#16a34a" : "#dc2626",
        background: actionData.ok ? "#f0fdf4" : "#fef2f2",
        color: "#111827"
      },
      children: actionData.message
    }) : null, /* @__PURE__ */ jsx(Form, {
      method: "post",
      children: /* @__PURE__ */ jsxs("div", {
        style: {
          display: "grid",
          gap: 18
        },
        children: [/* @__PURE__ */ jsxs("label", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "checkbox",
            name: "enableCalculatedRates",
            defaultChecked: settings.enableCalculatedRates
          }), " ", "Enable calculated shipping rates"]
        }), /* @__PURE__ */ jsxs("label", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "checkbox",
            name: "useTestFlatRate",
            defaultChecked: settings.useTestFlatRate
          }), " ", "Use test flat rate"]
        }), /* @__PURE__ */ jsxs("label", {
          children: ["Test flat rate (cents)", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
            type: "number",
            name: "testFlatRateCents",
            defaultValue: settings.testFlatRateCents,
            min: 0,
            style: {
              width: 220,
              marginTop: 5
            }
          })]
        }), /* @__PURE__ */ jsxs("label", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "checkbox",
            name: "enableRemoteSurcharge",
            defaultChecked: settings.enableRemoteSurcharge
          }), " ", "Enable remote ZIP surcharge"]
        }), /* @__PURE__ */ jsxs("label", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "checkbox",
            name: "enableDebugLogging",
            defaultChecked: settings.enableDebugLogging
          }), " ", "Enable debug logging"]
        }), /* @__PURE__ */ jsxs("label", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "checkbox",
            name: "showVendorSource",
            defaultChecked: settings.showVendorSource
          }), " ", "Show vendor source on checkout"]
        }), /* @__PURE__ */ jsx("button", {
          type: "submit",
          disabled: isSaving,
          style: {
            marginTop: 10,
            padding: "10px 16px",
            background: isSaving ? "#6b7280" : "#111",
            color: "#fff",
            borderRadius: 6,
            border: "none",
            cursor: isSaving ? "default" : "pointer",
            width: 180
          },
          children: isSaving ? "Saving..." : "Save Settings"
        })]
      })
    })]
  });
});
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$9,
  default: app__index,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
async function getOriginAddresses() {
  const { data: data2, error } = await supabaseAdmin.from("origin_addresses").select("id, label, address, is_active").order("label", { ascending: true });
  if (error) {
    console.error("[GET ORIGIN ADDRESSES ERROR]", error);
    return [];
  }
  return data2 || [];
}
async function saveOriginAddress(row) {
  const payload = {
    ...row.id ? { id: row.id } : {},
    label: row.label,
    address: row.address,
    is_active: row.is_active
  };
  const { data: data2, error } = await supabaseAdmin.from("origin_addresses").upsert(payload, row.id ? { onConflict: "id" } : void 0).select("*").single();
  if (error) {
    console.error("[SAVE ORIGIN ADDRESS ERROR]", error);
    throw error;
  }
  return data2;
}
async function getShippingMaterialRules() {
  const { data: data2, error } = await supabaseAdmin.from("shipping_material_rules").select("prefix, material_name, truck_capacity, vendor_source, is_active, sort_order").order("sort_order", { ascending: true });
  if (error) {
    console.error("[GET SHIPPING MATERIAL RULES ERROR]", error);
    return [];
  }
  return data2 || [];
}
async function saveShippingMaterialRule(row) {
  const payload = {
    prefix: row.prefix,
    material_name: row.material_name,
    truck_capacity: row.truck_capacity,
    vendor_source: row.vendor_source || null,
    is_active: row.is_active,
    sort_order: row.sort_order,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const { data: data2, error } = await supabaseAdmin.from("shipping_material_rules").upsert(payload, { onConflict: "prefix" }).select("*").single();
  if (error) {
    console.error("[SAVE SHIPPING MATERIAL RULE ERROR]", error);
    throw error;
  }
  return data2;
}
async function loader({
  request
}) {
  await authenticate.admin(request);
  const [origins, rules] = await Promise.all([getOriginAddresses(), getShippingMaterialRules()]);
  return data({
    origins,
    rules
  });
}
async function action$8({
  request
}) {
  await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  try {
    if (intent === "save-origin") {
      await saveOriginAddress({
        id: String(form.get("id") || "") || void 0,
        label: String(form.get("label") || "").trim(),
        address: String(form.get("address") || "").trim(),
        is_active: form.get("is_active") === "on"
      });
      return data({
        ok: true,
        message: "Pickup vendor saved."
      });
    }
    if (intent === "save-rule") {
      await saveShippingMaterialRule({
        prefix: String(form.get("prefix") || "").trim(),
        material_name: String(form.get("material_name") || "").trim(),
        truck_capacity: Number(form.get("truck_capacity") || 22),
        vendor_source: String(form.get("vendor_source") || "").trim(),
        is_active: form.get("is_active") === "on",
        sort_order: Number(form.get("sort_order") || 0)
      });
      return data({
        ok: true,
        message: "Material rule saved."
      });
    }
    return data({
      ok: false,
      message: "Unknown action."
    }, {
      status: 400
    });
  } catch (error) {
    console.error("[ADMIN ACTION ERROR]", error);
    return data({
      ok: false,
      message: (error == null ? void 0 : error.message) || "Save failed."
    }, {
      status: 500
    });
  }
}
const app_admin = UNSAFE_withComponentProps(function AdminPage() {
  const {
    origins,
    rules
  } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const location = useLocation();
  const qs = location.search || "";
  const isSaving = navigation.state === "submitting";
  return /* @__PURE__ */ jsxs("div", {
    style: {
      padding: 30,
      maxWidth: 1100
    },
    children: [/* @__PURE__ */ jsx("h1", {
      style: {
        fontSize: 28,
        marginBottom: 8
      },
      children: "Delivery Admin"
    }), /* @__PURE__ */ jsx("p", {
      style: {
        marginBottom: 24
      },
      children: "Manage pickup vendors and SKU prefix rules."
    }), (actionData == null ? void 0 : actionData.message) ? /* @__PURE__ */ jsx("div", {
      style: {
        marginBottom: 20,
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid",
        borderColor: actionData.ok ? "#16a34a" : "#dc2626",
        background: actionData.ok ? "#f0fdf4" : "#fef2f2"
      },
      children: actionData.message
    }) : null, /* @__PURE__ */ jsxs("div", {
      style: {
        display: "grid",
        gap: 32
      },
      children: [/* @__PURE__ */ jsxs("section", {
        children: [/* @__PURE__ */ jsx("h2", {
          style: {
            fontSize: 22,
            marginBottom: 12
          },
          children: "Pickup Vendors"
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            display: "grid",
            gap: 14
          },
          children: [origins.map((origin) => /* @__PURE__ */ jsxs(Form, {
            method: "post",
            style: {
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 16,
              display: "grid",
              gap: 12
            },
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "save-origin"
            }), /* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "id",
              value: origin.id || ""
            }), /* @__PURE__ */ jsxs("label", {
              children: ["Vendor label", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "label",
                defaultValue: origin.label,
                style: {
                  width: "100%",
                  marginTop: 6
                }
              })]
            }), /* @__PURE__ */ jsxs("label", {
              children: ["Pickup address", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "address",
                defaultValue: origin.address,
                style: {
                  width: "100%",
                  marginTop: 6
                }
              })]
            }), /* @__PURE__ */ jsxs("label", {
              children: [/* @__PURE__ */ jsx("input", {
                type: "checkbox",
                name: "is_active",
                defaultChecked: origin.is_active
              }), " ", "Active"]
            }), /* @__PURE__ */ jsx("button", {
              type: "submit",
              disabled: isSaving,
              style: {
                width: 160,
                padding: "10px 14px",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 6
              },
              children: isSaving ? "Saving..." : "Save Vendor"
            })]
          }, origin.id || origin.label)), /* @__PURE__ */ jsxs(Form, {
            method: "post",
            style: {
              border: "1px dashed #cbd5e1",
              borderRadius: 10,
              padding: 16,
              display: "grid",
              gap: 12
            },
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "save-origin"
            }), /* @__PURE__ */ jsxs("label", {
              children: ["New vendor label", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "label",
                style: {
                  width: "100%",
                  marginTop: 6
                }
              })]
            }), /* @__PURE__ */ jsxs("label", {
              children: ["New pickup address", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "address",
                style: {
                  width: "100%",
                  marginTop: 6
                }
              })]
            }), /* @__PURE__ */ jsxs("label", {
              children: [/* @__PURE__ */ jsx("input", {
                type: "checkbox",
                name: "is_active",
                defaultChecked: true
              }), " Active"]
            }), /* @__PURE__ */ jsx("button", {
              type: "submit",
              disabled: isSaving,
              style: {
                width: 180,
                padding: "10px 14px",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 6
              },
              children: isSaving ? "Saving..." : "Add Vendor"
            })]
          })]
        })]
      }), /* @__PURE__ */ jsxs("section", {
        children: [/* @__PURE__ */ jsx("h2", {
          style: {
            fontSize: 22,
            marginBottom: 12
          },
          children: "SKU Prefix Rules"
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            display: "grid",
            gap: 14
          },
          children: [rules.map((rule) => /* @__PURE__ */ jsxs(Form, {
            method: "post",
            style: {
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 16,
              display: "grid",
              gap: 12
            },
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "save-rule"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gridTemplateColumns: "120px 1fr 160px 1fr 120px",
                gap: 12
              },
              children: [/* @__PURE__ */ jsxs("label", {
                children: ["Prefix", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "text",
                  name: "prefix",
                  defaultValue: rule.prefix,
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              }), /* @__PURE__ */ jsxs("label", {
                children: ["Material name", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "text",
                  name: "material_name",
                  defaultValue: rule.material_name,
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              }), /* @__PURE__ */ jsxs("label", {
                children: ["Truck cap", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "truck_capacity",
                  defaultValue: rule.truck_capacity,
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              }), /* @__PURE__ */ jsxs("label", {
                children: ["Vendor source", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "text",
                  name: "vendor_source",
                  defaultValue: rule.vendor_source || "",
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              }), /* @__PURE__ */ jsxs("label", {
                children: ["Sort order", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "sort_order",
                  defaultValue: rule.sort_order,
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              })]
            }), /* @__PURE__ */ jsxs("label", {
              children: [/* @__PURE__ */ jsx("input", {
                type: "checkbox",
                name: "is_active",
                defaultChecked: rule.is_active
              }), " ", "Active"]
            }), /* @__PURE__ */ jsx("button", {
              type: "submit",
              disabled: isSaving,
              style: {
                width: 160,
                padding: "10px 14px",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 6
              },
              children: isSaving ? "Saving..." : "Save Rule"
            })]
          }, rule.prefix)), /* @__PURE__ */ jsxs(Form, {
            method: "post",
            style: {
              border: "1px dashed #cbd5e1",
              borderRadius: 10,
              padding: 16,
              display: "grid",
              gap: 12
            },
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "save-rule"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gridTemplateColumns: "120px 1fr 160px 1fr 120px",
                gap: 12
              },
              children: [/* @__PURE__ */ jsxs("label", {
                children: ["Prefix", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "text",
                  name: "prefix",
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              }), /* @__PURE__ */ jsxs("label", {
                children: ["Material name", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "text",
                  name: "material_name",
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              }), /* @__PURE__ */ jsxs("label", {
                children: ["Truck cap", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "truck_capacity",
                  defaultValue: 22,
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              }), /* @__PURE__ */ jsxs("label", {
                children: ["Vendor source", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "text",
                  name: "vendor_source",
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              }), /* @__PURE__ */ jsxs("label", {
                children: ["Sort order", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "sort_order",
                  defaultValue: 0,
                  style: {
                    width: "100%",
                    marginTop: 6
                  }
                })]
              })]
            }), /* @__PURE__ */ jsxs("label", {
              children: [/* @__PURE__ */ jsx("input", {
                type: "checkbox",
                name: "is_active",
                defaultChecked: true
              }), " Active"]
            }), /* @__PURE__ */ jsx("button", {
              type: "submit",
              disabled: isSaving,
              style: {
                width: 180,
                padding: "10px 14px",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 6
              },
              children: isSaving ? "Saving..." : "Add Rule"
            })]
          }), /* @__PURE__ */ jsx(Form, {
            method: "post",
            action: `/api/sync-products${qs}`,
            children: /* @__PURE__ */ jsx("button", {
              type: "submit",
              children: "Sync Shopify Products"
            })
          })]
        })]
      })]
    })]
  });
});
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8,
  default: app_admin,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const app_additional = UNSAFE_withComponentProps(function AdditionalPage() {
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Additional page",
    children: [/* @__PURE__ */ jsxs("s-section", {
      heading: "Multiple pages",
      children: [/* @__PURE__ */ jsxs("s-paragraph", {
        children: ["The app template comes with an additional page which demonstrates how to create multiple pages within app navigation using", " ", /* @__PURE__ */ jsx("s-link", {
          href: "https://shopify.dev/docs/apps/tools/app-bridge",
          target: "_blank",
          children: "App Bridge"
        }), "."]
      }), /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["To create your own page and have it show up in the app navigation, add a page inside ", /* @__PURE__ */ jsx("code", {
          children: "app/routes"
        }), ", and a link to it in the", " ", /* @__PURE__ */ jsx("code", {
          children: "<ui-nav-menu>"
        }), " component found in", " ", /* @__PURE__ */ jsx("code", {
          children: "app/routes/app.jsx"
        }), "."]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      slot: "aside",
      heading: "Resources",
      children: /* @__PURE__ */ jsx("s-unordered-list", {
        children: /* @__PURE__ */ jsx("s-list-item", {
          children: /* @__PURE__ */ jsx("s-link", {
            href: "https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav",
            target: "_blank",
            children: "App nav best practices"
          })
        })
      })
    })]
  });
});
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_additional
}, Symbol.toStringTag, { value: "Module" }));
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$d,
  default: customQuote,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$c,
  default: quoteReview,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$b,
  default: mobileDashboard,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
async function action$7({
  request
}) {
  const body = await request.json();
  const shippingAddress = (body == null ? void 0 : body.shippingAddress) ?? {};
  const lines = Array.isArray(body == null ? void 0 : body.lines) ? body.lines : [];
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || (body == null ? void 0 : body.shop) || request.headers.get("x-shopify-shop-domain") || process.env.SHOPIFY_STORE_DOMAIN || "";
  if (!shop) {
    throw new Error("Missing shop parameter");
  }
  const quote = await getQuote({
    shop,
    postalCode: shippingAddress.zip ?? "",
    country: shippingAddress.countryCode ?? "US",
    province: shippingAddress.provinceCode ?? "",
    city: shippingAddress.city ?? "",
    address1: shippingAddress.address1 ?? "",
    address2: shippingAddress.address2 ?? "",
    items: lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity ?? 0,
      grams: line.grams ?? 0,
      price: line.price ?? 0,
      requiresShipping: true,
      productVendor: line.vendor || line.product_vendor || ""
    }))
  });
  return data({
    summary: quote.summary,
    eta: quote.eta,
    description: quote.description,
    cents: quote.cents,
    serviceName: quote.serviceName,
    outsideDeliveryArea: quote.outsideDeliveryArea ?? false,
    outsideDeliveryMiles: quote.outsideDeliveryMiles ?? 0,
    outsideDeliveryRadius: quote.outsideDeliveryRadius ?? 50,
    outsideDeliveryPhone: quote.outsideDeliveryPhone ?? "(262) 345-4001"
  });
}
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7
}, Symbol.toStringTag, { value: "Module" }));
async function action$6({
  request
}) {
  const url = new URL(request.url);
  const body = await request.json();
  const rate = (body == null ? void 0 : body.rate) ?? {};
  const destination = rate.destination ?? {};
  const items = Array.isArray(rate.items) ? rate.items : [];
  const shop = url.searchParams.get("shop") || (body == null ? void 0 : body.shop) || request.headers.get("x-shopify-shop-domain") || process.env.SHOPIFY_STORE_DOMAIN || "";
  if (!shop) {
    throw new Error("Missing shop parameter");
  }
  const mappedItems = items.map((item) => ({
    sku: item.sku,
    quantity: item.quantity ?? 0,
    grams: item.grams ?? 0,
    price: item.price ?? 0,
    requiresShipping: item.requires_shipping !== false,
    pickupVendor: item.vendor || item.product_vendor || ""
  }));
  console.log("[CARRIER SHOP]", shop);
  console.log("[MAPPED ITEMS]", JSON.stringify(mappedItems, null, 2));
  const quote = await getQuote({
    shop,
    postalCode: destination.postal_code ?? "",
    country: destination.country ?? "US",
    province: destination.province ?? "",
    city: destination.city ?? "",
    address1: destination.address1 ?? "",
    address2: destination.address2 ?? "",
    items: mappedItems
  });
  console.log("[QUOTE RESULT]", JSON.stringify(quote, null, 2));
  if (quote.outsideDeliveryArea) {
    return data({
      rates: [{
        service_name: "Call for delivery quote",
        service_code: "CALL_FOR_QUOTE",
        total_price: "1",
        description: "Outside delivery area — please call for custom quote",
        currency: rate.currency ?? "USD"
      }]
    });
  }
  return data({
    rates: [{
      service_name: quote.serviceName,
      service_code: quote.serviceCode,
      total_price: String(quote.cents),
      description: quote.description,
      currency: rate.currency ?? "USD"
    }]
  });
}
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6
}, Symbol.toStringTag, { value: "Module" }));
async function action$5({
  request
}) {
  const {
    admin,
    session
  } = await authenticate.admin(request);
  try {
    const products = await fetchProductOptionsFromShopify(admin);
    await syncProductOptionsToSupabase(products);
    console.log("[SYNC PRODUCTS]", session.shop, "synced", products.length, "variants");
    return data({
      ok: true,
      shop: session.shop,
      syncedCount: products.length
    });
  } catch (error) {
    console.error("[SYNC PRODUCTS ERROR]", error);
    return data({
      ok: false,
      message: (error == null ? void 0 : error.message) || "Failed to sync products"
    }, {
      status: 500
    });
  }
}
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
const SHOPIFY_TITLE_LIMIT = 40;
function getStoreHandle(shop) {
  return shop.replace(".myshopify.com", "");
}
function truncateShopifyTitle(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Quoted Item";
  if (normalized.length <= SHOPIFY_TITLE_LIMIT) return normalized;
  return `${normalized.slice(0, SHOPIFY_TITLE_LIMIT - 1).trimEnd()}…`;
}
function buildQuoteTag(quoteId) {
  const normalized = String(quoteId || "").trim();
  if (!normalized) return "quote";
  return `quote:${normalized.slice(0, 34)}`;
}
async function action$4({
  request
}) {
  var _a2;
  const form = await request.formData();
  const quoteId = String(form.get("quoteId") || "").trim();
  if (!quoteId) {
    return data({
      ok: false,
      message: "Missing quote id."
    }, {
      status: 400
    });
  }
  const quote = await getCustomQuoteById(quoteId);
  if (!quote) {
    return data({
      ok: false,
      message: "Quote not found."
    }, {
      status: 404
    });
  }
  const isEmbeddedRequest = new URL(request.url).pathname.startsWith("/app/");
  const shop = quote.shop || process.env.SHOPIFY_STORE_DOMAIN || "";
  if (!shop) {
    return data({
      ok: false,
      message: "Quote is missing a Shopify shop domain."
    }, {
      status: 400
    });
  }
  const adminClient = isEmbeddedRequest ? await authenticate.admin(request) : await shopify.unauthenticated.admin(shop);
  const admin = adminClient.admin;
  const products = await getProductOptionsFromSupabase();
  const lineItems = quote.line_items || [];
  if (lineItems.length === 0) {
    return data({
      ok: false,
      message: "Quote has no line items."
    }, {
      status: 400
    });
  }
  const productsSubtotalCents = lineItems.reduce((sum, line) => sum + Math.round(Number(line.price || 0) * 100) * Number(line.quantity || 0), 0);
  const remainingChargeCents = Math.max(0, Number(quote.quote_total_cents || 0) - productsSubtotalCents);
  const draftLineItems = lineItems.map((line) => {
    var _a3;
    const variantId = line.variantId || ((_a3 = products.find((product) => product.sku === line.sku)) == null ? void 0 : _a3.variantId) || null;
    if (variantId) {
      return {
        variantId,
        quantity: Number(line.quantity || 0),
        customAttributes: [{
          key: "Quote ID",
          value: quote.id
        }, {
          key: "Quoted Unit Price",
          value: Number(line.price || 0).toFixed(2)
        }]
      };
    }
    return {
      title: truncateShopifyTitle(line.title),
      sku: line.sku,
      quantity: Number(line.quantity || 0),
      requiresShipping: true,
      taxable: false,
      originalUnitPriceWithCurrency: {
        amount: Number(line.price || 0).toFixed(2),
        currencyCode: "USD"
      },
      customAttributes: [{
        key: "Quote ID",
        value: quote.id
      }]
    };
  });
  const response = await admin.graphql(`#graphql
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            legacyResourceId
            invoiceUrl
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
    variables: {
      input: {
        note: [`Quote ID: ${quote.id}`, quote.summary ? `Summary: ${quote.summary}` : null, quote.description ? `Notes: ${quote.description}` : null].filter(Boolean).join("\n"),
        email: quote.customer_email || void 0,
        tags: ["custom-quote", buildQuoteTag(quote.id)],
        shippingAddress: {
          address1: quote.address1,
          address2: quote.address2 || void 0,
          city: quote.city,
          province: quote.province,
          country: quote.country,
          zip: quote.postal_code,
          phone: quote.customer_phone || void 0
        },
        lineItems: draftLineItems,
        ...remainingChargeCents > 0 ? {
          shippingLine: {
            title: truncateShopifyTitle(quote.service_name || "Quoted Delivery / Tax"),
            priceWithCurrency: {
              amount: (remainingChargeCents / 100).toFixed(2),
              currencyCode: "USD"
            }
          }
        } : {}
      }
    }
  });
  const json = await response.json();
  const payload = (_a2 = json == null ? void 0 : json.data) == null ? void 0 : _a2.draftOrderCreate;
  const userErrors = (payload == null ? void 0 : payload.userErrors) || [];
  if (userErrors.length > 0) {
    return data({
      ok: false,
      message: userErrors.map((error) => {
        var _a3;
        return ((_a3 = error.field) == null ? void 0 : _a3.length) ? `${error.field.join(".")}: ${error.message}` : error.message;
      }).join(", ")
    }, {
      status: 400
    });
  }
  const draftOrder = payload == null ? void 0 : payload.draftOrder;
  if (!(draftOrder == null ? void 0 : draftOrder.id)) {
    return data({
      ok: false,
      message: "Draft order was not created."
    }, {
      status: 500
    });
  }
  return data({
    ok: true,
    message: `Draft order ${draftOrder.name} created in Shopify.`,
    draftOrderId: draftOrder.id,
    draftOrderName: draftOrder.name,
    draftOrderInvoiceUrl: draftOrder.invoiceUrl || null,
    draftOrderAdminUrl: draftOrder.legacyResourceId ? `https://admin.shopify.com/store/${getStoreHandle(shop)}/draft_orders/${draftOrder.legacyResourceId}` : null
  });
}
const route21 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
async function action$3({
  request
}) {
  const url = new URL(request.url);
  const isEmbeddedRequest = url.pathname.startsWith("/app/");
  if (isEmbeddedRequest) {
    await authenticate.admin(request);
  } else {
    const allowed = await hasAdminQuoteAccess(request);
    if (!allowed) {
      return data({
        ok: false,
        message: "Please log in."
      }, {
        status: 401
      });
    }
  }
  const form = await request.formData();
  const quoteId = String(form.get("quoteId") || "").trim();
  if (!quoteId) {
    return data({
      ok: false,
      message: "Missing quote id."
    }, {
      status: 400
    });
  }
  const existing = await getCustomQuoteById(quoteId);
  if (!existing) {
    return data({
      ok: false,
      message: "Quote not found."
    }, {
      status: 404
    });
  }
  await deleteCustomQuote(quoteId);
  return data({
    ok: true,
    message: "Quote deleted. This action cannot be undone.",
    deletedQuoteId: quoteId
  });
}
const route22 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
const route19 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7
}, Symbol.toStringTag, { value: "Module" }));
const route20 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6
}, Symbol.toStringTag, { value: "Module" }));
function toVariantGid(variant) {
  if (variant == null ? void 0 : variant.admin_graphql_api_id) return String(variant.admin_graphql_api_id);
  if ((variant == null ? void 0 : variant.id) === null || (variant == null ? void 0 : variant.id) === void 0) return "";
  return `gid://shopify/ProductVariant/${variant.id}`;
}
async function action$2({
  request
}) {
  var _a2, _b;
  const {
    topic,
    shop,
    payload
  } = await authenticate.webhook(request);
  if (topic !== "PRODUCTS_UPDATE") {
    return new Response();
  }
  const product = payload;
  const options = [];
  for (const variant of product.variants || []) {
    if (!variant.sku) continue;
    const variantTitle = String(variant.title || "").trim();
    const title = variantTitle && variantTitle !== "Default Title" ? `${product.title} - ${variantTitle}` : product.title;
    options.push({
      sku: variant.sku,
      variantId: toVariantGid(variant),
      title,
      vendor: product.vendor,
      imageUrl: ((_a2 = variant.image) == null ? void 0 : _a2.src) || ((_b = product.image) == null ? void 0 : _b.src) || "",
      price: variant.price === null || variant.price === void 0 ? void 0 : Number(variant.price)
    });
  }
  await syncProductOptionsToSupabase(options);
  console.log("[WEBHOOK SYNC]", shop, product.title);
  return new Response();
}
const route23 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2
}, Symbol.toStringTag, { value: "Module" }));
const action$1 = async ({
  request
}) => {
  const {
    payload,
    session,
    topic,
    shop
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    await prisma.session.update({
      where: {
        id: session.id
      },
      data: {
        scope: current.toString()
      }
    });
  }
  return new Response();
};
const route24 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1
}, Symbol.toStringTag, { value: "Module" }));
const action = async ({
  request
}) => {
  const {
    shop,
    session,
    topic
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await prisma.session.deleteMany({
      where: {
        shop
      }
    });
  }
  return new Response();
};
const route25 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-Hi1v893O.js", "imports": ["/assets/jsx-runtime-_y2a4OCT.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/root-DJaHMJOf.js", "imports": ["/assets/jsx-runtime-_y2a4OCT.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index/route": { "id": "routes/_index/route", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-CBBVwP4O.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/custom-quote": { "id": "routes/custom-quote", "parentId": "root", "path": "custom-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/custom-quote-BBvYybaA.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/quote-review": { "id": "routes/quote-review", "parentId": "root", "path": "quote-review", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/quote-review-Cw3CHYAj.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/mobile-dashboard": { "id": "routes/mobile-dashboard", "parentId": "root", "path": "mobile", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/mobile-dashboard-DjfyQuDh.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login/route": { "id": "routes/auth.login/route", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-CfMXwAFC.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/auth._-jWRsTZ3_.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": true, "module": "/assets/app-BStmncMF.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app._index-GC_ws-sp.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.admin": { "id": "routes/app.admin", "parentId": "routes/app", "path": "admin", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.admin-BjiBp67i.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.additional-C3SA_ndc.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.custom-quote": { "id": "routes/app.custom-quote", "parentId": "routes/app", "path": "custom-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.custom-quote-CGTmv83-.js", "imports": ["/assets/custom-quote-BBvYybaA.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.quote-review": { "id": "routes/app.quote-review", "parentId": "routes/app", "path": "quote-review", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.quote-review-D6TSjud4.js", "imports": ["/assets/quote-review-Cw3CHYAj.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.mobile": { "id": "routes/app.mobile", "parentId": "routes/app", "path": "mobile", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.mobile-OhaY0_o9.js", "imports": ["/assets/mobile-dashboard-DjfyQuDh.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.shipping-estimate": { "id": "routes/api.shipping-estimate", "parentId": "root", "path": "api/shipping-estimate", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.shipping-estimate-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.carrier-service": { "id": "routes/api.carrier-service", "parentId": "root", "path": "api/carrier-service", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.carrier-service-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.sync-products": { "id": "routes/api.sync-products", "parentId": "root", "path": "api/sync-products", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.sync-products-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.create-draft-order": { "id": "routes/api.create-draft-order", "parentId": "root", "path": "api/create-draft-order", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.create-draft-order-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.delete-quote": { "id": "routes/api.delete-quote", "parentId": "root", "path": "api/delete-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.delete-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.shipping-estimate": { "id": "routes/app.api.shipping-estimate", "parentId": "root", "path": "app/api/shipping-estimate", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.shipping-estimate-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.carrier-service": { "id": "routes/app.api.carrier-service", "parentId": "root", "path": "app/api/carrier-service", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.carrier-service-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.create-draft-order": { "id": "routes/app.api.create-draft-order", "parentId": "root", "path": "app/api/create-draft-order", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.create-draft-order-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.delete-quote": { "id": "routes/app.api.delete-quote", "parentId": "root", "path": "app/api/delete-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.delete-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.products.update": { "id": "routes/webhooks.products.update", "parentId": "root", "path": "webhooks/products/update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.products.update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-66c2a01c.js", "version": "66c2a01c", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "unstable_passThroughRequests": false, "unstable_subResourceIntegrity": false, "unstable_trailingSlashAwareDataRequests": false, "unstable_previewServerPrerendering": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/_index/route": {
    id: "routes/_index/route",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route1
  },
  "routes/custom-quote": {
    id: "routes/custom-quote",
    parentId: "root",
    path: "custom-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/quote-review": {
    id: "routes/quote-review",
    parentId: "root",
    path: "quote-review",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/mobile-dashboard": {
    id: "routes/mobile-dashboard",
    parentId: "root",
    path: "mobile",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/auth.login/route": {
    id: "routes/auth.login/route",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route8
  },
  "routes/app.admin": {
    id: "routes/app.admin",
    parentId: "routes/app",
    path: "admin",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/app.custom-quote": {
    id: "routes/app.custom-quote",
    parentId: "routes/app",
    path: "custom-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/app.quote-review": {
    id: "routes/app.quote-review",
    parentId: "routes/app",
    path: "quote-review",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/app.mobile": {
    id: "routes/app.mobile",
    parentId: "routes/app",
    path: "mobile",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/api.shipping-estimate": {
    id: "routes/api.shipping-estimate",
    parentId: "root",
    path: "api/shipping-estimate",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/api.carrier-service": {
    id: "routes/api.carrier-service",
    parentId: "root",
    path: "api/carrier-service",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/api.sync-products": {
    id: "routes/api.sync-products",
    parentId: "root",
    path: "api/sync-products",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/api.create-draft-order": {
    id: "routes/api.create-draft-order",
    parentId: "root",
    path: "api/create-draft-order",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  },
  "routes/api.delete-quote": {
    id: "routes/api.delete-quote",
    parentId: "root",
    path: "api/delete-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route18
  },
  "routes/app.api.shipping-estimate": {
    id: "routes/app.api.shipping-estimate",
    parentId: "root",
    path: "app/api/shipping-estimate",
    index: void 0,
    caseSensitive: void 0,
    module: route19
  },
  "routes/app.api.carrier-service": {
    id: "routes/app.api.carrier-service",
    parentId: "root",
    path: "app/api/carrier-service",
    index: void 0,
    caseSensitive: void 0,
    module: route20
  },
  "routes/app.api.create-draft-order": {
    id: "routes/app.api.create-draft-order",
    parentId: "root",
    path: "app/api/create-draft-order",
    index: void 0,
    caseSensitive: void 0,
    module: route21
  },
  "routes/app.api.delete-quote": {
    id: "routes/app.api.delete-quote",
    parentId: "root",
    path: "app/api/delete-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route22
  },
  "routes/webhooks.products.update": {
    id: "routes/webhooks.products.update",
    parentId: "root",
    path: "webhooks/products/update",
    index: void 0,
    caseSensitive: void 0,
    module: route23
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route24
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route25
  }
};
const allowedActionOrigins = false;
export {
  allowedActionOrigins,
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
