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
  const { data: existingRows, error: existingError } = await supabaseAdmin.from("product_source_map").select("sku, variant_id, product_title, pickup_vendor, image_url, unit_label, price").in("sku", skus);
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
      unit_label: product.unitLabel || (existing == null ? void 0 : existing.unit_label) || null,
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
  var _a2, _b, _c, _d, _e, _f, _g;
  const response = await admin.graphql(`
    query SyncProductsForQuotes {
      products(first: 100, sortKey: TITLE) {
        nodes {
          title
          vendor
          metafield(namespace: "green_hills", key: "price_unit_label") {
            value
          }
          legacyUnitLabel: metafield(namespace: "$app", key: "price_unit_label") {
            value
          }
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
    const unitLabel = ((_d = product == null ? void 0 : product.metafield) == null ? void 0 : _d.value) || ((_e = product == null ? void 0 : product.legacyUnitLabel) == null ? void 0 : _e.value) || "";
    for (const variant of ((_f = product == null ? void 0 : product.variants) == null ? void 0 : _f.nodes) || []) {
      const sku = ((variant == null ? void 0 : variant.sku) || "").trim();
      if (!sku) continue;
      const variantTitle = ((variant == null ? void 0 : variant.title) || "").trim();
      const title = variantTitle && variantTitle !== "Default Title" ? `${productTitle} - ${variantTitle}` : productTitle;
      options.push({
        sku,
        variantId: (variant == null ? void 0 : variant.id) || "",
        title,
        vendor,
        imageUrl: ((_g = variant == null ? void 0 : variant.image) == null ? void 0 : _g.url) || productImage || "",
        unitLabel,
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
async function loader$9({
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
  loader: loader$9
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
async function updateCustomQuote(id, input) {
  const { data: data2, error } = await supabaseAdmin.from("custom_delivery_quotes").update({
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
    shipping_details: null,
    description: input.description || null,
    eta: input.eta || null,
    summary: input.summary || null,
    source_breakdown: input.sourceBreakdown,
    line_items: input.lineItems
  }).eq("id", id).select("*").single();
  if (error) {
    console.error("[UPDATE CUSTOM QUOTE ERROR]", error);
    throw error;
  }
  return data2;
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
    let route30 = "";
    let locality = "";
    let administrativeArea = "";
    let zip = "";
    let countryCode = "US";
    for (const component of components) {
      const types = component.types || [];
      if (types.includes("street_number")) streetNumber = component.long_name || "";
      if (types.includes("route")) route30 = component.long_name || "";
      if (types.includes("locality")) locality = component.long_name || "";
      if (types.includes("administrative_area_level_1")) {
        administrativeArea = component.short_name || component.long_name || "";
      }
      if (types.includes("postal_code")) zip = component.long_name || "";
      if (types.includes("country")) {
        countryCode = component.short_name || component.long_name || "US";
      }
    }
    address1.value = [streetNumber, route30].filter(Boolean).join(" ").trim();
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
  if (cachedValue !== null) {
    return { matrix: cachedValue };
  }
  const mapsUrl = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  mapsUrl.searchParams.set("origins", origins.join("|"));
  mapsUrl.searchParams.set("destinations", destinations.join("|"));
  mapsUrl.searchParams.set("key", googleMapsApiKey);
  mapsUrl.searchParams.set("units", "imperial");
  let data2;
  try {
    const res = await fetch(mapsUrl.toString());
    data2 = await res.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    console.error("[DISTANCE MATRIX ERROR]", message);
    return { matrix: null, error: message };
  }
  if (data2.status !== "OK" || !data2.rows) {
    const message = [data2.status, data2.error_message].filter(Boolean).join(": ");
    console.error("[DISTANCE MATRIX ERROR]", message || "Unknown Google response");
    distanceMatrixCache.set(cacheKey, setCache(null, TTL_SHORT));
    return { matrix: null, error: message || "Unknown Google response" };
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
  return { matrix };
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
  const ratePerMinute = typeof input.ratePerMinute === "number" && Number.isFinite(input.ratePerMinute) && input.ratePerMinute > 0 ? input.ratePerMinute : RATE_PER_MINUTE;
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
  const distanceMatrixResult = await getDistanceMatrix(
    origins,
    destinations,
    googleMapsApiKey
  );
  const matrix = distanceMatrixResult.matrix;
  if (!matrix) {
    return {
      serviceName: "Delivery Unavailable",
      serviceCode: "CUSTOM_DELIVERY",
      cents: 0,
      description: distanceMatrixResult.error ? `Unable to calculate delivery route (${distanceMatrixResult.error})` : "Unable to calculate delivery route",
      eta: "Unavailable",
      summary: distanceMatrixResult.error ? `Unable to calculate delivery route (${distanceMatrixResult.error})` : "Unable to calculate delivery route"
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
    let groupCostDollars = totalLoopMinutes * ratePerMinute * trucksForGroup;
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
      let fallbackDollars = (yardToCustomer.minutes + customerToYard.minutes) * ratePerMinute;
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
  const baseUnit = String(unitLabel || "").trim().replace(/^per\s+/i, "").trim();
  const normalizedUnit = baseUnit && quantity !== 1 && !baseUnit.toLowerCase().endsWith("s") ? `${baseUnit}S` : baseUnit;
  return normalizedUnit ? `${normalizedQuantity} ${normalizedUnit}` : `Qty ${normalizedQuantity}`;
}
function getBrowserGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_BROWSER_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
}
async function loader$8({
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
    googleMapsApiKey: getBrowserGoogleMapsApiKey()
  });
}
async function action$f({
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
        googleMapsApiKey: getBrowserGoogleMapsApiKey()
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
      googleMapsApiKey: getBrowserGoogleMapsApiKey()
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
      googleMapsApiKey: getBrowserGoogleMapsApiKey()
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
  const customRatePerMinuteInput = String(form.get("customRatePerMinute") || "").trim();
  const customTaxRateInput = String(form.get("customTaxRate") || "").trim();
  const customNotes = String(form.get("customNotes") || "").trim();
  const customShippingQuantityInput = String(form.get("customShippingQuantity") || "").trim();
  const customShippingUnit = String(form.get("customShippingUnit") || "miles").trim() === "hours" ? "hours" : "miles";
  const customShippingRateInput = String(form.get("customShippingRate") || "").trim();
  const customDeliveryAmountValue = Number(customDeliveryAmountInput);
  const customRatePerMinuteValue = Number(customRatePerMinuteInput);
  const customTaxRateValue = Number(customTaxRateInput);
  const customShippingQuantityValue = Number(customShippingQuantityInput);
  const customShippingRateValue = Number(customShippingRateInput);
  const hasCustomShippingCalculation = quoteAudience === "custom" && customShippingQuantityInput !== "" && customShippingRateInput !== "" && Number.isFinite(customShippingQuantityValue) && Number.isFinite(customShippingRateValue);
  const customRatePerMinute = quoteAudience === "custom" && customRatePerMinuteInput !== "" && Number.isFinite(customRatePerMinuteValue) && customRatePerMinuteValue > 0 ? customRatePerMinuteValue : void 0;
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
      customRatePerMinute: customRatePerMinuteInput,
      customTaxRate: customTaxRateInput,
      customShippingQuantity: customShippingQuantityInput,
      customShippingUnit,
      customShippingRate: customShippingRateInput,
      customNotes,
      googleMapsApiKey: getBrowserGoogleMapsApiKey()
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
      customRatePerMinute: customRatePerMinuteInput,
      customTaxRate: customTaxRateInput,
      customShippingQuantity: customShippingQuantityInput,
      customShippingUnit,
      customShippingRate: customShippingRateInput,
      customNotes,
      googleMapsApiKey: getBrowserGoogleMapsApiKey()
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
    ratePerMinute: customRatePerMinute,
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
    googleMapsApiKey: getBrowserGoogleMapsApiKey(),
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
    customRatePerMinute: customRatePerMinuteInput,
    customTaxRate: customTaxRateInput,
    customShippingQuantity: customShippingQuantityInput,
    customShippingUnit,
    customShippingRate: customShippingRateInput,
    shippingCalculationText,
    customNotes
  });
}
const styles$3 = {
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
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
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
    return [linesText, `Delivery Fee: $${Number(actionData.pricing.deliveryAmount).toFixed(2)}`, `Tax: $${Number(actionData.pricing.taxAmount).toFixed(2)}`, `Total: $${Number(actionData.pricing.totalAmount).toFixed(2)}`, "", "Please let us know if you have any questions or would like to proceed with your order."].filter(Boolean).join("\n");
  }, [actionData]);
  const selectedHistoryQuote = useMemo(() => recentQuotes.find((quote) => quote.id === selectedHistoryQuoteId) || null, [recentQuotes, selectedHistoryQuoteId]);
  const mobileActionButtonStyle = {
    ...styles$3.buttonGhost,
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
    gridTemplateColumns: "repeat(4, 1fr)",
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
      style: styles$3.page,
      children: /* @__PURE__ */ jsx("div", {
        style: {
          ...styles$3.shell,
          maxWidth: "520px"
        },
        children: /* @__PURE__ */ jsxs("div", {
          style: styles$3.card,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$3.title,
            children: "Custom Quote Portal"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$3.subtitle,
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
              style: styles$3.label,
              children: "Admin Password"
            }), /* @__PURE__ */ jsx("input", {
              type: "password",
              name: "password",
              autoComplete: "current-password",
              style: styles$3.input
            }), (actionData == null ? void 0 : actionData.loginError) ? /* @__PURE__ */ jsx("div", {
              style: styles$3.statusErr,
              children: actionData.loginError
            }) : null, /* @__PURE__ */ jsx("button", {
              type: "submit",
              style: {
                ...styles$3.buttonPrimary,
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
      ...styles$3.page,
      padding: isMobile ? "20px 14px 120px" : styles$3.page.padding,
      overflowX: "clip"
    },
    children: [/* @__PURE__ */ jsxs("div", {
      style: styles$3.shell,
      children: [isMobile ? /* @__PURE__ */ jsxs("div", {
        style: {
          marginBottom: 18
        },
        children: [/* @__PURE__ */ jsx("h1", {
          style: {
            ...styles$3.title,
            fontSize: "28px"
          },
          children: "Custom Quote Tool"
        }), /* @__PURE__ */ jsx("div", {
          style: styles$3.subtitle,
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
        style: styles$3.hero,
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$3.title,
            children: "Custom Quote Tool"
          }), /* @__PURE__ */ jsx("div", {
            style: styles$3.subtitle,
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
            style: styles$3.logout,
            children: "Dashboard"
          }), /* @__PURE__ */ jsx("a", {
            href: dispatchHref,
            style: styles$3.logout,
            children: "Dispatch"
          }), /* @__PURE__ */ jsx("a", {
            href: quoteReviewHref,
            style: styles$3.logout,
            children: "Review Quotes"
          }), /* @__PURE__ */ jsx("a", {
            href: logoutHref,
            style: styles$3.logout,
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
            ...styles$3.card,
            padding: isMobile ? "18px" : styles$3.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$3.sectionTitle,
            children: "Quote Type"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$3.sectionSub,
            children: "Switch between standard customer pricing and contractor tier pricing."
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$3.tabRow,
            children: [/* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setQuoteAudience("customer"),
              style: {
                ...styles$3.tabButton,
                minHeight: isMobile ? 46 : void 0,
                flex: isMobile ? "1 1 110px" : void 0,
                textAlign: "center",
                ...quoteAudience === "customer" ? styles$3.tabButtonActive : {}
              },
              children: "Customer"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setQuoteAudience("contractor"),
              style: {
                ...styles$3.tabButton,
                minHeight: isMobile ? 46 : void 0,
                flex: isMobile ? "1 1 110px" : void 0,
                textAlign: "center",
                ...quoteAudience === "contractor" ? styles$3.tabButtonActive : {}
              },
              children: "Contractor"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setQuoteAudience("custom"),
              style: {
                ...styles$3.tabButton,
                minHeight: isMobile ? 46 : void 0,
                flex: isMobile ? "1 1 110px" : void 0,
                textAlign: "center",
                ...quoteAudience === "custom" ? styles$3.tabButtonActive : {}
              },
              children: "Custom"
            })]
          }), quoteAudience === "contractor" ? /* @__PURE__ */ jsxs("div", {
            style: {
              maxWidth: 280
            },
            children: [/* @__PURE__ */ jsx("label", {
              style: styles$3.label,
              children: "Contractor Tier"
            }), /* @__PURE__ */ jsxs("select", {
              name: "contractorTierUi",
              value: contractorTier,
              onChange: (e) => setContractorTier(normalizeContractorTier(e.target.value)),
              style: styles$3.input,
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
            ...styles$3.card,
            padding: isMobile ? "18px" : styles$3.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$3.sectionTitle,
            children: "Customer & Delivery Address"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$3.sectionSub,
            children: "Start typing the street address and choose a suggestion."
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              display: "grid",
              gap: "14px"
            },
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$3.label,
                children: "Customer Name"
              }), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "customerName",
                autoComplete: "name",
                defaultValue: (actionData == null ? void 0 : actionData.customerName) || "",
                style: styles$3.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$3.label,
                children: "Email Address"
              }), /* @__PURE__ */ jsx("input", {
                type: "email",
                name: "customerEmail",
                autoComplete: "email",
                defaultValue: (actionData == null ? void 0 : actionData.customerEmail) || "",
                style: styles$3.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$3.label,
                children: "Phone Number"
              }), /* @__PURE__ */ jsx("input", {
                type: "tel",
                name: "customerPhone",
                autoComplete: "tel",
                defaultValue: (actionData == null ? void 0 : actionData.customerPhone) || "",
                style: styles$3.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$3.label,
                children: "Address 1"
              }), /* @__PURE__ */ jsx("input", {
                id: "quote-address1",
                type: "text",
                name: "address1",
                autoComplete: "street-address",
                defaultValue: ((_a2 = actionData == null ? void 0 : actionData.address) == null ? void 0 : _a2.address1) || "",
                style: styles$3.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$3.label,
                children: "Address 2"
              }), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "address2",
                autoComplete: "address-line2",
                defaultValue: ((_b = actionData == null ? void 0 : actionData.address) == null ? void 0 : _b.address2) || "",
                style: styles$3.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "1.3fr 0.8fr 0.8fr 0.8fr",
                gap: "14px"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$3.label,
                  children: "City"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-city",
                  type: "text",
                  name: "city",
                  autoComplete: "address-level2",
                  defaultValue: ((_c = actionData == null ? void 0 : actionData.address) == null ? void 0 : _c.city) || "",
                  style: styles$3.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$3.label,
                  children: "State"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-province",
                  type: "text",
                  name: "province",
                  autoComplete: "address-level1",
                  defaultValue: ((_d = actionData == null ? void 0 : actionData.address) == null ? void 0 : _d.province) || "WI",
                  style: styles$3.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$3.label,
                  children: "ZIP"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-postalCode",
                  type: "text",
                  name: "postalCode",
                  autoComplete: "postal-code",
                  defaultValue: ((_e = actionData == null ? void 0 : actionData.address) == null ? void 0 : _e.postalCode) || "",
                  style: styles$3.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$3.label,
                  children: "Country"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-country",
                  type: "text",
                  name: "country",
                  autoComplete: "country-name",
                  defaultValue: ((_f = actionData == null ? void 0 : actionData.address) == null ? void 0 : _f.country) || "US",
                  style: styles$3.input
                })]
              })]
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            ...styles$3.card,
            padding: isMobile ? "18px" : styles$3.card.padding
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
                style: styles$3.sectionTitle,
                children: "Quote Lines"
              }), /* @__PURE__ */ jsx("p", {
                style: styles$3.sectionSub,
                children: "Search by product, SKU, or vendor. Click a result to select it."
              })]
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: addLine,
              style: styles$3.buttonGhost,
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
                      style: styles$3.label,
                      children: "Search Product"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "text",
                      value: line.search,
                      onChange: (e) => updateLine(index, {
                        search: e.target.value,
                        sku: ""
                      }),
                      placeholder: "Type product name, SKU, or vendor",
                      style: styles$3.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$3.label,
                      children: "Quantity"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "number",
                      min: "0",
                      step: "1",
                      value: line.quantity,
                      onChange: (e) => updateLine(index, {
                        quantity: e.target.value
                      }),
                      style: styles$3.input
                    })]
                  }), /* @__PURE__ */ jsx("button", {
                    type: "button",
                    onClick: () => removeLine(index),
                    disabled: lines.length === 1,
                    style: {
                      ...styles$3.buttonGhost,
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
                      style: styles$3.label,
                      children: "Custom Line Title"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "text",
                      value: line.customTitle || "",
                      onChange: (e) => updateLine(index, {
                        customTitle: e.target.value
                      }),
                      placeholder: selectedProduct.title,
                      style: styles$3.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$3.label,
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
                      style: styles$3.input
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
            ...styles$3.card,
            padding: isMobile ? "18px" : styles$3.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$3.sectionTitle,
            children: "Custom Adjustments"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$3.sectionSub,
            children: "Override delivery, minute charge, tax, and the customer-facing quote details before calculating or saving."
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              display: "grid",
              gap: "14px"
            },
            children: [/* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "180px 180px 180px",
                gap: "14px"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$3.label,
                  children: "Delivery Amount"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customDeliveryAmount",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customDeliveryAmount) || "",
                  placeholder: "Use calculated delivery",
                  style: styles$3.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$3.label,
                  children: "Minute Charge"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customRatePerMinute",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customRatePerMinute) || "",
                  placeholder: "Default 2.08",
                  style: styles$3.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$3.label,
                  children: "Tax Rate"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customTaxRate",
                  min: "0",
                  step: "0.0001",
                  defaultValue: (actionData == null ? void 0 : actionData.customTaxRate) || "",
                  placeholder: "Example: 0.055",
                  style: styles$3.input
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
                  style: styles$3.label,
                  children: "Shipping Qty"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customShippingQuantity",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customShippingQuantity) || "",
                  placeholder: "Miles or hours",
                  style: styles$3.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$3.label,
                  children: "Shipping Unit"
                }), /* @__PURE__ */ jsxs("select", {
                  name: "customShippingUnit",
                  defaultValue: (actionData == null ? void 0 : actionData.customShippingUnit) || "miles",
                  style: styles$3.input,
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
                  style: styles$3.label,
                  children: "Price Per Unit"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customShippingRate",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customShippingRate) || "",
                  placeholder: "Rate per mile/hour",
                  style: styles$3.input
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
                style: styles$3.label,
                children: "Notes"
              }), /* @__PURE__ */ jsx("textarea", {
                name: "customNotes",
                defaultValue: (actionData == null ? void 0 : actionData.customNotes) || "",
                placeholder: "Use calculated notes",
                style: {
                  ...styles$3.input,
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
              ...styles$3.buttonPrimary,
              width: isMobile ? "100%" : void 0,
              minHeight: isMobile ? 50 : void 0
            },
            children: isSubmitting ? "Calculating..." : "Get Full Quote"
          }), /* @__PURE__ */ jsx("button", {
            type: "submit",
            name: "intent",
            value: "save",
            style: {
              ...styles$3.buttonSecondary,
              width: isMobile ? "100%" : void 0,
              minHeight: isMobile ? 50 : void 0
            },
            children: isSubmitting ? "Saving..." : "Save Quote"
          })]
        })]
      }), (actionData == null ? void 0 : actionData.message) ? /* @__PURE__ */ jsx("div", {
        style: {
          ...actionData.ok ? styles$3.statusOk : styles$3.statusErr,
          fontSize: isMobile ? 16 : void 0,
          fontWeight: isMobile ? 700 : void 0
        },
        children: actionData.message
      }) : null, (actionData == null ? void 0 : actionData.savedQuoteId) ? /* @__PURE__ */ jsxs("div", {
        style: {
          ...styles$3.statusOk,
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
            ...styles$3.card,
            padding: isMobile ? "18px" : styles$3.card.padding
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
                ...styles$3.sectionTitle,
                margin: 0
              },
              children: "Full Quote Result"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: copyQuote,
              style: styles$3.buttonGhost,
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
            ...styles$3.card,
            padding: isMobile ? "18px" : styles$3.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$3.sectionTitle,
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
          ...styles$3.card,
          marginTop: 24,
          padding: isMobile ? "18px" : styles$3.card.padding
        },
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles$3.sectionTitle,
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
          ...styles$3.card,
          marginTop: 24,
          padding: isMobile ? "18px" : styles$3.card.padding
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
                ...styles$3.sectionTitle,
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
            style: styles$3.buttonPrimary,
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
            ...draftOrderFetcher.data.ok ? styles$3.statusOk : styles$3.statusErr,
            fontSize: isMobile ? 16 : void 0,
            fontWeight: isMobile ? 700 : void 0
          },
          children: draftOrderFetcher.data.message
        }) : null, ((_k = deleteQuoteFetcher.data) == null ? void 0 : _k.message) ? /* @__PURE__ */ jsx("div", {
          style: {
            ...deleteQuoteFetcher.data.ok ? styles$3.statusOk : styles$3.statusErr,
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
      }), /* @__PURE__ */ jsxs("a", {
        href: dispatchHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "X"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dispatch"
        })]
      })]
    }) : null]
  });
});
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$f,
  default: customQuote,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
function formatMoney$1(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}
function buildQuoteSearchText(quote) {
  const lineText = (quote.line_items || []).map((line) => [line.title, line.sku, line.vendor, line.pricingLabel, line.audience, line.contractorTier].filter(Boolean).join(" ")).join(" ");
  const sourceText = Array.isArray(quote.source_breakdown) ? quote.source_breakdown.map((entry2) => [entry2 == null ? void 0 : entry2.vendor, ...Array.isArray(entry2 == null ? void 0 : entry2.items) ? entry2.items : []].filter(Boolean).join(" ")).join(" ") : "";
  return [quote.id, quote.customer_name, quote.customer_email, quote.customer_phone, quote.address1, quote.address2, quote.city, quote.province, quote.postal_code, quote.country, quote.service_name, quote.shipping_details, quote.description, quote.summary, quote.eta, lineText, sourceText].filter(Boolean).join(" ").toLowerCase();
}
const styles$2 = {
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
async function loader$7({
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
async function action$e({
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
  var _a2, _b, _c, _d, _e, _f;
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const location = useLocation();
  const draftOrderFetcher = useFetcher();
  const deleteQuoteFetcher = useFetcher();
  const updateQuoteFetcher = useFetcher();
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const urlParams = new URLSearchParams(location.search);
  const requestedQuoteId = urlParams.get("quote");
  const allowed = (actionData == null ? void 0 : actionData.allowed) ?? loaderData.allowed;
  const rawQuotes = (actionData == null ? void 0 : actionData.quotes) || loaderData.quotes || [];
  const [editedQuotesById, setEditedQuotesById] = useState({});
  const quotes = rawQuotes.map((quote) => editedQuotesById[quote.id] || quote);
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
  const updateQuoteAction = isEmbeddedRoute ? `/app/api/update-quote${location.search || ""}` : `/api/update-quote${location.search || ""}`;
  const quoteToolHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const mobileDashboardHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const [editingQuoteId, setEditingQuoteId] = useState(null);
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
    ...styles$2.buttonGhost,
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
    gridTemplateColumns: "repeat(4, 1fr)",
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
    var _a3, _b2;
    if (((_a3 = updateQuoteFetcher.data) == null ? void 0 : _a3.ok) && ((_b2 = updateQuoteFetcher.data) == null ? void 0 : _b2.quote)) {
      const quote = updateQuoteFetcher.data.quote;
      setEditedQuotesById((current) => ({
        ...current,
        [quote.id]: quote
      }));
      setSelectedQuoteId(quote.id);
      setEditingQuoteId(null);
    }
  }, [updateQuoteFetcher.data]);
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
        ...styles$2.page,
        padding: isMobile ? "20px 14px 40px" : styles$2.page.padding
      },
      children: /* @__PURE__ */ jsx("div", {
        style: {
          ...styles$2.shell,
          maxWidth: 520
        },
        children: /* @__PURE__ */ jsxs("div", {
          style: styles$2.card,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$2.title,
            children: "Quote Review"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$2.subtitle,
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
            fontSize: "2.2rem"
          },
          children: "Quote Review"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$2.subtitle,
          children: "Search across customer info, address, notes, SKU, product titles, vendors, and saved quote details."
        })]
      }) : /* @__PURE__ */ jsx("div", {
        style: styles$2.card,
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
              style: styles$2.title,
              children: "Quote Review"
            }), /* @__PURE__ */ jsx("p", {
              style: styles$2.subtitle,
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
              style: styles$2.buttonGhost,
              children: "Dashboard"
            }), /* @__PURE__ */ jsx("a", {
              href: quoteToolHref,
              style: styles$2.buttonGhost,
              children: "Open Quote Tool"
            }), /* @__PURE__ */ jsx("a", {
              href: dispatchHref,
              style: styles$2.buttonGhost,
              children: "Dispatch"
            }), /* @__PURE__ */ jsx("a", {
              href: "?logout=1",
              style: styles$2.buttonGhost,
              children: "Log Out"
            })]
          })]
        })
      }), /* @__PURE__ */ jsxs("div", {
        style: {
          ...styles$2.card,
          display: "grid",
          gap: 14,
          padding: isMobile ? "18px" : styles$2.card.padding
        },
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("label", {
            style: styles$2.label,
            children: "Search Saved Quotes"
          }), /* @__PURE__ */ jsx("input", {
            type: "search",
            value: query,
            onChange: (event) => setQuery(event.target.value),
            placeholder: "Search by customer, email, city, ZIP, summary, SKU, vendor, quote ID...",
            style: styles$2.input
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
            ...styles$2.card,
            maxHeight: isMobile ? "none" : "70vh",
            overflowY: isMobile ? "visible" : "auto",
            padding: isMobile ? "18px" : styles$2.card.padding
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
            ...styles$2.card,
            padding: isMobile ? "18px" : styles$2.card.padding
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
                      ...styles$2.buttonPrimary,
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
                }), /* @__PURE__ */ jsx("button", {
                  type: "button",
                  onClick: () => setEditingQuoteId((current) => current === selectedQuote.id ? null : selectedQuote.id),
                  style: mobileActionButtonStyle,
                  children: editingQuoteId === selectedQuote.id ? "Cancel Regenerate" : "Edit / Regenerate"
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
                ...draftOrderFetcher.data.ok ? styles$2.statusOk : styles$2.statusErr,
                fontSize: isMobile ? 16 : void 0,
                fontWeight: isMobile ? 700 : void 0
              },
              children: draftOrderFetcher.data.message
            }) : null, ((_e = deleteQuoteFetcher.data) == null ? void 0 : _e.message) ? /* @__PURE__ */ jsx("div", {
              style: {
                ...deleteQuoteFetcher.data.ok ? styles$2.statusOk : styles$2.statusErr,
                fontSize: isMobile ? 16 : void 0,
                fontWeight: isMobile ? 700 : void 0
              },
              children: deleteQuoteFetcher.data.message
            }) : null, ((_f = updateQuoteFetcher.data) == null ? void 0 : _f.message) ? /* @__PURE__ */ jsx("div", {
              style: {
                ...updateQuoteFetcher.data.ok ? styles$2.statusOk : styles$2.statusErr,
                fontSize: isMobile ? 16 : void 0,
                fontWeight: isMobile ? 700 : void 0
              },
              children: updateQuoteFetcher.data.message
            }) : null, editingQuoteId === selectedQuote.id ? /* @__PURE__ */ jsxs(updateQuoteFetcher.Form, {
              method: "post",
              action: updateQuoteAction,
              style: {
                marginTop: 20,
                display: "grid",
                gap: 16,
                padding: 16,
                borderRadius: 18,
                border: "1px solid rgba(45, 212, 191, 0.35)",
                background: "rgba(20, 184, 166, 0.08)"
              },
              children: [/* @__PURE__ */ jsx("input", {
                type: "hidden",
                name: "quoteId",
                value: selectedQuote.id
              }), /* @__PURE__ */ jsx("h3", {
                style: {
                  margin: 0
                },
                children: "Edit And Regenerate Quote"
              }), /* @__PURE__ */ jsx("div", {
                style: {
                  color: "#93c5fd",
                  fontSize: 13,
                  lineHeight: 1.5
                },
                children: "Updating quantities or address will recalculate delivery, truck-load logic, tax, and the saved total."
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  display: "grid",
                  gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))",
                  gap: 12
                },
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$2.label,
                    children: "Customer Name"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "customerName",
                    defaultValue: selectedQuote.customer_name || "",
                    style: styles$2.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$2.label,
                    children: "Email"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "customerEmail",
                    defaultValue: selectedQuote.customer_email || "",
                    style: styles$2.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$2.label,
                    children: "Phone"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "customerPhone",
                    defaultValue: selectedQuote.customer_phone || "",
                    style: styles$2.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  display: "grid",
                  gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1.4fr 0.9fr 0.5fr 0.5fr 0.5fr",
                  gap: 12
                },
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$2.label,
                    children: "Address 1"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "address1",
                    defaultValue: selectedQuote.address1 || "",
                    style: styles$2.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$2.label,
                    children: "City"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "city",
                    defaultValue: selectedQuote.city || "",
                    style: styles$2.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$2.label,
                    children: "State"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "province",
                    defaultValue: selectedQuote.province || "",
                    style: styles$2.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$2.label,
                    children: "ZIP"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "postalCode",
                    defaultValue: selectedQuote.postal_code || "",
                    style: styles$2.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$2.label,
                    children: "Country"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "country",
                    defaultValue: selectedQuote.country || "US",
                    style: styles$2.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$2.label,
                  children: "Address 2"
                }), /* @__PURE__ */ jsx("input", {
                  name: "address2",
                  defaultValue: selectedQuote.address2 || "",
                  style: styles$2.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  display: "grid",
                  gap: 10
                },
                children: [/* @__PURE__ */ jsx("h4", {
                  style: {
                    margin: 0
                  },
                  children: "Line Quantities"
                }), (selectedQuote.line_items || []).map((line, index) => /* @__PURE__ */ jsxs("div", {
                  style: {
                    display: "grid",
                    gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 130px",
                    gap: 12,
                    alignItems: "end",
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(51, 65, 85, 0.9)",
                    background: "rgba(2, 6, 23, 0.42)"
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    style: {
                      overflowWrap: "anywhere"
                    },
                    children: [/* @__PURE__ */ jsx("div", {
                      style: {
                        fontWeight: 800
                      },
                      children: line.title
                    }), /* @__PURE__ */ jsxs("div", {
                      style: {
                        color: "#94a3b8",
                        marginTop: 4,
                        fontSize: 13
                      },
                      children: [line.sku, " · Unit $", Number(line.price || 0).toFixed(2)]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$2.label,
                      children: "Quantity"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      name: `lineQuantity::${index}`,
                      defaultValue: line.quantity,
                      style: styles$2.input
                    })]
                  })]
                }, `${line.sku}-${index}`))]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap"
                },
                children: [/* @__PURE__ */ jsx("button", {
                  type: "submit",
                  style: styles$2.buttonPrimary,
                  children: updateQuoteFetcher.state === "submitting" ? "Regenerating..." : "Regenerate Quote"
                }), /* @__PURE__ */ jsx("button", {
                  type: "button",
                  onClick: () => setEditingQuoteId(null),
                  style: styles$2.buttonGhost,
                  children: "Cancel"
                })]
              })]
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
      }), /* @__PURE__ */ jsxs("a", {
        href: dispatchHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "X"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dispatch"
        })]
      })]
    }) : null]
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$e,
  default: quoteReview,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const seedDispatchRoutes = [
  {
    id: "route-north",
    code: "R-12",
    truck: "Truck 12",
    driver: "Paul",
    helper: "Manny",
    color: "#f97316",
    shift: "6:30a - 3:30p",
    region: "North / Menomonee Falls",
    isActive: true
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
    isActive: true
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
    isActive: true
  }
];
const seedDispatchOrders = [
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
    status: "new"
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
    assignedRouteId: "route-west"
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
    status: "hold"
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
    assignedRouteId: "route-north"
  }
];
const ORDERS_TABLE = "dispatch_orders";
const ROUTES_TABLE = "dispatch_routes";
function normalizeOrder(row) {
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
    status: row.status === "scheduled" || row.status === "hold" ? row.status : "new",
    assignedRouteId: row.assigned_route_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function normalizeRoute(row) {
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
    updated_at: row.updated_at
  };
}
function formatSupabaseError(error) {
  if (!error) return "Unknown storage error";
  return error.message || error.details || error.hint || "Unknown storage error";
}
async function ensureSeedDispatchOrders() {
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).select("id", { count: "exact", head: false }).limit(1);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  if ((data2 || []).length > 0) {
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
      assigned_route_id: order.assignedRouteId || null
    }))
  );
  if (insertError) {
    throw new Error(formatSupabaseError(insertError));
  }
}
async function ensureSeedDispatchRoutes() {
  const { data: data2, error } = await supabaseAdmin.from(ROUTES_TABLE).select("id", { count: "exact", head: false }).limit(1);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  if ((data2 || []).length > 0) {
    return;
  }
  const { error: insertError } = await supabaseAdmin.from(ROUTES_TABLE).insert(
    seedDispatchRoutes.map((route30) => ({
      id: route30.id,
      code: route30.code,
      truck: route30.truck,
      driver: route30.driver,
      helper: route30.helper,
      color: route30.color,
      shift: route30.shift,
      region: route30.region,
      is_active: route30.isActive !== false
    }))
  );
  if (insertError) {
    throw new Error(formatSupabaseError(insertError));
  }
}
async function getDispatchOrders() {
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).select("*").order("created_at", { ascending: false });
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return (data2 || []).map(normalizeOrder);
}
async function getDispatchRoutes() {
  const { data: data2, error } = await supabaseAdmin.from(ROUTES_TABLE).select("*").eq("is_active", true).order("created_at", { ascending: true });
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return (data2 || []).map(normalizeRoute);
}
async function createDispatchOrder(input) {
  const id = `D-${Date.now().toString().slice(-6)}`;
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).insert({
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
    assigned_route_id: null
  }).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeOrder(data2);
}
async function createDispatchRoute(input) {
  const id = `route-${Date.now().toString(36)}`;
  const { data: data2, error } = await supabaseAdmin.from(ROUTES_TABLE).insert({
    id,
    code: input.code,
    truck: input.truck,
    driver: input.driver,
    helper: input.helper || "",
    color: input.color || "#38bdf8",
    shift: input.shift || "",
    region: input.region || "",
    is_active: true
  }).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeRoute(data2);
}
async function updateDispatchOrder(id, patch) {
  const payload = {};
  if (patch.status) payload.status = patch.status;
  if (patch.assignedRouteId !== void 0) {
    payload.assigned_route_id = patch.assignedRouteId;
  }
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).update(payload).eq("id", id).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeOrder(data2);
}
function metricCard(label, value, accent) {
  return /* @__PURE__ */ jsxs("div", {
    style: {
      borderRadius: 18,
      padding: "16px 18px",
      background: "rgba(15, 23, 42, 0.92)",
      border: `1px solid ${accent}33`,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)"
    },
    children: [/* @__PURE__ */ jsx("div", {
      style: {
        color: "#94a3b8",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.08em"
      },
      children: label
    }), /* @__PURE__ */ jsx("div", {
      style: {
        marginTop: 8,
        fontSize: 28,
        fontWeight: 800,
        color: "#f8fafc"
      },
      children: value
    })]
  });
}
function getDispatchPath(url) {
  return url.pathname.startsWith("/app/") ? "/app/dispatch" : "/dispatch";
}
async function loadDispatchState() {
  try {
    await ensureSeedDispatchOrders();
    await ensureSeedDispatchRoutes();
    return {
      orders: await getDispatchOrders(),
      routes: await getDispatchRoutes(),
      storageReady: true,
      storageError: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load dispatch storage";
    console.error("[DISPATCH STORAGE ERROR]", message);
    return {
      orders: seedDispatchOrders,
      routes: seedDispatchRoutes,
      storageReady: false,
      storageError: message
    };
  }
}
async function loader$6({
  request
}) {
  const url = new URL(request.url);
  const dispatchPath = getDispatchPath(url);
  if (url.searchParams.get("logout") === "1") {
    return redirect(dispatchPath, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("", {
          maxAge: 0
        })
      }
    });
  }
  const allowed = await hasAdminQuoteAccess(request);
  if (!allowed) {
    return data({
      allowed: false,
      orders: [],
      routes: [],
      storageReady: false,
      storageError: null
    });
  }
  const dispatchState = await loadDispatchState();
  return data({
    allowed: true,
    ...dispatchState
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
        orders: [],
        routes: []
      }, {
        status: 401
      });
    }
    const dispatchState = await loadDispatchState();
    return data({
      allowed: true,
      loginError: null,
      ...dispatchState
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
      orders: [],
      routes: []
    }, {
      status: 401
    });
  }
  try {
    if (intent === "create-order") {
      const customer = String(form.get("customer") || "").trim();
      const address = String(form.get("address") || "").trim();
      const material = String(form.get("material") || "").trim();
      if (!customer || !address || !material) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Customer, jobsite address, and material are required.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const created = await createDispatchOrder({
        source: "manual",
        customer,
        contact: String(form.get("contact") || "").trim(),
        address,
        city: String(form.get("city") || "").trim(),
        material,
        quantity: String(form.get("quantity") || "").trim(),
        unit: String(form.get("unit") || "TonS").trim() || "TonS",
        requestedWindow: String(form.get("requestedWindow") || "").trim(),
        truckPreference: String(form.get("truckPreference") || "").trim(),
        notes: String(form.get("notes") || "").trim()
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: `Added ${created.customer} to the dispatch queue.`,
        selectedOrderId: created.id,
        ...dispatchState
      });
    }
    if (intent === "create-route") {
      const code = String(form.get("code") || "").trim();
      const truck = String(form.get("truck") || "").trim();
      const driver = String(form.get("driver") || "").trim();
      if (!code || !truck || !driver) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Route code, truck, and driver are required.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const created = await createDispatchRoute({
        code,
        truck,
        driver,
        helper: String(form.get("helper") || "").trim(),
        color: String(form.get("color") || "#38bdf8").trim(),
        shift: String(form.get("shift") || "").trim(),
        region: String(form.get("region") || "").trim()
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: `Added ${created.truck} to the route board.`,
        ...dispatchState
      });
    }
    if (intent === "assign-order") {
      const orderId = String(form.get("orderId") || "").trim();
      const routeId = String(form.get("routeId") || "").trim();
      if (!orderId || !routeId) {
        throw new Error("Missing order or route assignment details");
      }
      await updateDispatchOrder(orderId, {
        status: "scheduled",
        assignedRouteId: routeId
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: "Order assigned to route.",
        selectedOrderId: orderId,
        ...dispatchState
      });
    }
    if (intent === "hold-order") {
      const orderId = String(form.get("orderId") || "").trim();
      if (!orderId) throw new Error("Missing order selection");
      await updateDispatchOrder(orderId, {
        status: "hold",
        assignedRouteId: null
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: "Order moved to hold.",
        selectedOrderId: orderId,
        ...dispatchState
      });
    }
    if (intent === "unassign-order") {
      const orderId = String(form.get("orderId") || "").trim();
      if (!orderId) throw new Error("Missing order selection");
      await updateDispatchOrder(orderId, {
        status: "new",
        assignedRouteId: null
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: "Order moved back to inbox.",
        selectedOrderId: orderId,
        ...dispatchState
      });
    }
    return data({
      allowed: true,
      ok: false,
      message: "Unknown dispatch action."
    }, {
      status: 400
    });
  } catch (error) {
    const dispatchState = await loadDispatchState();
    const message = error instanceof Error ? error.message : "Dispatch action failed";
    return data({
      allowed: true,
      ok: false,
      message,
      ...dispatchState
    }, {
      status: 500
    });
  }
}
const dispatch = UNSAFE_withComponentProps(function DispatchPage() {
  var _a2;
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const location = useLocation();
  const allowed = (actionData == null ? void 0 : actionData.allowed) ?? loaderData.allowed;
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const quoteHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const reviewHref = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  const mobileHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const logoutHref = `${dispatchHref}?logout=1`;
  const orders = (actionData == null ? void 0 : actionData.orders) ?? loaderData.orders ?? [];
  const dispatchRoutes = (actionData == null ? void 0 : actionData.routes) ?? loaderData.routes ?? [];
  const storageReady = (actionData == null ? void 0 : actionData.storageReady) ?? loaderData.storageReady ?? false;
  const storageError = (actionData == null ? void 0 : actionData.storageError) ?? loaderData.storageError ?? null;
  const querySelectedOrderId = new URLSearchParams(location.search).get("order");
  const selectedOrderId = (actionData == null ? void 0 : actionData.selectedOrderId) || querySelectedOrderId || ((_a2 = orders[0]) == null ? void 0 : _a2.id);
  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) || orders[0] || null, [orders, selectedOrderId]);
  const routes2 = useMemo(() => dispatchRoutes.map((route30) => {
    const routeOrders = orders.filter((order) => order.assignedRouteId === route30.id);
    return {
      ...route30,
      stops: routeOrders.length,
      loadSummary: routeOrders.map((order) => `${order.quantity} ${order.unit} ${order.material}`).slice(0, 2).join(" • "),
      orders: routeOrders
    };
  }), [dispatchRoutes, orders]);
  const inboxOrders = orders.filter((order) => !order.assignedRouteId && order.status === "new");
  const holdOrders = orders.filter((order) => order.status === "hold");
  const scheduledOrders = orders.filter((order) => order.assignedRouteId);
  if (!allowed) {
    return /* @__PURE__ */ jsx("div", {
      style: styles$1.page,
      children: /* @__PURE__ */ jsx("div", {
        style: {
          ...styles$1.shell,
          maxWidth: 520
        },
        children: /* @__PURE__ */ jsxs("div", {
          style: styles$1.loginCard,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$1.title,
            children: "Dispatch"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$1.subtitle,
            children: "Enter the admin password to open the contractor dispatch workspace."
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
                ...styles$1.primaryButton,
                width: "100%",
                marginTop: 16
              },
              children: "Open Dispatch"
            })]
          })]
        })
      })
    });
  }
  return /* @__PURE__ */ jsx("div", {
    style: styles$1.page,
    children: /* @__PURE__ */ jsxs("div", {
      style: styles$1.shell,
      children: [/* @__PURE__ */ jsxs("div", {
        style: styles$1.hero,
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("div", {
            style: styles$1.kicker,
            children: "Dispatch Workspace"
          }), /* @__PURE__ */ jsx("h1", {
            style: styles$1.title,
            children: "Plan, intake, and assign deliveries"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$1.subtitle,
            children: "Contractor-only dispatch slice with persistent intake, truck assignment, route boards, and the first foundation for email-driven scheduling."
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles$1.heroActions,
          children: [/* @__PURE__ */ jsx("a", {
            href: mobileHref,
            style: styles$1.ghostButton,
            children: "Dashboard"
          }), /* @__PURE__ */ jsx("a", {
            href: quoteHref,
            style: styles$1.ghostButton,
            children: "Quote Tool"
          }), /* @__PURE__ */ jsx("a", {
            href: reviewHref,
            style: styles$1.ghostButton,
            children: "Review Quotes"
          }), /* @__PURE__ */ jsx("a", {
            href: logoutHref,
            style: styles$1.ghostButton,
            children: "Log Out"
          })]
        })]
      }), !storageReady ? /* @__PURE__ */ jsxs("div", {
        style: styles$1.statusWarn,
        children: ["Dispatch storage is not ready yet. Run", " ", /* @__PURE__ */ jsx("strong", {
          children: "`dispatch_schema.sql`"
        }), " ", "in Supabase SQL Editor, then refresh. Until then, you are seeing seed data.", storageError ? ` Storage error: ${storageError}` : ""]
      }) : null, (actionData == null ? void 0 : actionData.message) ? /* @__PURE__ */ jsx("div", {
        style: actionData.ok ? styles$1.statusOk : styles$1.statusErr,
        children: actionData.message
      }) : null, /* @__PURE__ */ jsxs("div", {
        style: styles$1.metricsGrid,
        children: [metricCard("Inbox", String(inboxOrders.length), "#f97316"), metricCard("Scheduled", String(scheduledOrders.length), "#22c55e"), metricCard("On Hold", String(holdOrders.length), "#eab308"), metricCard("Active Trucks", String(routes2.length), "#38bdf8")]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles$1.workspaceGrid,
        children: [/* @__PURE__ */ jsxs("div", {
          style: styles$1.leftColumn,
          children: [/* @__PURE__ */ jsxs("div", {
            style: styles$1.panel,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$1.panelHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$1.panelTitle,
                  children: "Email Intake Queue"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$1.panelSub,
                  children: "Orders that came in by email or were typed in manually can be reviewed and routed here."
                })]
              }), /* @__PURE__ */ jsx("div", {
                style: styles$1.headerPill,
                children: "Today"
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: {
                display: "grid",
                gap: 10
              },
              children: orders.map((order) => {
                const active = order.id === (selectedOrder == null ? void 0 : selectedOrder.id);
                const route30 = routes2.find((entry2) => entry2.id === order.assignedRouteId);
                return /* @__PURE__ */ jsxs("a", {
                  href: `${dispatchHref}?order=${encodeURIComponent(order.id)}`,
                  style: {
                    ...styles$1.queueCard,
                    borderColor: active ? "#38bdf8" : "rgba(51, 65, 85, 0.92)",
                    boxShadow: active ? "0 0 0 1px rgba(56, 189, 248, 0.45)" : "none",
                    textDecoration: "none"
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12
                    },
                    children: [/* @__PURE__ */ jsxs("div", {
                      children: [/* @__PURE__ */ jsx("div", {
                        style: styles$1.queueTitle,
                        children: order.customer
                      }), /* @__PURE__ */ jsxs("div", {
                        style: styles$1.queueMeta,
                        children: [order.address, ", ", order.city]
                      })]
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$1.badge(order.status),
                      children: order.status
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$1.queueDetails,
                    children: [/* @__PURE__ */ jsx("span", {
                      children: order.id
                    }), /* @__PURE__ */ jsxs("span", {
                      children: [order.quantity, " ", order.unit]
                    }), /* @__PURE__ */ jsx("span", {
                      children: order.material
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$1.queueFooter,
                    children: [/* @__PURE__ */ jsx("span", {
                      children: order.requestedWindow
                    }), /* @__PURE__ */ jsx("span", {
                      children: route30 ? `${route30.truck} / ${route30.driver}` : "Unassigned"
                    })]
                  })]
                }, order.id);
              })
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$1.panel,
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$1.panelHeader,
              children: /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$1.panelTitle,
                  children: "Manual Intake"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$1.panelSub,
                  children: "Start the GoCanvas-style capture flow by typing in the order details dispatch needs to track."
                })]
              })
            }), /* @__PURE__ */ jsxs(Form, {
              method: "post",
              style: {
                display: "grid",
                gap: 12
              },
              children: [/* @__PURE__ */ jsx("input", {
                type: "hidden",
                name: "intent",
                value: "create-order"
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$1.formGridTwo,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Customer"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "customer",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Contact / Email"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "contact",
                    style: styles$1.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$1.formGridTwo,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Jobsite Address"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "address",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "City"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "city",
                    style: styles$1.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$1.formGridThree,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Material"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "material",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Quantity"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "quantity",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Unit"
                  }), /* @__PURE__ */ jsxs("select", {
                    name: "unit",
                    style: styles$1.input,
                    children: [/* @__PURE__ */ jsx("option", {
                      children: "TonS"
                    }), /* @__PURE__ */ jsx("option", {
                      children: "YardS"
                    }), /* @__PURE__ */ jsx("option", {
                      children: "GallonS"
                    })]
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$1.formGridTwo,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Requested Window"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "requestedWindow",
                    placeholder: "Today 1:00p - 3:00p",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Truck Preference"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "truckPreference",
                    placeholder: "Walking floor, tri-axle, etc.",
                    style: styles$1.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$1.label,
                  children: "Dispatch Notes"
                }), /* @__PURE__ */ jsx("textarea", {
                  name: "notes",
                  rows: 4,
                  style: {
                    ...styles$1.input,
                    resize: "vertical"
                  }
                })]
              }), /* @__PURE__ */ jsx("button", {
                type: "submit",
                style: styles$1.primaryButton,
                children: "Add To Dispatch Queue"
              })]
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles$1.centerColumn,
          children: [/* @__PURE__ */ jsxs("div", {
            style: styles$1.panel,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$1.panelHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$1.panelTitle,
                  children: "Routes & Fleet"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$1.panelSub,
                  children: "Active trucks, crew assignments, and current stop counts."
                })]
              }), /* @__PURE__ */ jsx("div", {
                style: styles$1.headerPill,
                children: "Live Board"
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: {
                display: "grid",
                gap: 12
              },
              children: routes2.map((route30) => /* @__PURE__ */ jsxs("div", {
                style: styles$1.routeCard(route30.color),
                children: [/* @__PURE__ */ jsxs("div", {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center"
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsxs("div", {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 10
                      },
                      children: [/* @__PURE__ */ jsx("div", {
                        style: styles$1.routeColor(route30.color)
                      }), /* @__PURE__ */ jsx("div", {
                        style: styles$1.routeCode,
                        children: route30.code
                      }), /* @__PURE__ */ jsx("div", {
                        style: styles$1.routeRegion,
                        children: route30.region
                      })]
                    }), /* @__PURE__ */ jsxs("div", {
                      style: {
                        marginTop: 8,
                        color: "#e2e8f0",
                        fontWeight: 700
                      },
                      children: [route30.truck, " · ", route30.driver, " / ", route30.helper]
                    })]
                  }), selectedOrder ? /* @__PURE__ */ jsxs(Form, {
                    method: "post",
                    children: [/* @__PURE__ */ jsx("input", {
                      type: "hidden",
                      name: "intent",
                      value: "assign-order"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "hidden",
                      name: "orderId",
                      value: selectedOrder.id
                    }), /* @__PURE__ */ jsx("input", {
                      type: "hidden",
                      name: "routeId",
                      value: route30.id
                    }), /* @__PURE__ */ jsx("button", {
                      type: "submit",
                      style: styles$1.assignButton,
                      children: "Assign Selected"
                    })]
                  }) : null]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$1.routeStats,
                  children: [/* @__PURE__ */ jsx("span", {
                    children: route30.shift
                  }), /* @__PURE__ */ jsxs("span", {
                    children: [route30.stops, " stops"]
                  }), /* @__PURE__ */ jsx("span", {
                    children: route30.loadSummary || "No assigned loads yet"
                  })]
                })]
              }, route30.id))
            }), /* @__PURE__ */ jsxs(Form, {
              method: "post",
              style: styles$1.routeCreateForm,
              children: [/* @__PURE__ */ jsx("input", {
                type: "hidden",
                name: "intent",
                value: "create-route"
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$1.formGridThree,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Route Code"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "code",
                    placeholder: "R-22",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Truck"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "truck",
                    placeholder: "Truck 22",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Color"
                  }), /* @__PURE__ */ jsx("input", {
                    type: "color",
                    name: "color",
                    defaultValue: "#38bdf8",
                    style: styles$1.colorInput
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$1.formGridThree,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Driver"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "driver",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Helper"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "helper",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Shift"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "shift",
                    placeholder: "7:00a - 4:00p",
                    style: styles$1.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$1.formGridTwo,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$1.label,
                    children: "Region"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "region",
                    placeholder: "North / Menomonee Falls",
                    style: styles$1.input
                  })]
                }), /* @__PURE__ */ jsx("div", {
                  style: {
                    display: "flex",
                    alignItems: "flex-end"
                  },
                  children: /* @__PURE__ */ jsx("button", {
                    type: "submit",
                    style: {
                      ...styles$1.primaryButton,
                      width: "100%"
                    },
                    children: "Add Route"
                  })
                })]
              })]
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$1.panel,
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$1.panelHeader,
              children: /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$1.panelTitle,
                  children: "Route Map Preview"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$1.panelSub,
                  children: "Visual route planning mockup for the first dispatch tab. We can wire live geocoding and stop sequencing next."
                })]
              })
            }), /* @__PURE__ */ jsxs("div", {
              style: styles$1.mapStage,
              children: [/* @__PURE__ */ jsx("div", {
                style: styles$1.mapGrid
              }), /* @__PURE__ */ jsx("div", {
                style: styles$1.mapWater
              }), routes2.map((route30, index) => /* @__PURE__ */ jsx("div", {
                style: {
                  ...styles$1.mapRoute(route30.color),
                  top: 70 + index * 80,
                  left: 40 + index * 90,
                  width: 180 + index * 15
                }
              }, route30.id)), routes2.flatMap((route30, routeIndex) => route30.orders.map((order, orderIndex) => /* @__PURE__ */ jsx("div", {
                title: `${order.customer} · ${route30.truck}`,
                style: {
                  ...styles$1.mapStop(route30.color),
                  top: 82 + routeIndex * 80 + orderIndex * 24,
                  left: 90 + routeIndex * 92 + orderIndex * 34
                },
                children: orderIndex + 1
              }, `${route30.id}-${order.id}`))), /* @__PURE__ */ jsx("div", {
                style: styles$1.mapLegend,
                children: routes2.map((route30) => /* @__PURE__ */ jsxs("div", {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 8
                  },
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$1.routeColor(route30.color)
                  }), /* @__PURE__ */ jsx("span", {
                    children: route30.truck
                  })]
                }, route30.id))
              })]
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles$1.rightColumn,
          children: [/* @__PURE__ */ jsxs("div", {
            style: styles$1.panel,
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$1.panelHeader,
              children: /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$1.panelTitle,
                  children: "Dispatch Detail"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$1.panelSub,
                  children: "Review the selected order, then assign it to a truck and crew or place it on hold."
                })]
              })
            }), selectedOrder ? /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gap: 14
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("div", {
                  style: styles$1.detailId,
                  children: selectedOrder.id
                }), /* @__PURE__ */ jsx("div", {
                  style: styles$1.detailTitle,
                  children: selectedOrder.customer
                }), /* @__PURE__ */ jsx("div", {
                  style: styles$1.detailMeta,
                  children: selectedOrder.contact
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$1.detailGrid,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$1.detailLabel,
                    children: "Address"
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$1.detailValue,
                    children: [selectedOrder.address, ", ", selectedOrder.city]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$1.detailLabel,
                    children: "Load"
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$1.detailValue,
                    children: [selectedOrder.quantity, " ", selectedOrder.unit, " ", selectedOrder.material]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$1.detailLabel,
                    children: "Requested"
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$1.detailValue,
                    children: selectedOrder.requestedWindow
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$1.detailLabel,
                    children: "Truck Preference"
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$1.detailValue,
                    children: selectedOrder.truckPreference || "No preference"
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$1.notesBlock,
                children: [/* @__PURE__ */ jsx("div", {
                  style: styles$1.detailLabel,
                  children: "Notes"
                }), /* @__PURE__ */ jsx("div", {
                  style: {
                    color: "#e2e8f0",
                    lineHeight: 1.55
                  },
                  children: selectedOrder.notes || "No dispatch notes yet."
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  display: "grid",
                  gap: 10
                },
                children: [/* @__PURE__ */ jsxs(Form, {
                  method: "post",
                  children: [/* @__PURE__ */ jsx("input", {
                    type: "hidden",
                    name: "intent",
                    value: "unassign-order"
                  }), /* @__PURE__ */ jsx("input", {
                    type: "hidden",
                    name: "orderId",
                    value: selectedOrder.id
                  }), /* @__PURE__ */ jsx("button", {
                    type: "submit",
                    style: styles$1.secondaryButton,
                    children: "Move Back To Inbox"
                  })]
                }), /* @__PURE__ */ jsxs(Form, {
                  method: "post",
                  children: [/* @__PURE__ */ jsx("input", {
                    type: "hidden",
                    name: "intent",
                    value: "hold-order"
                  }), /* @__PURE__ */ jsx("input", {
                    type: "hidden",
                    name: "orderId",
                    value: selectedOrder.id
                  }), /* @__PURE__ */ jsx("button", {
                    type: "submit",
                    style: styles$1.secondaryButton,
                    children: "Put On Hold"
                  })]
                })]
              })]
            }) : /* @__PURE__ */ jsx("div", {
              style: {
                color: "#94a3b8"
              },
              children: "Select an order to view dispatch detail."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$1.panel,
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$1.panelHeader,
              children: /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$1.panelTitle,
                  children: "Phase 2 Targets"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$1.panelSub,
                  children: "Next steps to expand this into the full dispatch + field execution system."
                })]
              })
            }), /* @__PURE__ */ jsx("div", {
              style: {
                display: "grid",
                gap: 10
              },
              children: ["Email parser to read the order inbox and prefill dispatch cards", "Persistent trucks, employees, routes, and assigned stops in Supabase", "Driver mobile workflow: arrive, depart, signature, photos, tickets", "GoCanvas-style field forms for inspection, proof, and custom checklists", "Route optimization and live map sequencing"].map((item) => /* @__PURE__ */ jsxs("div", {
                style: styles$1.todoItem,
                children: [/* @__PURE__ */ jsx("span", {
                  style: styles$1.todoDot
                }), /* @__PURE__ */ jsx("span", {
                  children: item
                })]
              }, item))
            })]
          })]
        })]
      })]
    })
  });
});
const styles$1 = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top left, rgba(14, 165, 233, 0.14), transparent 26%), radial-gradient(circle at top right, rgba(249, 115, 22, 0.1), transparent 24%), linear-gradient(180deg, #09101d 0%, #0f172a 42%, #020617 100%)",
    color: "#f8fafc",
    padding: "24px 18px 42px",
    fontFamily: '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  shell: {
    maxWidth: 1540,
    margin: "0 auto",
    display: "grid",
    gap: 20
  },
  loginCard: {
    background: "rgba(15, 23, 42, 0.92)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    borderRadius: 28,
    padding: 28,
    boxShadow: "0 30px 60px rgba(2, 6, 23, 0.46)"
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.8fr)",
    gap: 18,
    padding: 24,
    borderRadius: 30,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.92))",
    boxShadow: "0 30px 60px rgba(2, 6, 23, 0.45)"
  },
  kicker: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.18em"
  },
  title: {
    margin: "10px 0 0",
    fontSize: "2.8rem",
    lineHeight: 1.04,
    letterSpacing: "-0.04em",
    fontWeight: 900
  },
  subtitle: {
    margin: "12px 0 0",
    color: "#94a3b8",
    fontSize: 16,
    lineHeight: 1.65,
    maxWidth: 780
  },
  heroActions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignContent: "flex-start",
    justifyContent: "flex-end"
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
    fontWeight: 700
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 14
  },
  workspaceGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 0.95fr) minmax(420px, 1.2fr) minmax(320px, 0.82fr)",
    gap: 18,
    alignItems: "start"
  },
  leftColumn: {
    display: "grid",
    gap: 18
  },
  centerColumn: {
    display: "grid",
    gap: 18
  },
  rightColumn: {
    display: "grid",
    gap: 18
  },
  panel: {
    borderRadius: 28,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.92)",
    padding: 22,
    boxShadow: "0 24px 50px rgba(2, 6, 23, 0.38)"
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 16
  },
  panelTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "-0.02em"
  },
  panelSub: {
    margin: "6px 0 0",
    color: "#94a3b8",
    lineHeight: 1.55,
    fontSize: 14
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
    textTransform: "uppercase",
    letterSpacing: "0.08em"
  },
  queueCard: {
    width: "100%",
    textAlign: "left",
    borderRadius: 18,
    border: "1px solid rgba(51, 65, 85, 0.92)",
    background: "rgba(2, 6, 23, 0.72)",
    padding: 16,
    color: "#f8fafc",
    cursor: "pointer"
  },
  queueTitle: {
    fontSize: 16,
    fontWeight: 800
  },
  queueMeta: {
    marginTop: 6,
    color: "#94a3b8",
    fontSize: 13
  },
  queueDetails: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    color: "#cbd5e1",
    fontSize: 13
  },
  queueFooter: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#64748b",
    fontSize: 12
  },
  formGridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12
  },
  formGridThree: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) 120px 140px",
    gap: 12
  },
  label: {
    display: "block",
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#cbd5e1"
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 48,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.94)",
    color: "#f8fafc",
    fontSize: 14,
    outline: "none"
  },
  colorInput: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 48,
    padding: 6,
    borderRadius: 14,
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.94)",
    cursor: "pointer"
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 15,
    border: "none",
    background: "linear-gradient(135deg, #f97316, #fb7185)",
    color: "#fff7ed",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer"
  },
  secondaryButton: {
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.72)",
    color: "#e2e8f0",
    fontWeight: 700,
    cursor: "pointer"
  },
  routeCard: (color) => ({
    borderRadius: 20,
    padding: 18,
    border: `1px solid ${color}44`,
    background: "linear-gradient(145deg, rgba(2, 6, 23, 0.86), rgba(15, 23, 42, 0.98))",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 18px 28px ${color}12`
  }),
  routeColor: (color) => ({
    width: 12,
    height: 12,
    borderRadius: 999,
    background: color,
    boxShadow: `0 0 0 5px ${color}22`
  }),
  routeCode: {
    fontSize: 13,
    fontWeight: 800,
    color: "#f8fafc"
  },
  routeRegion: {
    fontSize: 12,
    color: "#94a3b8"
  },
  routeStats: {
    marginTop: 14,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    color: "#cbd5e1",
    fontSize: 13
  },
  routeCreateForm: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid rgba(51, 65, 85, 0.82)",
    display: "grid",
    gap: 12
  },
  assignButton: {
    minHeight: 42,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(34, 197, 94, 0.4)",
    background: "rgba(34, 197, 94, 0.12)",
    color: "#bbf7d0",
    fontWeight: 800,
    cursor: "pointer"
  },
  mapStage: {
    position: "relative",
    minHeight: 380,
    borderRadius: 24,
    overflow: "hidden",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "radial-gradient(circle at 10% 10%, rgba(255,255,255,0.08), transparent 18%), linear-gradient(180deg, #d6e4f2 0%, #bdd6ea 36%, #bed5d5 100%)"
  },
  mapGrid: {
    position: "absolute",
    inset: 0,
    backgroundImage: "linear-gradient(rgba(15,23,42,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.08) 1px, transparent 1px)",
    backgroundSize: "58px 58px"
  },
  mapWater: {
    position: "absolute",
    right: -20,
    top: 40,
    width: 220,
    height: 260,
    borderRadius: "54% 46% 42% 58% / 48% 58% 42% 52%",
    background: "rgba(56, 189, 248, 0.22)",
    filter: "blur(1px)"
  },
  mapRoute: (color) => ({
    position: "absolute",
    height: 0,
    borderTop: `8px solid ${color}`,
    borderRadius: 999,
    transform: "rotate(-12deg)",
    opacity: 0.88
  }),
  mapStop: (color) => ({
    position: "absolute",
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
    boxShadow: `0 8px 18px ${color}55`
  }),
  mapLegend: {
    position: "absolute",
    left: 16,
    bottom: 16,
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: 16,
    background: "rgba(15, 23, 42, 0.88)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    color: "#e2e8f0",
    fontSize: 12
  },
  detailId: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase"
  },
  detailTitle: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 1.12
  },
  detailMeta: {
    marginTop: 6,
    color: "#94a3b8"
  },
  detailGrid: {
    display: "grid",
    gap: 12
  },
  detailLabel: {
    color: "#64748b",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 800
  },
  detailValue: {
    marginTop: 4,
    color: "#f8fafc",
    fontWeight: 700,
    lineHeight: 1.5
  },
  notesBlock: {
    borderRadius: 18,
    padding: 16,
    background: "rgba(2, 6, 23, 0.72)",
    border: "1px solid rgba(51, 65, 85, 0.95)"
  },
  todoItem: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    color: "#e2e8f0",
    lineHeight: 1.55
  },
  todoDot: {
    width: 8,
    height: 8,
    marginTop: 7,
    borderRadius: 999,
    background: "#38bdf8",
    boxShadow: "0 0 0 5px rgba(56, 189, 248, 0.15)",
    flex: "0 0 auto"
  },
  statusOk: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(22, 163, 74, 0.15)",
    border: "1px solid rgba(34, 197, 94, 0.5)",
    color: "#dcfce7",
    fontWeight: 700
  },
  statusWarn: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(234, 179, 8, 0.14)",
    border: "1px solid rgba(250, 204, 21, 0.35)",
    color: "#fef3c7",
    fontWeight: 600,
    lineHeight: 1.6
  },
  statusErr: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(220, 38, 38, 0.15)",
    border: "1px solid rgba(248, 113, 113, 0.5)",
    color: "#fee2e2",
    fontWeight: 700
  },
  badge: (status) => {
    const palette = status === "scheduled" ? {
      color: "#bbf7d0",
      border: "rgba(34, 197, 94, 0.35)",
      bg: "rgba(34, 197, 94, 0.12)"
    } : status === "hold" ? {
      color: "#fde68a",
      border: "rgba(234, 179, 8, 0.35)",
      bg: "rgba(234, 179, 8, 0.12)"
    } : {
      color: "#fed7aa",
      border: "rgba(249, 115, 22, 0.35)",
      bg: "rgba(249, 115, 22, 0.12)"
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
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    };
  }
};
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$d,
  default: dispatch,
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
    gridTemplateColumns: "repeat(4, 1fr)",
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
async function action$c({
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
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
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
            href: dispatchHref,
            style: styles.smallButton,
            children: "Dispatch"
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
      }), /* @__PURE__ */ jsxs("a", {
        href: dispatchHref,
        style: navLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: navIconStyle(false),
          children: "X"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dispatch"
        })]
      })]
    })]
  });
});
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$c,
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
const action$b = async ({
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
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$b,
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
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
      }), /* @__PURE__ */ jsx(Link, {
        to: `/app/dispatch${qs}`,
        style: {
          color: "#e5e7eb",
          textDecoration: "none",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #334155",
          background: "#0f172a"
        },
        children: "Dispatch"
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
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
async function action$a({
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
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$a,
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
async function action$9({
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
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$9,
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
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_additional
}, Symbol.toStringTag, { value: "Module" }));
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$f,
  default: customQuote,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$e,
  default: quoteReview,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$d,
  default: dispatch,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$c,
  default: mobileDashboard,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
async function action$8({
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
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8
}, Symbol.toStringTag, { value: "Module" }));
async function action$7({
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
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7
}, Symbol.toStringTag, { value: "Module" }));
async function action$6({
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
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6
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
function splitCustomerName(name) {
  const normalized = String(name || "").trim();
  if (!normalized) return {
    firstName: void 0,
    lastName: void 0
  };
  const parts = normalized.split(/\s+/);
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: void 0
    };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1)
  };
}
async function findOrCreateCustomerId(admin, input) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
  const email = String(input.email || "").trim();
  if (!email) return null;
  const findResponse = await admin.graphql(`#graphql
      query FindCustomerByEmail($query: String!) {
        customers(first: 1, query: $query) {
          nodes {
            id
          }
        }
      }
    `, {
    variables: {
      query: `email:${email}`
    }
  });
  const findJson = await findResponse.json();
  const existingCustomerId = (_d = (_c = (_b = (_a2 = findJson == null ? void 0 : findJson.data) == null ? void 0 : _a2.customers) == null ? void 0 : _b.nodes) == null ? void 0 : _c[0]) == null ? void 0 : _d.id;
  if (existingCustomerId) return existingCustomerId;
  const createResponse = await admin.graphql(`#graphql
      mutation CreateQuoteCustomer($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
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
        email,
        firstName: input.firstName || void 0,
        lastName: input.lastName || void 0
      }
    }
  });
  const createJson = await createResponse.json();
  const userErrors = ((_f = (_e = createJson == null ? void 0 : createJson.data) == null ? void 0 : _e.customerCreate) == null ? void 0 : _f.userErrors) || [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((error) => {
      var _a3;
      return ((_a3 = error.field) == null ? void 0 : _a3.length) ? `${error.field.join(".")}: ${error.message}` : error.message;
    }).join(", "));
  }
  return ((_i = (_h = (_g = createJson == null ? void 0 : createJson.data) == null ? void 0 : _g.customerCreate) == null ? void 0 : _h.customer) == null ? void 0 : _i.id) || null;
}
async function action$5({
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
  const customerName = splitCustomerName(quote.customer_name);
  let customerId = null;
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
  try {
    customerId = await findOrCreateCustomerId(admin, {
      email: quote.customer_email,
      firstName: customerName.firstName,
      lastName: customerName.lastName
    });
  } catch (error) {
    return data({
      ok: false,
      message: (error == null ? void 0 : error.message) || "Could not attach a Shopify customer to this draft order."
    }, {
      status: 400
    });
  }
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
        customerId: customerId || void 0,
        tags: ["custom-quote", buildQuoteTag(quote.id)],
        shippingAddress: {
          firstName: customerName.firstName,
          lastName: customerName.lastName,
          address1: quote.address1,
          address2: quote.address2 || void 0,
          city: quote.city,
          province: quote.province,
          country: quote.country,
          zip: quote.postal_code,
          phone: quote.customer_phone || void 0
        },
        billingAddress: {
          firstName: customerName.firstName,
          lastName: customerName.lastName,
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
const route24 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
const route19 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
async function action$4({
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
const route25 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
const route20 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
function normalizeQuantity(value) {
  const quantity = Number(value || 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}
function buildSourceBreakdown(lineItems) {
  const grouped = /* @__PURE__ */ new Map();
  for (const line of lineItems) {
    const vendor = line.vendor || "Unknown";
    const existing = grouped.get(vendor) || {
      vendor,
      quantity: 0,
      items: []
    };
    existing.quantity += line.quantity;
    existing.items.push(`${line.title} (${line.sku})`);
    grouped.set(vendor, existing);
  }
  return Array.from(grouped.values());
}
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
  const oldLineItems = existing.line_items || [];
  const lineItems = oldLineItems.map((line, index) => ({
    ...line,
    quantity: normalizeQuantity(form.get(`lineQuantity::${index}`))
  })).filter((line) => line.quantity > 0);
  if (lineItems.length === 0) {
    return data({
      ok: false,
      message: "At least one line item must have quantity greater than 0."
    }, {
      status: 400
    });
  }
  const customerName = String(form.get("customerName") || "").trim();
  const customerEmail = String(form.get("customerEmail") || "").trim();
  const customerPhone = String(form.get("customerPhone") || "").trim();
  const address1 = String(form.get("address1") || "").trim();
  const address2 = String(form.get("address2") || "").trim();
  const city = String(form.get("city") || "").trim();
  const province = String(form.get("province") || "").trim();
  const postalCode = String(form.get("postalCode") || "").trim();
  const country = String(form.get("country") || "US").trim() || "US";
  if (!address1 || !city || !province || !postalCode) {
    return data({
      ok: false,
      message: "Address 1, city, state, and ZIP are required to regenerate."
    }, {
      status: 400
    });
  }
  const productsSubtotal = lineItems.reduce((sum, line) => sum + Number(line.price || 0) * Number(line.quantity || 0), 0);
  const deliveryQuote = await getQuote({
    shop: existing.shop || process.env.SHOPIFY_STORE_DOMAIN || "darfaz-2e.myshopify.com",
    postalCode,
    country,
    province,
    city,
    address1,
    address2,
    items: lineItems.map((line) => ({
      sku: line.sku,
      quantity: Number(line.quantity || 0),
      requiresShipping: true,
      pickupVendor: line.vendor,
      price: Number(line.price || 0)
    }))
  });
  const deliveryAmount = Number(deliveryQuote.cents || 0) / 100;
  const taxRate = Number(process.env.QUOTE_TAX_RATE || "0");
  const taxAmount = (productsSubtotal + deliveryAmount) * taxRate;
  const totalAmount = productsSubtotal + deliveryAmount + taxAmount;
  const updatedQuote = await updateCustomQuote(quoteId, {
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
    serviceName: deliveryQuote.serviceName,
    description: deliveryQuote.description,
    eta: deliveryQuote.eta,
    summary: deliveryQuote.summary,
    sourceBreakdown: buildSourceBreakdown(lineItems),
    lineItems
  });
  return data({
    ok: true,
    message: "Quote regenerated.",
    quote: updatedQuote
  });
}
const route26 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
const route21 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
const route22 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8
}, Symbol.toStringTag, { value: "Module" }));
const route23 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7
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
const route27 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const route28 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const route29 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-Hi1v893O.js", "imports": ["/assets/jsx-runtime-_y2a4OCT.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/root-DJaHMJOf.js", "imports": ["/assets/jsx-runtime-_y2a4OCT.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index/route": { "id": "routes/_index/route", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-CBBVwP4O.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/custom-quote": { "id": "routes/custom-quote", "parentId": "root", "path": "custom-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/custom-quote-DP0QU3_S.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/quote-review": { "id": "routes/quote-review", "parentId": "root", "path": "quote-review", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/quote-review-qPbAlat6.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/dispatch": { "id": "routes/dispatch", "parentId": "root", "path": "dispatch", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/dispatch-DslT0zOw.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/mobile-dashboard": { "id": "routes/mobile-dashboard", "parentId": "root", "path": "mobile", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/mobile-dashboard-DXg0ATcK.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login/route": { "id": "routes/auth.login/route", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-CfMXwAFC.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/auth._-jWRsTZ3_.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": true, "module": "/assets/app-DqmvE_W1.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app._index-GC_ws-sp.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.admin": { "id": "routes/app.admin", "parentId": "routes/app", "path": "admin", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.admin-BjiBp67i.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.additional-C3SA_ndc.js", "imports": ["/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.custom-quote": { "id": "routes/app.custom-quote", "parentId": "routes/app", "path": "custom-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.custom-quote-pFDwKQ2f.js", "imports": ["/assets/custom-quote-DP0QU3_S.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.quote-review": { "id": "routes/app.quote-review", "parentId": "routes/app", "path": "quote-review", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.quote-review-KA8LGrfV.js", "imports": ["/assets/quote-review-qPbAlat6.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.dispatch": { "id": "routes/app.dispatch", "parentId": "routes/app", "path": "dispatch", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.dispatch-CCCv-20v.js", "imports": ["/assets/dispatch-DslT0zOw.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.mobile": { "id": "routes/app.mobile", "parentId": "routes/app", "path": "mobile", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.mobile--ZYi3-6v.js", "imports": ["/assets/mobile-dashboard-DXg0ATcK.js", "/assets/chunk-UVKPFVEO-CzJcqpLx.js", "/assets/jsx-runtime-_y2a4OCT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.shipping-estimate": { "id": "routes/api.shipping-estimate", "parentId": "root", "path": "api/shipping-estimate", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.shipping-estimate-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.carrier-service": { "id": "routes/api.carrier-service", "parentId": "root", "path": "api/carrier-service", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.carrier-service-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.sync-products": { "id": "routes/api.sync-products", "parentId": "root", "path": "api/sync-products", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.sync-products-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.create-draft-order": { "id": "routes/api.create-draft-order", "parentId": "root", "path": "api/create-draft-order", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.create-draft-order-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.delete-quote": { "id": "routes/api.delete-quote", "parentId": "root", "path": "api/delete-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.delete-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.update-quote": { "id": "routes/api.update-quote", "parentId": "root", "path": "api/update-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.update-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.shipping-estimate": { "id": "routes/app.api.shipping-estimate", "parentId": "root", "path": "app/api/shipping-estimate", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.shipping-estimate-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.carrier-service": { "id": "routes/app.api.carrier-service", "parentId": "root", "path": "app/api/carrier-service", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.carrier-service-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.create-draft-order": { "id": "routes/app.api.create-draft-order", "parentId": "root", "path": "app/api/create-draft-order", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.create-draft-order-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.delete-quote": { "id": "routes/app.api.delete-quote", "parentId": "root", "path": "app/api/delete-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.delete-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.update-quote": { "id": "routes/app.api.update-quote", "parentId": "root", "path": "app/api/update-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.update-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.products.update": { "id": "routes/webhooks.products.update", "parentId": "root", "path": "webhooks/products/update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.products.update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-0dfb1d20.js", "version": "0dfb1d20", "sri": void 0 };
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
  "routes/dispatch": {
    id: "routes/dispatch",
    parentId: "root",
    path: "dispatch",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/mobile-dashboard": {
    id: "routes/mobile-dashboard",
    parentId: "root",
    path: "mobile",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/auth.login/route": {
    id: "routes/auth.login/route",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route9
  },
  "routes/app.admin": {
    id: "routes/app.admin",
    parentId: "routes/app",
    path: "admin",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/app.custom-quote": {
    id: "routes/app.custom-quote",
    parentId: "routes/app",
    path: "custom-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/app.quote-review": {
    id: "routes/app.quote-review",
    parentId: "routes/app",
    path: "quote-review",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/app.dispatch": {
    id: "routes/app.dispatch",
    parentId: "routes/app",
    path: "dispatch",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/app.mobile": {
    id: "routes/app.mobile",
    parentId: "routes/app",
    path: "mobile",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/api.shipping-estimate": {
    id: "routes/api.shipping-estimate",
    parentId: "root",
    path: "api/shipping-estimate",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/api.carrier-service": {
    id: "routes/api.carrier-service",
    parentId: "root",
    path: "api/carrier-service",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  },
  "routes/api.sync-products": {
    id: "routes/api.sync-products",
    parentId: "root",
    path: "api/sync-products",
    index: void 0,
    caseSensitive: void 0,
    module: route18
  },
  "routes/api.create-draft-order": {
    id: "routes/api.create-draft-order",
    parentId: "root",
    path: "api/create-draft-order",
    index: void 0,
    caseSensitive: void 0,
    module: route19
  },
  "routes/api.delete-quote": {
    id: "routes/api.delete-quote",
    parentId: "root",
    path: "api/delete-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route20
  },
  "routes/api.update-quote": {
    id: "routes/api.update-quote",
    parentId: "root",
    path: "api/update-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route21
  },
  "routes/app.api.shipping-estimate": {
    id: "routes/app.api.shipping-estimate",
    parentId: "root",
    path: "app/api/shipping-estimate",
    index: void 0,
    caseSensitive: void 0,
    module: route22
  },
  "routes/app.api.carrier-service": {
    id: "routes/app.api.carrier-service",
    parentId: "root",
    path: "app/api/carrier-service",
    index: void 0,
    caseSensitive: void 0,
    module: route23
  },
  "routes/app.api.create-draft-order": {
    id: "routes/app.api.create-draft-order",
    parentId: "root",
    path: "app/api/create-draft-order",
    index: void 0,
    caseSensitive: void 0,
    module: route24
  },
  "routes/app.api.delete-quote": {
    id: "routes/app.api.delete-quote",
    parentId: "root",
    path: "app/api/delete-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route25
  },
  "routes/app.api.update-quote": {
    id: "routes/app.api.update-quote",
    parentId: "root",
    path: "app/api/update-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route26
  },
  "routes/webhooks.products.update": {
    id: "routes/webhooks.products.update",
    parentId: "root",
    path: "webhooks/products/update",
    index: void 0,
    caseSensitive: void 0,
    module: route27
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route28
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route29
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
