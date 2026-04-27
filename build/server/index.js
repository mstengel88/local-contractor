var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var _a;
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, redirect, createCookie, useLoaderData, useActionData, useFetcher, useNavigation, useLocation, Form, data, Link, UNSAFE_withErrorBoundaryProps } from "react-router";
import { renderToPipeableStream } from "react-dom/server";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { useState, useDeferredValue, useMemo, useEffect, useRef } from "react";
import tls from "node:tls";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}
const prisma = global.prismaGlobal ?? new PrismaClient();
const supabaseUrl$1 = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl$1) {
  throw new Error("Missing SUPABASE_URL");
}
if (!supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}
const supabaseAdmin = createClient(
  supabaseUrl$1,
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
const login$1 = shopify.login;
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
async function loader$f({
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
  loader: loader$f
}, Symbol.toStringTag, { value: "Module" }));
function getCreatorPayload(input) {
  return {
    created_by_user_id: input.createdByUserId || null,
    created_by_name: input.createdByName || null,
    created_by_email: input.createdByEmail || null
  };
}
function isMissingCreatorColumnError(error) {
  const message = `${(error == null ? void 0 : error.message) || ""} ${(error == null ? void 0 : error.details) || ""} ${(error == null ? void 0 : error.hint) || ""}`;
  return (error == null ? void 0 : error.code) === "42703" || (error == null ? void 0 : error.code) === "PGRST204" || /created_by_(user_id|name|email)/i.test(message) || /schema cache/i.test(message);
}
async function saveCustomQuote(input) {
  const quotePayload = {
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
    summary: input.summary || null,
    ...getCreatorPayload(input),
    source_breakdown: input.sourceBreakdown,
    line_items: input.lineItems
  };
  const { data: data2, error } = await supabaseAdmin.from("custom_delivery_quotes").insert(quotePayload).select("id").single();
  if (error) {
    if (isMissingCreatorColumnError(error)) {
      const { created_by_user_id, created_by_name, created_by_email, ...fallbackPayload } = quotePayload;
      const fallback = await supabaseAdmin.from("custom_delivery_quotes").insert(fallbackPayload).select("id").single();
      if (!fallback.error) {
        console.warn(
          "[SAVE CUSTOM QUOTE WARNING] Creator columns missing. Run supabase_quote_creator_schema.sql."
        );
        return fallback.data;
      }
      console.error("[SAVE CUSTOM QUOTE FALLBACK ERROR]", fallback.error);
    }
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
const permissionLabels = {
  quoteTool: "Quote Tool",
  reviewQuotes: "Review Quotes",
  dispatch: "Dispatch",
  driver: "Driver View",
  settings: "Settings",
  sendToShopify: "Send To Shopify",
  manageDispatch: "Manage Dispatch",
  manageUsers: "Manage Users",
  auditLog: "Audit Log"
};
const allPermissions = Object.keys(permissionLabels);
const cookieSecret$1 = process.env.USER_AUTH_COOKIE_SECRET || process.env.QUOTE_ACCESS_COOKIE_SECRET || "dev-secret-change-me";
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAuthKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const userAuthCookie = createCookie("contractor_user_session", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: true,
  secrets: [cookieSecret$1],
  maxAge: 60 * 60 * 24 * 7
});
function getDefaultPermissions(role) {
  if (role === "admin") return [...allPermissions];
  if (role === "dispatcher") {
    return ["quoteTool", "reviewQuotes", "dispatch", "driver", "manageDispatch"];
  }
  if (role === "driver") return ["driver"];
  return ["quoteTool"];
}
function normalizePermissions(value, role) {
  const raw = Array.isArray(value) ? value : getDefaultPermissions(role);
  const allowed = new Set(allPermissions);
  return raw.filter(
    (permission) => allowed.has(permission)
  );
}
function normalizeProfile(row, mustChangePassword = false) {
  const role = String((row == null ? void 0 : row.role) || "user");
  return {
    id: String((row == null ? void 0 : row.id) || ""),
    email: String((row == null ? void 0 : row.email) || ""),
    name: String((row == null ? void 0 : row.name) || ""),
    role,
    permissions: normalizePermissions(row == null ? void 0 : row.permissions, role),
    isActive: (row == null ? void 0 : row.is_active) !== false,
    mustChangePassword
  };
}
function normalizeAuditEvent(row) {
  return {
    id: String((row == null ? void 0 : row.id) || ""),
    actorUserId: (row == null ? void 0 : row.actor_user_id) || null,
    actorName: String((row == null ? void 0 : row.actor_name) || "Unknown user"),
    actorEmail: String((row == null ? void 0 : row.actor_email) || ""),
    action: String((row == null ? void 0 : row.action) || ""),
    targetType: String((row == null ? void 0 : row.target_type) || ""),
    targetId: (row == null ? void 0 : row.target_id) || null,
    targetLabel: String((row == null ? void 0 : row.target_label) || ""),
    details: (row == null ? void 0 : row.details) && typeof row.details === "object" ? row.details : {},
    createdAt: String((row == null ? void 0 : row.created_at) || "")
  };
}
function getAuthClient() {
  if (!supabaseUrl || !supabaseAuthKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  return createClient(supabaseUrl, supabaseAuthKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
async function signInContractorUser(email, password) {
  var _a2, _b, _c, _d;
  const client = getAuthClient();
  const { data: data2, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data2.session || !((_a2 = data2.user) == null ? void 0 : _a2.email)) {
    throw new Error((error == null ? void 0 : error.message) || "Unable to sign in.");
  }
  const profile = await ensureUserProfile({
    id: data2.user.id,
    email: data2.user.email,
    name: String(((_b = data2.user.user_metadata) == null ? void 0 : _b.name) || ((_c = data2.user.user_metadata) == null ? void 0 : _c.full_name) || "") || data2.user.email
  });
  profile.mustChangePassword = ((_d = data2.user.user_metadata) == null ? void 0 : _d.must_change_password) === true;
  if (!profile.isActive) {
    throw new Error("This user is disabled.");
  }
  await logAuditEvent({
    actor: profile,
    action: "login",
    targetType: "user",
    targetId: profile.id,
    targetLabel: profile.email,
    details: { method: "password" }
  });
  return {
    cookie: await userAuthCookie.serialize({
      access_token: data2.session.access_token,
      refresh_token: data2.session.refresh_token
    }),
    profile
  };
}
async function getCurrentUser(request) {
  var _a2, _b, _c, _d;
  const cookieHeader = request.headers.get("Cookie");
  const session = await userAuthCookie.parse(cookieHeader);
  if (!(session == null ? void 0 : session.access_token) || !(session == null ? void 0 : session.refresh_token)) return null;
  const client = getAuthClient();
  const { data: data2, error } = await client.auth.setSession(session);
  if (error || !((_a2 = data2.user) == null ? void 0 : _a2.id)) return null;
  const profile = await ensureUserProfile({
    id: data2.user.id,
    email: data2.user.email || "",
    name: String(((_b = data2.user.user_metadata) == null ? void 0 : _b.name) || ((_c = data2.user.user_metadata) == null ? void 0 : _c.full_name) || "") || data2.user.email || ""
  });
  profile.mustChangePassword = ((_d = data2.user.user_metadata) == null ? void 0 : _d.must_change_password) === true;
  if (!profile.isActive) return null;
  return profile;
}
async function hasUserPermission(request, permission) {
  const user = await getCurrentUser(request);
  return Boolean(user == null ? void 0 : user.permissions.includes(permission));
}
async function requireUserPermission(request, permission, redirectTo = "/login") {
  const user = await getCurrentUser(request);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`${redirectTo}?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (user.mustChangePassword) {
    const url = new URL(request.url);
    throw redirect(`/change-password?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (!user.permissions.includes(permission)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}
async function ensureUserProfile(input) {
  const { data: existing, error: existingError } = await supabaseAdmin.from("app_user_profiles").select("*").eq("id", input.id).maybeSingle();
  if ((existingError == null ? void 0 : existingError.code) !== "42P01" && existingError) {
    throw new Error(existingError.message);
  }
  if (existing) return normalizeProfile(existing);
  const { count, error: countError } = await supabaseAdmin.from("app_user_profiles").select("id", { count: "exact", head: true });
  if ((countError == null ? void 0 : countError.code) === "42P01") {
    throw new Error("App user profile storage is not ready. Run supabase_auth_schema.sql.");
  }
  if (countError) throw new Error(countError.message);
  const role = count === 0 ? "admin" : "user";
  const permissions = getDefaultPermissions(role);
  const { data: data2, error } = await supabaseAdmin.from("app_user_profiles").insert({
    id: input.id,
    email: input.email,
    name: input.name || input.email,
    role,
    permissions,
    is_active: true
  }).select("*").single();
  if (error) throw new Error(error.message);
  return normalizeProfile(data2);
}
async function listAppUsers() {
  const { data: data2, error } = await supabaseAdmin.from("app_user_profiles").select("*").order("email", { ascending: true });
  if ((error == null ? void 0 : error.code) === "42P01") return [];
  if (error) throw new Error(error.message);
  return (data2 || []).map(normalizeProfile);
}
async function updateAppUserProfile(input) {
  const permissions = normalizePermissions(input.permissions, input.role);
  const { data: data2, error } = await supabaseAdmin.from("app_user_profiles").update({
    name: input.name,
    role: input.role,
    permissions,
    is_active: input.isActive,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", input.id).select("*").single();
  if (error) throw new Error(error.message);
  return normalizeProfile(data2);
}
async function logAuditEvent(input) {
  var _a2, _b, _c, _d;
  const { error } = await supabaseAdmin.from("app_audit_log").insert({
    actor_user_id: ((_a2 = input.actor) == null ? void 0 : _a2.id) || null,
    actor_name: ((_b = input.actor) == null ? void 0 : _b.name) || ((_c = input.actor) == null ? void 0 : _c.email) || "System",
    actor_email: ((_d = input.actor) == null ? void 0 : _d.email) || "",
    action: input.action,
    target_type: input.targetType || "app",
    target_id: input.targetId || null,
    target_label: input.targetLabel || "",
    details: input.details || {}
  });
  if ((error == null ? void 0 : error.code) === "42P01") {
    console.warn("[AUDIT LOG] app_audit_log table missing. Run supabase_auth_schema.sql.");
    return;
  }
  if (error) {
    console.error("[AUDIT LOG ERROR]", error);
  }
}
async function listAuditEvents(limit = 100) {
  const { data: data2, error } = await supabaseAdmin.from("app_audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if ((error == null ? void 0 : error.code) === "42P01") return [];
  if (error) throw new Error(error.message);
  return (data2 || []).map(normalizeAuditEvent);
}
async function createAppUser(input) {
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name, must_change_password: true }
  });
  if (error || !created.user) {
    throw new Error((error == null ? void 0 : error.message) || "Unable to create user.");
  }
  const permissions = normalizePermissions(input.permissions, input.role);
  const { data: data2, error: profileError } = await supabaseAdmin.from("app_user_profiles").upsert({
    id: created.user.id,
    email: input.email,
    name: input.name || input.email,
    role: input.role,
    permissions,
    is_active: true,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).select("*").single();
  if (profileError) throw new Error(profileError.message);
  return normalizeProfile(data2);
}
async function changeCurrentUserPassword(request, password) {
  var _a2, _b, _c;
  const cookieHeader = request.headers.get("Cookie");
  const session = await userAuthCookie.parse(cookieHeader);
  if (!(session == null ? void 0 : session.access_token) || !(session == null ? void 0 : session.refresh_token)) {
    throw new Error("Please sign in again before changing your password.");
  }
  const client = getAuthClient();
  const { data: sessionData, error: sessionError } = await client.auth.setSession(session);
  if (sessionError || !((_a2 = sessionData.user) == null ? void 0 : _a2.id)) {
    throw new Error((sessionError == null ? void 0 : sessionError.message) || "Unable to verify your current session.");
  }
  const { data: data2, error } = await client.auth.updateUser({ password });
  if (error || !data2.user) {
    throw new Error((error == null ? void 0 : error.message) || "Unable to update password.");
  }
  await supabaseAdmin.auth.admin.updateUserById(data2.user.id, {
    user_metadata: {
      ...data2.user.user_metadata || {},
      must_change_password: false
    }
  });
  const profile = await ensureUserProfile({
    id: data2.user.id,
    email: data2.user.email || "",
    name: String(((_b = data2.user.user_metadata) == null ? void 0 : _b.name) || ((_c = data2.user.user_metadata) == null ? void 0 : _c.full_name) || "") || data2.user.email || ""
  });
  await logAuditEvent({
    actor: profile,
    action: "change_password",
    targetType: "user",
    targetId: profile.id,
    targetLabel: profile.email,
    details: { selfService: true }
  });
  const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
  if (refreshError || !refreshed.session) {
    return userAuthCookie.serialize("", { maxAge: 0 });
  }
  return userAuthCookie.serialize({
    access_token: refreshed.session.access_token,
    refresh_token: refreshed.session.refresh_token
  });
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
  const user = await getCurrentUser(request);
  if (user == null ? void 0 : user.mustChangePassword) {
    const url = new URL(request.url);
    throw redirect(`/change-password?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (user) return true;
  const cookieHeader = request.headers.get("Cookie");
  const cookieValue = await adminQuoteCookie.parse(cookieHeader);
  return cookieValue === "ok";
}
async function hasAdminQuotePermissionAccess(request, permission) {
  const user = await getCurrentUser(request);
  if (user == null ? void 0 : user.mustChangePassword) {
    const url = new URL(request.url);
    throw redirect(`/change-password?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (user) return user.permissions.includes(permission);
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
    let route38 = "";
    let locality = "";
    let administrativeArea = "";
    let zip = "";
    let countryCode = "US";
    for (const component of components) {
      const types = component.types || [];
      if (types.includes("street_number")) streetNumber = component.long_name || "";
      if (types.includes("route")) route38 = component.long_name || "";
      if (types.includes("locality")) locality = component.long_name || "";
      if (types.includes("administrative_area_level_1")) {
        administrativeArea = component.short_name || component.long_name || "";
      }
      if (types.includes("postal_code")) zip = component.long_name || "";
      if (types.includes("country")) {
        countryCode = component.short_name || component.long_name || "US";
      }
    }
    address1.value = [streetNumber, route38].filter(Boolean).join(" ").trim();
    city.value = options.cityFormat === "cityStateZip" ? [locality, [administrativeArea, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : locality;
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
async function getDispatchTravelEstimate(customerAddress) {
  var _a2, _b, _c, _d;
  const destination = customerAddress.trim();
  if (!destination) {
    return {
      originLabel: "",
      originAddress: "",
      minutes: 0,
      miles: 0,
      oneWayMinutes: 0,
      oneWayMiles: 0,
      returnMinutes: 0,
      returnMiles: 0,
      summary: "Missing destination address",
      error: "Missing destination address"
    };
  }
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    return {
      originLabel: "",
      originAddress: "",
      minutes: 0,
      miles: 0,
      oneWayMinutes: 0,
      oneWayMiles: 0,
      returnMinutes: 0,
      returnMiles: 0,
      summary: "Google Maps API key is not configured",
      error: "Google Maps API key is not configured"
    };
  }
  const origin = await getActiveOriginAddress();
  const result = await getDistanceMatrix(
    [origin.address, destination],
    [destination, origin.address],
    googleMapsApiKey
  );
  const oneWay = ((_b = (_a2 = result.matrix) == null ? void 0 : _a2[0]) == null ? void 0 : _b[0]) || null;
  const returnTrip = ((_d = (_c = result.matrix) == null ? void 0 : _c[1]) == null ? void 0 : _d[1]) || null;
  if (!oneWay || !returnTrip) {
    const error = result.error || "Unable to calculate travel time";
    return {
      originLabel: origin.label,
      originAddress: origin.address,
      minutes: 0,
      miles: 0,
      oneWayMinutes: 0,
      oneWayMiles: 0,
      returnMinutes: 0,
      returnMiles: 0,
      summary: error,
      error
    };
  }
  const minutes = Math.round(oneWay.minutes + returnTrip.minutes);
  const miles = Math.round((oneWay.miles + returnTrip.miles) * 10) / 10;
  return {
    originLabel: origin.label,
    originAddress: origin.address,
    minutes,
    miles,
    oneWayMinutes: Math.round(oneWay.minutes),
    oneWayMiles: oneWay.miles,
    returnMinutes: Math.round(returnTrip.minutes),
    returnMiles: returnTrip.miles,
    summary: `${minutes} min round trip (${miles} mi)`
  };
}
async function getQuote(input) {
  var _a2, _b, _c, _d, _e;
  const settings2 = await getAppSettings(input.shop);
  if (!settings2.enableCalculatedRates) {
    return {
      serviceName: "Delivery Unavailable",
      serviceCode: "CUSTOM_DELIVERY",
      cents: 0,
      description: "Calculated delivery rates are currently disabled",
      eta: "Unavailable",
      summary: "Calculated delivery rates are currently disabled"
    };
  }
  if (settings2.useTestFlatRate) {
    return {
      serviceName: "Test Delivery Rate",
      serviceCode: "CUSTOM_DELIVERY",
      cents: settings2.testFlatRateCents,
      description: "Test flat rate enabled",
      eta: "2–4 business days",
      summary: `Test flat rate: $${(settings2.testFlatRateCents / 100).toFixed(2)}`
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
    if (settings2.showVendorSource && pickupOrigin.label) {
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
    if (settings2.enableDebugLogging) {
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
    if (settings2.enableRemoteSurcharge && input.postalCode.startsWith("9")) {
      groupCostDollars += 3;
    }
    totalDeliveryCostCents += Math.round(groupCostDollars * 100);
    totalTrucks += trucksForGroup;
    if (settings2.enableDebugLogging) {
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
      if (settings2.enableRemoteSurcharge && input.postalCode.startsWith("9")) {
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
  const sourceText = settings2.showVendorSource && uniqueSources.length > 0 ? ` Source: ${uniqueSources.join(", ")}.` : "";
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
function getBrowserGoogleMapsApiKey$1() {
  return process.env.GOOGLE_MAPS_BROWSER_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
}
async function loader$e({
  request
}) {
  const url = new URL(request.url);
  if (url.searchParams.get("logout") === "1") {
    return redirect("/custom-quote", {
      headers: [["Set-Cookie", await userAuthCookie.serialize("", {
        maxAge: 0
      })], ["Set-Cookie", await adminQuoteCookie.serialize("", {
        maxAge: 0
      })]]
    });
  }
  const allowed = await hasAdminQuotePermissionAccess(request, "quoteTool");
  const [products, recentQuotes, currentUser] = allowed ? await Promise.all([getProductOptionsFromSupabase(), getRecentCustomQuotes(15), getCurrentUser(request)]) : [[], [], null];
  return data({
    allowed,
    currentUser,
    products,
    recentQuotes,
    googleMapsApiKey: getBrowserGoogleMapsApiKey$1()
  });
}
async function action$j({
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
        googleMapsApiKey: getBrowserGoogleMapsApiKey$1()
      }, {
        status: 401
      });
    }
    const [products2, recentQuotes2] = await Promise.all([getProductOptionsFromSupabase(), getRecentCustomQuotes(15)]);
    return data({
      allowed: true,
      products: products2,
      recentQuotes: recentQuotes2,
      googleMapsApiKey: getBrowserGoogleMapsApiKey$1()
    }, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("ok")
      }
    });
  }
  const allowed = await hasAdminQuotePermissionAccess(request, "quoteTool");
  if (!allowed) {
    return data({
      allowed: false,
      loginError: "Please log in",
      products: [],
      recentQuotes: [],
      googleMapsApiKey: getBrowserGoogleMapsApiKey$1()
    }, {
      status: 401
    });
  }
  const [products, recentQuotes] = await Promise.all([getProductOptionsFromSupabase(), getRecentCustomQuotes(15)]);
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
      googleMapsApiKey: getBrowserGoogleMapsApiKey$1()
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
      googleMapsApiKey: getBrowserGoogleMapsApiKey$1()
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
    const currentUser = await getCurrentUser(request);
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
      summary: void 0,
      createdByUserId: (currentUser == null ? void 0 : currentUser.id) || null,
      createdByName: (currentUser == null ? void 0 : currentUser.name) || (currentUser == null ? void 0 : currentUser.email) || "Legacy admin",
      createdByEmail: (currentUser == null ? void 0 : currentUser.email) || null,
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
    await logAuditEvent({
      actor: currentUser,
      action: "create_quote",
      targetType: "quote",
      targetId: saved.id,
      targetLabel: customerName || customerEmail || saved.id,
      details: {
        customerName,
        customerEmail,
        totalCents: Math.round(totalAmount * 100),
        audience: quoteAudience,
        contractorTier: quoteAudience === "contractor" ? contractorTier : null
      }
    });
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
    googleMapsApiKey: getBrowserGoogleMapsApiKey$1(),
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
const styles$8 = {
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
  const currentUser = (actionData == null ? void 0 : actionData.currentUser) ?? loaderData.currentUser ?? null;
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
  const canAccess = (permission) => {
    var _a3;
    return !currentUser || ((_a3 = currentUser.permissions) == null ? void 0 : _a3.includes(permission));
  };
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
    ...styles$8.buttonGhost,
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
      style: styles$8.page,
      children: /* @__PURE__ */ jsx("div", {
        style: {
          ...styles$8.shell,
          maxWidth: "520px"
        },
        children: /* @__PURE__ */ jsxs("div", {
          style: styles$8.card,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$8.title,
            children: "Custom Quote Portal"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$8.subtitle,
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
              style: styles$8.label,
              children: "Admin Password"
            }), /* @__PURE__ */ jsx("input", {
              type: "password",
              name: "password",
              autoComplete: "current-password",
              style: styles$8.input
            }), (actionData == null ? void 0 : actionData.loginError) ? /* @__PURE__ */ jsx("div", {
              style: styles$8.statusErr,
              children: actionData.loginError
            }) : null, /* @__PURE__ */ jsx("button", {
              type: "submit",
              style: {
                ...styles$8.buttonPrimary,
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
      ...styles$8.page,
      padding: isMobile ? "20px 14px 120px" : styles$8.page.padding,
      overflowX: "clip"
    },
    children: [/* @__PURE__ */ jsxs("div", {
      style: styles$8.shell,
      children: [isMobile ? /* @__PURE__ */ jsxs("div", {
        style: {
          marginBottom: 18
        },
        children: [/* @__PURE__ */ jsx("h1", {
          style: {
            ...styles$8.title,
            fontSize: "28px"
          },
          children: "Custom Quote Tool"
        }), /* @__PURE__ */ jsx("div", {
          style: styles$8.subtitle,
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
        style: styles$8.hero,
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$8.title,
            children: "Custom Quote Tool"
          }), /* @__PURE__ */ jsx("div", {
            style: styles$8.subtitle,
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
          children: [canAccess("quoteTool") ? /* @__PURE__ */ jsx("a", {
            href: mobileDashboardHref,
            style: styles$8.logout,
            children: "Dashboard"
          }) : null, canAccess("dispatch") ? /* @__PURE__ */ jsx("a", {
            href: dispatchHref,
            style: styles$8.logout,
            children: "Dispatch"
          }) : null, canAccess("reviewQuotes") ? /* @__PURE__ */ jsx("a", {
            href: quoteReviewHref,
            style: styles$8.logout,
            children: "Review Quotes"
          }) : null, canAccess("manageUsers") ? /* @__PURE__ */ jsx("a", {
            href: "/settings",
            style: styles$8.logout,
            children: "Settings"
          }) : null, currentUser ? /* @__PURE__ */ jsx("a", {
            href: "/change-password",
            style: styles$8.logout,
            children: "Change Password"
          }) : null, /* @__PURE__ */ jsx("a", {
            href: currentUser ? "/login?logout=1" : logoutHref,
            style: styles$8.logout,
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
            ...styles$8.card,
            padding: isMobile ? "18px" : styles$8.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$8.sectionTitle,
            children: "Quote Type"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$8.sectionSub,
            children: "Switch between standard customer pricing and contractor tier pricing."
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$8.tabRow,
            children: [/* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setQuoteAudience("customer"),
              style: {
                ...styles$8.tabButton,
                minHeight: isMobile ? 46 : void 0,
                flex: isMobile ? "1 1 110px" : void 0,
                textAlign: "center",
                ...quoteAudience === "customer" ? styles$8.tabButtonActive : {}
              },
              children: "Customer"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setQuoteAudience("contractor"),
              style: {
                ...styles$8.tabButton,
                minHeight: isMobile ? 46 : void 0,
                flex: isMobile ? "1 1 110px" : void 0,
                textAlign: "center",
                ...quoteAudience === "contractor" ? styles$8.tabButtonActive : {}
              },
              children: "Contractor"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setQuoteAudience("custom"),
              style: {
                ...styles$8.tabButton,
                minHeight: isMobile ? 46 : void 0,
                flex: isMobile ? "1 1 110px" : void 0,
                textAlign: "center",
                ...quoteAudience === "custom" ? styles$8.tabButtonActive : {}
              },
              children: "Custom"
            })]
          }), quoteAudience === "contractor" ? /* @__PURE__ */ jsxs("div", {
            style: {
              maxWidth: 280
            },
            children: [/* @__PURE__ */ jsx("label", {
              style: styles$8.label,
              children: "Contractor Tier"
            }), /* @__PURE__ */ jsxs("select", {
              name: "contractorTierUi",
              value: contractorTier,
              onChange: (e) => setContractorTier(normalizeContractorTier(e.target.value)),
              style: styles$8.input,
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
            ...styles$8.card,
            padding: isMobile ? "18px" : styles$8.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$8.sectionTitle,
            children: "Customer & Delivery Address"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$8.sectionSub,
            children: "Start typing the street address and choose a suggestion."
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              display: "grid",
              gap: "14px"
            },
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$8.label,
                children: "Customer Name"
              }), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "customerName",
                autoComplete: "name",
                defaultValue: (actionData == null ? void 0 : actionData.customerName) || "",
                style: styles$8.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$8.label,
                children: "Email Address"
              }), /* @__PURE__ */ jsx("input", {
                type: "email",
                name: "customerEmail",
                autoComplete: "email",
                defaultValue: (actionData == null ? void 0 : actionData.customerEmail) || "",
                style: styles$8.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$8.label,
                children: "Phone Number"
              }), /* @__PURE__ */ jsx("input", {
                type: "tel",
                name: "customerPhone",
                autoComplete: "tel",
                defaultValue: (actionData == null ? void 0 : actionData.customerPhone) || "",
                style: styles$8.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$8.label,
                children: "Address 1"
              }), /* @__PURE__ */ jsx("input", {
                id: "quote-address1",
                type: "text",
                name: "address1",
                autoComplete: "street-address",
                defaultValue: ((_a2 = actionData == null ? void 0 : actionData.address) == null ? void 0 : _a2.address1) || "",
                style: styles$8.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                style: styles$8.label,
                children: "Address 2"
              }), /* @__PURE__ */ jsx("input", {
                type: "text",
                name: "address2",
                autoComplete: "address-line2",
                defaultValue: ((_b = actionData == null ? void 0 : actionData.address) == null ? void 0 : _b.address2) || "",
                style: styles$8.input
              })]
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "1.3fr 0.8fr 0.8fr 0.8fr",
                gap: "14px"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$8.label,
                  children: "City"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-city",
                  type: "text",
                  name: "city",
                  autoComplete: "address-level2",
                  defaultValue: ((_c = actionData == null ? void 0 : actionData.address) == null ? void 0 : _c.city) || "",
                  style: styles$8.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$8.label,
                  children: "State"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-province",
                  type: "text",
                  name: "province",
                  autoComplete: "address-level1",
                  defaultValue: ((_d = actionData == null ? void 0 : actionData.address) == null ? void 0 : _d.province) || "WI",
                  style: styles$8.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$8.label,
                  children: "ZIP"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-postalCode",
                  type: "text",
                  name: "postalCode",
                  autoComplete: "postal-code",
                  defaultValue: ((_e = actionData == null ? void 0 : actionData.address) == null ? void 0 : _e.postalCode) || "",
                  style: styles$8.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$8.label,
                  children: "Country"
                }), /* @__PURE__ */ jsx("input", {
                  id: "quote-country",
                  type: "text",
                  name: "country",
                  autoComplete: "country-name",
                  defaultValue: ((_f = actionData == null ? void 0 : actionData.address) == null ? void 0 : _f.country) || "US",
                  style: styles$8.input
                })]
              })]
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            ...styles$8.card,
            padding: isMobile ? "18px" : styles$8.card.padding
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
                style: styles$8.sectionTitle,
                children: "Quote Lines"
              }), /* @__PURE__ */ jsx("p", {
                style: styles$8.sectionSub,
                children: "Search by product, SKU, or vendor. Click a result to select it."
              })]
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: addLine,
              style: styles$8.buttonGhost,
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
                      style: styles$8.label,
                      children: "Search Product"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "text",
                      value: line.search,
                      onChange: (e) => updateLine(index, {
                        search: e.target.value,
                        sku: ""
                      }),
                      placeholder: "Type product name, SKU, or vendor",
                      style: styles$8.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$8.label,
                      children: "Quantity"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "number",
                      min: "0",
                      step: "1",
                      value: line.quantity,
                      onChange: (e) => updateLine(index, {
                        quantity: e.target.value
                      }),
                      style: styles$8.input
                    })]
                  }), /* @__PURE__ */ jsx("button", {
                    type: "button",
                    onClick: () => removeLine(index),
                    disabled: lines.length === 1,
                    style: {
                      ...styles$8.buttonGhost,
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
                      style: styles$8.label,
                      children: "Custom Line Title"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "text",
                      value: line.customTitle || "",
                      onChange: (e) => updateLine(index, {
                        customTitle: e.target.value
                      }),
                      placeholder: selectedProduct.title,
                      style: styles$8.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$8.label,
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
                      style: styles$8.input
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
            ...styles$8.card,
            padding: isMobile ? "18px" : styles$8.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$8.sectionTitle,
            children: "Custom Adjustments"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$8.sectionSub,
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
                  style: styles$8.label,
                  children: "Delivery Amount"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customDeliveryAmount",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customDeliveryAmount) || "",
                  placeholder: "Use calculated delivery",
                  style: styles$8.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$8.label,
                  children: "Minute Charge"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customRatePerMinute",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customRatePerMinute) || "",
                  placeholder: "Default 2.08",
                  style: styles$8.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$8.label,
                  children: "Tax Rate"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customTaxRate",
                  min: "0",
                  step: "0.0001",
                  defaultValue: (actionData == null ? void 0 : actionData.customTaxRate) || "",
                  placeholder: "Example: 0.055",
                  style: styles$8.input
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
                  style: styles$8.label,
                  children: "Shipping Qty"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customShippingQuantity",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customShippingQuantity) || "",
                  placeholder: "Miles or hours",
                  style: styles$8.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$8.label,
                  children: "Shipping Unit"
                }), /* @__PURE__ */ jsxs("select", {
                  name: "customShippingUnit",
                  defaultValue: (actionData == null ? void 0 : actionData.customShippingUnit) || "miles",
                  style: styles$8.input,
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
                  style: styles$8.label,
                  children: "Price Per Unit"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  name: "customShippingRate",
                  min: "0",
                  step: "0.01",
                  defaultValue: (actionData == null ? void 0 : actionData.customShippingRate) || "",
                  placeholder: "Rate per mile/hour",
                  style: styles$8.input
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
                style: styles$8.label,
                children: "Notes"
              }), /* @__PURE__ */ jsx("textarea", {
                name: "customNotes",
                defaultValue: (actionData == null ? void 0 : actionData.customNotes) || "",
                placeholder: "Use calculated notes",
                style: {
                  ...styles$8.input,
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
              ...styles$8.buttonPrimary,
              width: isMobile ? "100%" : void 0,
              minHeight: isMobile ? 50 : void 0
            },
            children: isSubmitting ? "Calculating..." : "Get Full Quote"
          }), /* @__PURE__ */ jsx("button", {
            type: "submit",
            name: "intent",
            value: "save",
            style: {
              ...styles$8.buttonSecondary,
              width: isMobile ? "100%" : void 0,
              minHeight: isMobile ? 50 : void 0
            },
            children: isSubmitting ? "Saving..." : "Save Quote"
          })]
        })]
      }), (actionData == null ? void 0 : actionData.message) ? /* @__PURE__ */ jsx("div", {
        style: {
          ...actionData.ok ? styles$8.statusOk : styles$8.statusErr,
          fontSize: isMobile ? 16 : void 0,
          fontWeight: isMobile ? 700 : void 0
        },
        children: actionData.message
      }) : null, (actionData == null ? void 0 : actionData.savedQuoteId) ? /* @__PURE__ */ jsxs("div", {
        style: {
          ...styles$8.statusOk,
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
            ...styles$8.card,
            padding: isMobile ? "18px" : styles$8.card.padding
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
                ...styles$8.sectionTitle,
                margin: 0
              },
              children: "Full Quote Result"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: copyQuote,
              style: styles$8.buttonGhost,
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
            ...styles$8.card,
            padding: isMobile ? "18px" : styles$8.card.padding
          },
          children: [/* @__PURE__ */ jsx("h2", {
            style: styles$8.sectionTitle,
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
          ...styles$8.card,
          marginTop: 24,
          padding: isMobile ? "18px" : styles$8.card.padding
        },
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles$8.sectionTitle,
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
          ...styles$8.card,
          marginTop: 24,
          padding: isMobile ? "18px" : styles$8.card.padding
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
                ...styles$8.sectionTitle,
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
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                color: "#93c5fd",
                fontSize: 13,
                marginTop: 6
              },
              children: ["Created by", " ", selectedHistoryQuote.created_by_name || selectedHistoryQuote.created_by_email || "Unknown user"]
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
        }), canAccess("sendToShopify") ? /* @__PURE__ */ jsxs(draftOrderFetcher.Form, {
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
            style: styles$8.buttonPrimary,
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
        }) : null, ((_j = draftOrderFetcher.data) == null ? void 0 : _j.message) ? /* @__PURE__ */ jsx("div", {
          style: {
            ...draftOrderFetcher.data.ok ? styles$8.statusOk : styles$8.statusErr,
            fontSize: isMobile ? 16 : void 0,
            fontWeight: isMobile ? 700 : void 0
          },
          children: draftOrderFetcher.data.message
        }) : null, ((_k = deleteQuoteFetcher.data) == null ? void 0 : _k.message) ? /* @__PURE__ */ jsx("div", {
          style: {
            ...deleteQuoteFetcher.data.ok ? styles$8.statusOk : styles$8.statusErr,
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
      children: [canAccess("quoteTool") ? /* @__PURE__ */ jsxs("a", {
        href: mobileDashboardHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "D"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dashboard"
        })]
      }) : null, /* @__PURE__ */ jsxs("a", {
        href: isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote",
        style: mobileTabLinkStyle(true),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(true),
          children: "Q"
        }), /* @__PURE__ */ jsx("span", {
          children: "Quote Tool"
        })]
      }), canAccess("reviewQuotes") ? /* @__PURE__ */ jsxs("a", {
        href: quoteReviewHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "R"
        }), /* @__PURE__ */ jsx("span", {
          children: "Review"
        })]
      }) : null, canAccess("dispatch") ? /* @__PURE__ */ jsxs("a", {
        href: dispatchHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "X"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dispatch"
        })]
      }) : null]
    }) : null]
  });
});
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$j,
  default: customQuote,
  loader: loader$e
}, Symbol.toStringTag, { value: "Module" }));
function formatMoney$1(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}
function buildQuoteSearchText(quote) {
  const lineText = (quote.line_items || []).map((line) => [line.title, line.sku, line.vendor, line.pricingLabel, line.audience, line.contractorTier].filter(Boolean).join(" ")).join(" ");
  const sourceText = Array.isArray(quote.source_breakdown) ? quote.source_breakdown.map((entry2) => [entry2 == null ? void 0 : entry2.vendor, ...Array.isArray(entry2 == null ? void 0 : entry2.items) ? entry2.items : []].filter(Boolean).join(" ")).join(" ") : "";
  return [quote.id, quote.customer_name, quote.customer_email, quote.customer_phone, quote.address1, quote.address2, quote.city, quote.province, quote.postal_code, quote.country, quote.service_name, quote.shipping_details, quote.description, quote.summary, quote.eta, quote.created_by_name, quote.created_by_email, lineText, sourceText].filter(Boolean).join(" ").toLowerCase();
}
const styles$7 = {
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
async function loader$d({
  request
}) {
  const url = new URL(request.url);
  const isEmbeddedRoute = url.pathname.startsWith("/app/");
  const reviewPath = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  if (url.searchParams.get("logout") === "1") {
    return redirect(reviewPath, {
      headers: [["Set-Cookie", await userAuthCookie.serialize("", {
        maxAge: 0
      })], ["Set-Cookie", await adminQuoteCookie.serialize("", {
        maxAge: 0
      })]]
    });
  }
  const allowed = await hasAdminQuotePermissionAccess(request, "reviewQuotes");
  const [quotes, currentUser] = allowed ? await Promise.all([getRecentCustomQuotes(250), getCurrentUser(request)]) : [[], null];
  return data({
    allowed,
    currentUser,
    quotes
  });
}
async function action$i({
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
  const currentUser = (actionData == null ? void 0 : actionData.currentUser) ?? loaderData.currentUser ?? null;
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
  const logoutHref = currentUser ? "/login?logout=1" : "?logout=1";
  const canAccess = (permission) => {
    var _a3;
    return !currentUser || ((_a3 = currentUser.permissions) == null ? void 0 : _a3.includes(permission));
  };
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
    ...styles$7.buttonGhost,
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
        ...styles$7.page,
        padding: isMobile ? "20px 14px 40px" : styles$7.page.padding
      },
      children: /* @__PURE__ */ jsx("div", {
        style: {
          ...styles$7.shell,
          maxWidth: 520
        },
        children: /* @__PURE__ */ jsxs("div", {
          style: styles$7.card,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$7.title,
            children: "Quote Review"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$7.subtitle,
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
              style: styles$7.label,
              children: "Admin Password"
            }), /* @__PURE__ */ jsx("input", {
              type: "password",
              name: "password",
              autoComplete: "current-password",
              style: styles$7.input
            }), (actionData == null ? void 0 : actionData.loginError) ? /* @__PURE__ */ jsx("div", {
              style: styles$7.statusErr,
              children: actionData.loginError
            }) : null, /* @__PURE__ */ jsx("button", {
              type: "submit",
              style: {
                ...styles$7.buttonPrimary,
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
      ...styles$7.page,
      padding: isMobile ? "20px 14px 120px" : styles$7.page.padding,
      overflowX: "clip"
    },
    children: [/* @__PURE__ */ jsxs("div", {
      style: styles$7.shell,
      children: [isMobile ? /* @__PURE__ */ jsxs("div", {
        style: {
          marginBottom: 18
        },
        children: [/* @__PURE__ */ jsx("h1", {
          style: {
            ...styles$7.title,
            fontSize: "2.2rem"
          },
          children: "Quote Review"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$7.subtitle,
          children: "Search across customer info, address, notes, SKU, product titles, vendors, and saved quote details."
        })]
      }) : /* @__PURE__ */ jsx("div", {
        style: styles$7.card,
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
              style: styles$7.title,
              children: "Quote Review"
            }), /* @__PURE__ */ jsx("p", {
              style: styles$7.subtitle,
              children: "Search across customer info, address, notes, SKU, product titles, vendors, and saved quote details."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              display: "flex",
              gap: 12,
              flexWrap: "wrap"
            },
            children: [canAccess("quoteTool") ? /* @__PURE__ */ jsx("a", {
              href: mobileDashboardHref,
              style: styles$7.buttonGhost,
              children: "Dashboard"
            }) : null, canAccess("quoteTool") ? /* @__PURE__ */ jsx("a", {
              href: quoteToolHref,
              style: styles$7.buttonGhost,
              children: "Open Quote Tool"
            }) : null, canAccess("dispatch") ? /* @__PURE__ */ jsx("a", {
              href: dispatchHref,
              style: styles$7.buttonGhost,
              children: "Dispatch"
            }) : null, canAccess("manageUsers") ? /* @__PURE__ */ jsx("a", {
              href: "/settings",
              style: styles$7.buttonGhost,
              children: "Settings"
            }) : null, currentUser ? /* @__PURE__ */ jsx("a", {
              href: "/change-password",
              style: styles$7.buttonGhost,
              children: "Change Password"
            }) : null, /* @__PURE__ */ jsx("a", {
              href: logoutHref,
              style: styles$7.buttonGhost,
              children: "Log Out"
            })]
          })]
        })
      }), /* @__PURE__ */ jsxs("div", {
        style: {
          ...styles$7.card,
          display: "grid",
          gap: 14,
          padding: isMobile ? "18px" : styles$7.card.padding
        },
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("label", {
            style: styles$7.label,
            children: "Search Saved Quotes"
          }), /* @__PURE__ */ jsx("input", {
            type: "search",
            value: query,
            onChange: (event) => setQuery(event.target.value),
            placeholder: "Search by customer, email, city, ZIP, summary, SKU, vendor, quote ID...",
            style: styles$7.input
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
            ...styles$7.card,
            maxHeight: isMobile ? "none" : "70vh",
            overflowY: isMobile ? "visible" : "auto",
            padding: isMobile ? "18px" : styles$7.card.padding
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
            ...styles$7.card,
            padding: isMobile ? "18px" : styles$7.card.padding
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
                }), /* @__PURE__ */ jsxs("div", {
                  style: {
                    color: "#93c5fd",
                    marginTop: 4,
                    fontSize: 14
                  },
                  children: ["Created by", " ", selectedQuote.created_by_name || selectedQuote.created_by_email || "Unknown user"]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  width: isMobile ? "100%" : void 0
                },
                children: [canAccess("sendToShopify") ? /* @__PURE__ */ jsxs(draftOrderFetcher.Form, {
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
                      ...styles$7.buttonPrimary,
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
                }) : null, /* @__PURE__ */ jsx("button", {
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
                ...draftOrderFetcher.data.ok ? styles$7.statusOk : styles$7.statusErr,
                fontSize: isMobile ? 16 : void 0,
                fontWeight: isMobile ? 700 : void 0
              },
              children: draftOrderFetcher.data.message
            }) : null, ((_e = deleteQuoteFetcher.data) == null ? void 0 : _e.message) ? /* @__PURE__ */ jsx("div", {
              style: {
                ...deleteQuoteFetcher.data.ok ? styles$7.statusOk : styles$7.statusErr,
                fontSize: isMobile ? 16 : void 0,
                fontWeight: isMobile ? 700 : void 0
              },
              children: deleteQuoteFetcher.data.message
            }) : null, ((_f = updateQuoteFetcher.data) == null ? void 0 : _f.message) ? /* @__PURE__ */ jsx("div", {
              style: {
                ...updateQuoteFetcher.data.ok ? styles$7.statusOk : styles$7.statusErr,
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
                    style: styles$7.label,
                    children: "Customer Name"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "customerName",
                    defaultValue: selectedQuote.customer_name || "",
                    style: styles$7.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$7.label,
                    children: "Email"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "customerEmail",
                    defaultValue: selectedQuote.customer_email || "",
                    style: styles$7.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$7.label,
                    children: "Phone"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "customerPhone",
                    defaultValue: selectedQuote.customer_phone || "",
                    style: styles$7.input
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
                    style: styles$7.label,
                    children: "Address 1"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "address1",
                    defaultValue: selectedQuote.address1 || "",
                    style: styles$7.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$7.label,
                    children: "City"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "city",
                    defaultValue: selectedQuote.city || "",
                    style: styles$7.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$7.label,
                    children: "State"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "province",
                    defaultValue: selectedQuote.province || "",
                    style: styles$7.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$7.label,
                    children: "ZIP"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "postalCode",
                    defaultValue: selectedQuote.postal_code || "",
                    style: styles$7.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$7.label,
                    children: "Country"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "country",
                    defaultValue: selectedQuote.country || "US",
                    style: styles$7.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$7.label,
                  children: "Address 2"
                }), /* @__PURE__ */ jsx("input", {
                  name: "address2",
                  defaultValue: selectedQuote.address2 || "",
                  style: styles$7.input
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
                      style: styles$7.label,
                      children: "Quantity"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      name: `lineQuantity::${index}`,
                      defaultValue: line.quantity,
                      style: styles$7.input
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
                  style: styles$7.buttonPrimary,
                  children: updateQuoteFetcher.state === "submitting" ? "Regenerating..." : "Regenerate Quote"
                }), /* @__PURE__ */ jsx("button", {
                  type: "button",
                  onClick: () => setEditingQuoteId(null),
                  style: styles$7.buttonGhost,
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
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Created By:"
                    }), " ", selectedQuote.created_by_name || selectedQuote.created_by_email || "Unknown user", " ", "on ", new Date(selectedQuote.created_at).toLocaleString()]
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
      children: [canAccess("quoteTool") ? /* @__PURE__ */ jsxs("a", {
        href: mobileDashboardHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "D"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dashboard"
        })]
      }) : null, canAccess("quoteTool") ? /* @__PURE__ */ jsxs("a", {
        href: quoteToolHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "Q"
        }), /* @__PURE__ */ jsx("span", {
          children: "Quote Tool"
        })]
      }) : null, /* @__PURE__ */ jsxs("a", {
        href: isEmbeddedRoute ? "/app/quote-review" : "/quote-review",
        style: mobileTabLinkStyle(true),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(true),
          children: "R"
        }), /* @__PURE__ */ jsx("span", {
          children: "Review"
        })]
      }), canAccess("dispatch") ? /* @__PURE__ */ jsxs("a", {
        href: dispatchHref,
        style: mobileTabLinkStyle(false),
        children: [/* @__PURE__ */ jsx("span", {
          style: mobileTabIconStyle(false),
          children: "X"
        }), /* @__PURE__ */ jsx("span", {
          children: "Dispatch"
        })]
      }) : null]
    }) : null]
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$i,
  default: quoteReview,
  loader: loader$d
}, Symbol.toStringTag, { value: "Module" }));
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function getOrderDisplayNumber$3(order) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}
function getCustomerEmail(order) {
  const match = order.contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (match == null ? void 0 : match[0]) || "";
}
function formatDeliveredAt(order) {
  if (!order.deliveredAt) return (/* @__PURE__ */ new Date()).toLocaleString();
  return new Date(order.deliveredAt).toLocaleString();
}
function getQuantityColumns(order) {
  const unit = order.unit.toLowerCase();
  return {
    tons: /tons?/.test(unit) ? order.quantity : "",
    yards: /yards?/.test(unit) ? order.quantity : "",
    bags: /bags?/.test(unit) ? order.quantity : "",
    gallons: /gallons?/.test(unit) ? order.quantity : ""
  };
}
function buildDeliveryConfirmationEmail({
  order,
  route: route38
}) {
  const quantity = getQuantityColumns(order);
  const orderNumber = getOrderDisplayNumber$3(order);
  const deliveredAt = formatDeliveredAt(order);
  const driverName = order.signatureName || (route38 == null ? void 0 : route38.driver) || order.proofName || "";
  const photoProof = order.photoUrls || "Not captured";
  const gpsProof = order.signatureData || "Not captured";
  const subject = `Green Hills Supply delivery confirmation ${orderNumber}`;
  const text = [
    `Green Hills Supply Delivery Confirmation`,
    ``,
    `Order: ${orderNumber}`,
    `Delivered: ${deliveredAt}`,
    ``,
    `Driver and Truck Information`,
    `Truck: ${(route38 == null ? void 0 : route38.truck) || ""}`,
    `Driver: ${driverName}`,
    `Route: ${(route38 == null ? void 0 : route38.code) || ""}`,
    ``,
    `Customer Information`,
    `Customer: ${order.customer}`,
    `Address: ${order.address}, ${order.city}`,
    `Contact: ${order.contact || ""}`,
    ``,
    `Material Type: ${order.unit}`,
    `Product Ordered: ${order.material}`,
    `Quantity: ${order.quantity} ${order.unit}`,
    ``,
    `Delivery Notes: ${order.proofNotes || order.notes || ""}`,
    `Photo Proof: ${photoProof}`,
    `GPS Proof: ${gpsProof}`
  ].join("\n");
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#000000;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
    <div style="max-width:760px;margin:0 auto;background:#000000;padding:28px 24px 36px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td style="width:130px;border:2px solid #ffffff;padding:10px;text-align:center;vertical-align:middle;">
            <div style="font-size:18px;font-weight:900;line-height:1;color:#9ad20f;">GREEN</div>
            <div style="font-size:28px;font-weight:900;line-height:1;color:#ffffff;">HILLS</div>
          </td>
          <td style="padding-left:16px;vertical-align:middle;">
            <div style="border:2px solid #ffffff;padding:12px 14px;font-size:20px;font-weight:900;color:#ffffff;">
              Delivery Confirmation ${escapeHtml(orderNumber)}
            </div>
          </td>
        </tr>
      </table>

      ${sectionTitle("Driver and Truck Information")}
      <table role="presentation" width="100%" cellspacing="12" cellpadding="0" style="border-collapse:separate;margin-top:10px;">
        <tr>
          ${fieldCell("Truck Number", (route38 == null ? void 0 : route38.truck) || "")}
          ${fieldCell("Driver Name", driverName)}
        </tr>
        <tr>
          ${fieldCell("Order Number", orderNumber)}
          ${fieldCell("Delivered Date / Time", deliveredAt)}
        </tr>
      </table>

      ${sectionTitle("Customer Information")}
      <table role="presentation" width="100%" cellspacing="12" cellpadding="0" style="border-collapse:separate;margin-top:10px;">
        <tr>
          ${fieldCell("Customer Name", order.customer)}
          ${fieldCell("Customer Email / Contact", order.contact || "")}
        </tr>
        <tr>
          ${fieldCell("Address", `${order.address}, ${order.city}`)}
          ${fieldCell("Delivery Notes", order.notes || "")}
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:22px;">
        <tr>
          ${tableHeader("Material Type")}
          ${tableHeader("Product Ordered")}
          ${tableHeader("Total Tonnage Delivered")}
          ${tableHeader("Total Yardage Delivered")}
          ${tableHeader("Total Bags Delivered")}
          ${tableHeader("Total Gallons Delivered")}
        </tr>
        <tr>
          ${tableCell(order.unit)}
          ${tableCell(order.material)}
          ${tableCell(quantity.tons)}
          ${tableCell(quantity.yards)}
          ${tableCell(quantity.bags)}
          ${tableCell(quantity.gallons)}
        </tr>
      </table>

      ${sectionTitle("Delivery Proof")}
      <table role="presentation" width="100%" cellspacing="12" cellpadding="0" style="border-collapse:separate;margin-top:10px;">
        <tr>
          ${fieldCell("Driver Signature", driverName)}
          ${fieldCell("GPS Location Verification", gpsProof)}
        </tr>
        <tr>
          ${fieldCell("Picture of Delivered Order", photoProof)}
          ${fieldCell("Driver Notes Upon Delivery", order.proofNotes || "")}
        </tr>
      </table>

      <p style="margin:28px 0 0;color:#ffffff;font-size:14px;line-height:1.6;">
        Thank you for your order. If you have any questions about your delivery, please reply to this email or contact Green Hills Supply.
      </p>
    </div>
  </body>
</html>`;
  return { subject, html, text };
}
function sectionTitle(title) {
  return `<div style="margin-top:24px;background:#2368aa;color:#9ad20f;text-align:center;font-weight:900;padding:8px 10px;">${escapeHtml(title)}</div>`;
}
function fieldCell(label, value) {
  return `<td style="width:50%;border:2px solid #ffffff;padding:8px 10px;vertical-align:top;">
    <div style="color:#9ad20f;font-size:12px;font-weight:900;">${escapeHtml(label)}</div>
    <div style="color:#ffffff;font-size:14px;line-height:1.45;margin-top:4px;">${escapeHtml(value || " ")}</div>
  </td>`;
}
function tableHeader(label) {
  return `<th style="background:#2368aa;color:#9ad20f;border:1px solid #ffffff;padding:8px 6px;font-size:12px;line-height:1.2;text-align:center;">${escapeHtml(label)}</th>`;
}
function tableCell(value) {
  return `<td style="background:#ffffff;color:#000000;border:1px solid #777;padding:8px 6px;font-size:13px;text-align:center;">${escapeHtml(value || " ")}</td>`;
}
async function sendDeliveryConfirmationEmail({
  order,
  route: route38
}) {
  const to = getCustomerEmail(order);
  if (!to) return { sent: false, skipped: true, reason: "No customer email found." };
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.DELIVERY_CONFIRMATION_FROM;
  if (!resendApiKey || !from) {
    return {
      sent: false,
      skipped: true,
      reason: "Delivery email is not configured. Set RESEND_API_KEY and DELIVERY_CONFIRMATION_FROM."
    };
  }
  const email = buildDeliveryConfirmationEmail({ order, route: route38 });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Delivery confirmation email failed: ${body}`);
  }
  return { sent: true };
}
function readEmailField(raw, labels) {
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = raw.match(
      new RegExp(`^\\s*${escapedLabel}(?![\\w/.-])\\s*:?\\s*(.+)$`, "im")
    );
    if (match == null ? void 0 : match[1]) return match[1].trim();
  }
  return "";
}
function decodeQuotedPrintable(raw) {
  return raw.replace(/=\r?\n/g, "").replace(/(?:=[0-9A-F]{2})+/gi, (encoded) => {
    var _a2;
    const bytes = (_a2 = encoded.match(/=([0-9A-F]{2})/gi)) == null ? void 0 : _a2.map((part) => parseInt(part.slice(1), 16));
    return bytes ? Buffer.from(bytes).toString("utf8") : encoded;
  });
}
function normalizeEmailText(raw) {
  return decodeQuotedPrintable(raw).replace(/<style[\s\S]*?<\/style>/gi, "\n").replace(/<script[\s\S]*?<\/script>/gi, "\n").replace(/<head[\s\S]*?<\/head>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|table|h\d|td|th|li)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#215;|&#xD7;|&times;/gi, "x").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\r/g, "").replace(/^\s*=\s*$/gm, "").replace(/\s+=\s*$/gm, "").replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function textLines(raw) {
  return normalizeEmailText(raw).split("\n").map((line) => line.trim()).filter(Boolean);
}
function parseShopifyCustomer(raw) {
  var _a2, _b;
  const text = normalizeEmailText(raw);
  return ((_b = (_a2 = text.match(/new order from\s+([^:.\n]+)/i)) == null ? void 0 : _a2[1]) == null ? void 0 : _b.trim()) || "";
}
function parseShopifyOrderNumber(raw, subject = "") {
  var _a2, _b, _c, _d, _e, _f, _g, _h;
  const text = normalizeEmailText(raw);
  return ((_b = (_a2 = subject.match(/new order:\s*#?([A-Z0-9-]+)/i)) == null ? void 0 : _a2[1]) == null ? void 0 : _b.trim()) || ((_d = (_c = text.match(/new order:\s*#?([A-Z0-9-]+)/i)) == null ? void 0 : _c[1]) == null ? void 0 : _d.trim()) || ((_f = (_e = text.match(/order\s+#?([A-Z0-9-]+)\s*\(/i)) == null ? void 0 : _e[1]) == null ? void 0 : _f.trim()) || ((_h = (_g = text.match(/\border\s+#?([A-Z0-9-]+)/i)) == null ? void 0 : _g[1]) == null ? void 0 : _h.trim()) || "";
}
function cleanOrderNumber(value) {
  var _a2, _b;
  return ((_b = (_a2 = value.match(/#?\s*([A-Z0-9-]+)/i)) == null ? void 0 : _a2[1]) == null ? void 0 : _b.trim()) || "";
}
function isProductHeader(value) {
  return /^(product|quantity|price|unit|units|price units?|order summary)$/i.test(
    value.trim()
  );
}
function isShopifyProductBoundary(value) {
  return /^(billing address|shipping address|subtotal|shipping|tax|total|payment method|delivery or pickup preference date|please describe where|what happens next\??)$/i.test(
    value.trim()
  );
}
function isCountryOrAddressFragment(value) {
  const line = value.trim();
  return /^(?:united\s+states|states|ed\s+states)\s*\(us\)$/i.test(line) || /\b(?:united\s+states|states|ed\s+states)\s*\(us\)\b/i.test(line) || /^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(line) || /^\d{3,}/.test(line);
}
function isProductCandidate(value) {
  const line = cleanProductMaterial(value);
  return !isCountryOrAddressFragment(value) && !isCountryOrAddressFragment(line) && /[a-z]/i.test(line) && !isProductHeader(line) && !isShopifyProductBoundary(line) && !/@media|template_|max-width|font-|color:|background|border|padding|margin|display:|width:/i.test(line) && !/[{};]/.test(line) && !/^\(#?\d+\)$/i.test(line) && !/^#?\d+$/.test(line) && !/^order\s+#/i.test(line) && !/^(subtotal|shipping|tax|total|payment method):/i.test(line) && !/^\$/.test(line);
}
function cleanCityValue(value) {
  return value.replace(/\bUSA\b\.?/gi, "").replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ").trim();
}
function splitStreetAndCity(value) {
  const cleaned = value.trim();
  const cityStateZipMatch = cleaned.match(
    /^(.*?),\s*([^,]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?)(?:,\s*USA)?$/i
  );
  if (cityStateZipMatch) {
    return {
      address: cityStateZipMatch[1].trim(),
      city: cleanCityValue(cityStateZipMatch[2])
    };
  }
  const stateZipMatch = cleaned.match(
    /^(.*?)(?:,|\s{2,})\s*([^,\d]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)(?:,\s*USA)?$/i
  );
  if (stateZipMatch) {
    return {
      address: stateZipMatch[1].trim(),
      city: cleanCityValue(stateZipMatch[2])
    };
  }
  return { address: cleaned, city: "" };
}
function cleanQuantityValue(value) {
  var _a2, _b;
  const line = value.trim();
  return ((_a2 = line.match(/(?:x|\u00d7)\s*(\d+(?:\.\d+)?)/i)) == null ? void 0 : _a2[1]) || ((_b = line.match(/^(\d+(?:\.\d+)?)\s*(?:unit|units|ton|tons|yard|yards|gallon|gallons)?\b/i)) == null ? void 0 : _b[1]) || "";
}
function normalizeDispatchUnit(value, fallback = "Unit") {
  const unit = value.trim();
  if (!unit || /^(price|quantity|product|amount)$/i.test(unit)) return fallback;
  if (isCountryOrAddressFragment(unit)) return fallback;
  if (/yards?/i.test(unit)) return "Yard";
  if (/tons?/i.test(unit)) return "Ton";
  if (/gallons?/i.test(unit)) return "Gallons";
  if (/bags?/i.test(unit)) return "Bags";
  if (/units?/i.test(unit)) return "Unit";
  return unit;
}
function cleanProductMaterial(value) {
  return value.replace(/\b(?:united\s+states|states|ed\s+states)\s*\(us\)\s*/gi, "").replace(/^\s*(?:ed\s+)?states\s*\(us\)\s*/i, "").replace(/^(?:product|material|item)\s*:?\s*/i, "").replace(/\s*(?:x|\u00d7)\s*\d+(?:\.\d+)?\s*$/i, "").replace(/\s+\$?\d+(?:\.\d{2})?\s*$/i, "").replace(/\s{2,}/g, " ").trim();
}
function normalizeProductLookupText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function mapPriceUnitLabelToDispatchUnit(value) {
  const label = String(value || "").trim();
  if (/per\s+ton\b/i.test(label)) return "Ton";
  if (/per\s+yard\b/i.test(label)) return "Yard";
  if (/per\s+bag\b/i.test(label)) return "Bags";
  if (/per\s+gallon\b/i.test(label)) return "Gallons";
  return normalizeDispatchUnit(label, "");
}
function getLookupTokens(value) {
  return normalizeProductLookupText(value).split(" ").filter((token) => token.length > 1 && !/^\d+$/.test(token));
}
function getProductMatchScore(material, row) {
  const normalizedMaterial = normalizeProductLookupText(material);
  const normalizedTitle = normalizeProductLookupText(row.product_title || "");
  const normalizedSku = normalizeProductLookupText(row.sku || "");
  if (!normalizedMaterial || !normalizedTitle && !normalizedSku) return 0;
  if (normalizedTitle === normalizedMaterial || normalizedSku === normalizedMaterial) return 100;
  if (normalizedTitle.includes(normalizedMaterial)) return 90;
  if (normalizedMaterial.includes(normalizedTitle) && normalizedTitle.length > 3) return 80;
  if (normalizedSku && normalizedMaterial.includes(normalizedSku)) return 75;
  const materialTokens = getLookupTokens(material);
  const titleTokens = new Set(getLookupTokens(row.product_title || ""));
  if (!materialTokens.length || !titleTokens.size) return 0;
  const matched = materialTokens.filter((token) => titleTokens.has(token)).length;
  const score = Math.round(matched / materialTokens.length * 60);
  return matched >= Math.min(2, materialTokens.length) ? score : 0;
}
async function getDispatchUnitForMaterial(material) {
  var _a2, _b;
  const normalizedMaterial = normalizeProductLookupText(material);
  if (!normalizedMaterial) return "";
  let result = await supabaseAdmin.from("product_source_map").select("sku, product_title, unit_label, price_unit_label");
  if (((_a2 = result.error) == null ? void 0 : _a2.code) === "42703") {
    result = await supabaseAdmin.from("product_source_map").select("sku, product_title, unit_label");
  }
  if (result.error) {
    console.error("[DISPATCH UNIT LOOKUP ERROR]", result.error);
    return "";
  }
  const rows = (result.data || []).filter((row) => row.product_title);
  const bestMatch = (_b = rows.map((row) => ({
    row,
    score: getProductMatchScore(material, row)
  })).filter((entry2) => entry2.score > 0).sort((a, b) => b.score - a.score)[0]) == null ? void 0 : _b.row;
  return mapPriceUnitLabelToDispatchUnit(
    (bestMatch == null ? void 0 : bestMatch.unit_label) || (bestMatch == null ? void 0 : bestMatch.price_unit_label)
  );
}
async function getDispatchMaterialOptions() {
  const result = await supabaseAdmin.from("product_source_map").select("product_title").order("product_title", { ascending: true });
  if (result.error) {
    console.error("[DISPATCH MATERIAL OPTIONS ERROR]", result.error);
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  return (result.data || []).map((row) => String(row.product_title || "").trim()).filter((title) => {
    const key = title.toLowerCase();
    if (!title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function parseQuantityFromEmail(raw) {
  var _a2, _b;
  const normalized = normalizeEmailText(raw);
  return ((_a2 = normalized.match(/(?:^|\s)(?:x|\u00d7)\s*(\d+(?:\.\d+)?)(?:\s|$)/i)) == null ? void 0 : _a2[1]) || ((_b = normalized.match(/\bQuantity\b[\s:]+(\d+(?:\.\d+)?)/i)) == null ? void 0 : _b[1]) || "";
}
function parseShopifyProduct(raw) {
  const lines = textLines(raw);
  const quantityLineIndexes = lines.map((line, index) => ({ line, index })).filter(({ line, index }) => {
    if (!/(?:x|\u00d7)\s*\d+/i.test(line)) return false;
    const window2 = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 3)).join(" ");
    return /product|price|\(#?\d+\)|subtotal|shipping|tax|total/i.test(window2);
  }).map(({ index }) => index);
  const quantityLineIndex = quantityLineIndexes[0] ?? -1;
  const product = parseShopifyProductAtLine(raw, quantityLineIndex);
  if (product.material || product.quantity) return product;
  const productIndex = lines.findIndex((line) => /^product$/i.test(line));
  const material = lines.slice(productIndex >= 0 ? productIndex + 1 : 0).find(
    (line) => isProductCandidate(line)
  ) || "";
  let parsedQuantity = "";
  if (material) {
    const materialIndex = lines.findIndex((line) => line.includes(material));
    const nearbyLines = materialIndex >= 0 ? lines.slice(materialIndex + 1, Math.min(lines.length, materialIndex + 8)) : lines;
    parsedQuantity = nearbyLines.map((line) => cleanQuantityValue(line)).find(Boolean) || "";
  }
  if (!parsedQuantity) {
    parsedQuantity = parseQuantityFromEmail(raw);
  }
  return { material: cleanProductMaterial(material), quantity: parsedQuantity };
}
function parseShopifyProductAtLine(raw, quantityLineIndex) {
  var _a2;
  const lines = textLines(raw);
  if (quantityLineIndex < 0) return { material: "", quantity: "" };
  const quantity = ((_a2 = lines[quantityLineIndex].match(/(?:x|\u00d7)\s*(\d+(?:\.\d+)?)/i)) == null ? void 0 : _a2[1]) || "";
  let material = "";
  const sameLineBeforeQuantity = lines[quantityLineIndex].split(/(?:x|\u00d7)\s*\d+/i)[0].trim();
  const sameLineCandidates = sameLineBeforeQuantity.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
  material = sameLineCandidates.find(isProductCandidate) || "";
  const sameLineMaterial = lines[quantityLineIndex].replace(/(?:x|\u00d7)\s*\d+(?:\.\d+)?[\s\S]*$/i, "").trim();
  if (!material && sameLineMaterial && isProductCandidate(sameLineMaterial)) {
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
function parseShopifyProducts(raw) {
  const lines = textLines(raw);
  const productStart = lines.findIndex((line) => /^product$/i.test(line));
  const productEndCandidates = [
    lines.findIndex((line) => /^subtotal:?/i.test(line)),
    lines.findIndex((line) => /^billing address\b/i.test(line)),
    lines.findIndex((line) => /^shipping address\b/i.test(line))
  ].filter((index) => index > productStart);
  const productEnd = productStart >= 0 && productEndCandidates.length ? Math.min(...productEndCandidates) : lines.length;
  const quantityLineIndexes = lines.map((line, index) => ({ line, index })).filter(({ line, index }) => {
    if (productStart >= 0 && (index <= productStart || index >= productEnd)) {
      return false;
    }
    if (!/(?:x|\u00d7)\s*\d+/i.test(line)) return false;
    const window2 = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 3)).join(" ");
    return /product|price|\(#?\d+\)|subtotal|shipping|tax|total/i.test(window2);
  }).map(({ index }) => index);
  const products = quantityLineIndexes.map((index) => parseShopifyProductAtLine(raw, index)).filter((product) => product.material && product.quantity);
  const seen = /* @__PURE__ */ new Set();
  const uniqueProducts = products.filter((product) => {
    const key = `${product.material.toLowerCase()}::${product.quantity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return uniqueProducts.length ? uniqueProducts : [parseShopifyProduct(raw)].filter((product) => product.material);
}
function parseShopifyShipping(raw) {
  const lines = textLines(raw);
  const start = lines.findIndex((line) => /^shipping address\b/i.test(line));
  if (start < 0) return { customer: "", address: "", city: "", contact: "" };
  const block = [];
  for (const line of lines.slice(start)) {
    if (block.length && /^what happens next\??$/i.test(line)) break;
    if (block.length && /^billing address\b/i.test(line)) break;
    const stripped = line.replace(/^shipping address\s*/i, "").trim();
    if (stripped) block.push(stripped);
  }
  const cleaned = block.flatMap((line) => line.split(/\s{2,}/)).map((line) => line.trim()).filter(Boolean);
  const contact = cleaned.find((line) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line)) || "";
  const customer = cleaned.find((line) => !/\d/.test(line) && !/address/i.test(line) && !/,/.test(line)) || "";
  const rawAddress = cleaned.find((line) => /\d/.test(line) && !/^\d{7,}$/.test(line) && !/@/.test(line) && !/^\s*[A-Z]{2}\s+\d{5}/i.test(line)) || "";
  const splitAddress = splitStreetAndCity(rawAddress);
  const rawCity = cleaned.find((line) => /,\s*[A-Z]{2}\s+\d{5}/i.test(line)) || cleaned.find((line) => /\b[A-Z]{2}\s+\d{5}/i.test(line)) || "";
  const city = splitAddress.city || cleanCityValue(rawCity);
  return { customer, address: splitAddress.address, city, contact };
}
function parseShopifyDeliveryNotes(raw) {
  var _a2, _b;
  const text = normalizeEmailText(raw);
  return ((_b = (_a2 = text.match(/Please describe where you would like your order dropped off:\s*([\s\S]+?)(?:Billing address|Shipping address|What Happens Next\?|$)/i)) == null ? void 0 : _a2[1]) == null ? void 0 : _b.trim()) || "";
}
function isBadParsedValue(value) {
  return !value || /^=?\s*$/.test(value) || /^(price|price units?|quantity|unit|units)$/i.test(value);
}
function detectTimePreference(text) {
  if (/\bmorning\b|\bam\b|a\.m\./i.test(text)) return "Morning";
  if (/\bafternoon\b|\bnoon\b|\bpm\b|p\.m\./i.test(text)) return "Afternoon";
  if (/\bevening\b|\bnight\b/i.test(text)) return "Evening";
  return "";
}
function parseDispatchEmail(raw) {
  var _a2, _b, _c;
  const normalized = normalizeEmailText(raw);
  const shipping = parseShopifyShipping(raw);
  const shopifyProduct = parseShopifyProduct(raw);
  const shopifyProducts = parseShopifyProducts(raw);
  const shopifyNotes = parseShopifyDeliveryNotes(raw);
  const subject = readEmailField(normalized, ["Subject"]);
  const orderNumber = cleanOrderNumber(
    readEmailField(normalized, ["Order Number", "Order No"]) || parseShopifyOrderNumber(raw, subject)
  );
  const contact = readEmailField(normalized, ["Email", "Contact", "Customer Email"]) || shipping.contact || ((_a2 = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)) == null ? void 0 : _a2[0]) || "";
  const customer = readEmailField(normalized, ["Customer", "Client", "Name", "Company"]) || parseShopifyCustomer(raw) || shipping.customer || subject.replace(/^(order|delivery|quote)\s*[:-]\s*/i, "").trim();
  const address = readEmailField(normalized, [
    "Address",
    "Delivery Address",
    "Jobsite",
    "Job Site",
    "Ship To"
  ]) || shipping.address;
  const rawCity = readEmailField(normalized, ["City", "City/State", "Location"]) || shipping.city;
  const labelledMaterial = readEmailField(normalized, ["Material", "Product", "Item"]);
  const labelledQuantity = readEmailField(normalized, ["Quantity", "Qty", "Amount"]);
  const material = cleanProductMaterial(
    isBadParsedValue(labelledMaterial) ? shopifyProduct.material : labelledMaterial
  );
  const quantity = cleanQuantityValue(
    isBadParsedValue(labelledQuantity) ? shopifyProduct.quantity : labelledQuantity
  );
  const unit = normalizeDispatchUnit(readEmailField(normalized, ["Unit", "UOM"]), "Unit");
  const products = isBadParsedValue(labelledMaterial) ? shopifyProducts.map((product) => ({
    material: cleanProductMaterial(product.material),
    quantity: cleanQuantityValue(product.quantity)
  })) : [{ material, quantity }];
  const splitAddress = splitStreetAndCity(address);
  const cleanAddress = splitAddress.address;
  const city = cleanCityValue(splitAddress.city || rawCity);
  const requestedWindow = ((_c = (_b = normalized.match(/Delivery or Pickup Preference Date:\s*([^\n]+)/i)) == null ? void 0 : _b[1]) == null ? void 0 : _c.trim()) || readEmailField(normalized, ["Requested Window", "Delivery Window", "Requested Date", "Date", "When"]) || "Needs scheduling";
  const truckPreference = readEmailField(normalized, ["Truck", "Truck Preference", "Equipment"]);
  const notes = readEmailField(normalized, ["Notes", "Instructions", "Special Instructions"]) || shopifyNotes;
  const timePreference = detectTimePreference(`${requestedWindow}
${notes}
${normalized}`);
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
    notes
  };
}
function getLegacyTruckTons(capacity) {
  var _a2;
  return ((_a2 = String(capacity || "").match(/(\d+(?:\.\d+)?)\s*tons?/i)) == null ? void 0 : _a2[1]) || "";
}
function getLegacyTruckYards(capacity) {
  var _a2;
  return ((_a2 = String(capacity || "").match(/(\d+(?:\.\d+)?)\s*yards?/i)) == null ? void 0 : _a2[1]) || "";
}
const seedDispatchTrucks = [
  {
    id: "truck-12",
    label: "Truck 12",
    truckType: "Tri-axle",
    tons: "22",
    yards: "",
    capacity: "22 TonS",
    licensePlate: "GHS-12",
    isActive: true
  },
  {
    id: "truck-18",
    label: "Truck 18",
    truckType: "Walking floor",
    tons: "",
    yards: "25",
    capacity: "25 YardS",
    licensePlate: "GHS-18",
    isActive: true
  },
  {
    id: "truck-05",
    label: "Truck 05",
    truckType: "Tri-axle",
    tons: "22",
    yards: "",
    capacity: "22 TonS",
    licensePlate: "GHS-05",
    isActive: true
  }
];
const seedDispatchEmployees = [
  {
    id: "employee-paul",
    name: "Paul",
    role: "driver",
    phone: "",
    email: "",
    isActive: true
  },
  {
    id: "employee-peter",
    name: "Peter",
    role: "driver",
    phone: "",
    email: "",
    isActive: true
  },
  {
    id: "employee-andrew",
    name: "Andrew",
    role: "driver",
    phone: "",
    email: "",
    isActive: true
  },
  {
    id: "employee-manny",
    name: "Manny",
    role: "helper",
    phone: "",
    email: "",
    isActive: true
  },
  {
    id: "employee-luis",
    name: "Luis",
    role: "helper",
    phone: "",
    email: "",
    isActive: true
  },
  {
    id: "employee-nate",
    name: "Nate",
    role: "helper",
    phone: "",
    email: "",
    isActive: true
  }
];
const seedDispatchRoutes = [
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
    isActive: true
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
    isActive: true
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
const TRUCKS_TABLE = "dispatch_trucks";
const EMPLOYEES_TABLE = "dispatch_employees";
const SETTINGS_TABLE = "dispatch_settings";
function normalizeOrder(row) {
  const deliveryStatus = row.delivery_status === "en_route" || row.delivery_status === "arrived" || row.delivery_status === "delivered" || row.delivery_status === "issue" ? row.delivery_status : "not_started";
  const requestedWindow = String(row.requested_window || "");
  const notes = String(row.notes || "");
  const rawEmail = row.raw_email || null;
  const derivedQuantity = String(row.quantity || "") || (rawEmail ? parseQuantityFromEmail(String(rawEmail)) : "");
  const derivedTimePreference = row.time_preference || detectTimePreference(`${requestedWindow}
${notes}
${rawEmail || ""}`) || null;
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
    unit: normalizeDispatchUnit(String(row.unit || ""), "Unit"),
    requestedWindow,
    timePreference: derivedTimePreference,
    truckPreference: row.truck_preference || null,
    notes,
    status: row.status === "scheduled" || row.status === "hold" || row.status === "delivered" ? row.status : "new",
    assignedRouteId: row.assigned_route_id || null,
    stopSequence: row.stop_sequence === null || row.stop_sequence === void 0 ? null : Number(row.stop_sequence),
    deliveryStatus,
    eta: row.eta || null,
    travelMinutes: row.travel_minutes === null || row.travel_minutes === void 0 ? null : Number(row.travel_minutes),
    travelMiles: row.travel_miles === null || row.travel_miles === void 0 ? null : Number(row.travel_miles),
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
    updated_at: row.updated_at
  };
}
function normalizeRoute(row) {
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
    updated_at: row.updated_at
  };
}
function normalizeTruck(row) {
  const capacity = String(row.capacity || "");
  return {
    id: String(row.id),
    label: String(row.label || ""),
    truckType: String(row.truck_type || ""),
    tons: row.tons === null || row.tons === void 0 ? getLegacyTruckTons(capacity) : String(row.tons),
    yards: row.yards === null || row.yards === void 0 ? getLegacyTruckYards(capacity) : String(row.yards),
    capacity,
    licensePlate: row.license_plate || null,
    isActive: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function normalizeEmployee(row) {
  const role = row.role === "helper" || row.role === "dispatcher" ? row.role : "driver";
  return {
    id: String(row.id),
    name: String(row.name || ""),
    role,
    phone: row.phone || null,
    email: row.email || null,
    isActive: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function formatSupabaseError(error) {
  if (!error) return "Unknown storage error";
  return error.message || error.details || error.hint || "Unknown storage error";
}
function buildDispatchDestinationAddress(address, city) {
  return [address, city].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}
async function getDispatchOriginAddress() {
  const { data: data2, error } = await supabaseAdmin.from("origin_addresses").select("address").eq("is_active", true).limit(1).maybeSingle();
  if (error) {
    console.warn("[DISPATCH MAP ORIGIN ERROR]", formatSupabaseError(error));
  }
  return String((data2 == null ? void 0 : data2.address) || "").trim() || "W185 N7487 Narrow Ln, Menomonee Falls, WI 53051";
}
async function buildDispatchTravelPayload(address, city) {
  const destination = buildDispatchDestinationAddress(address, city);
  if (!destination) {
    return {
      travel_minutes: null,
      travel_miles: null,
      travel_summary: null
    };
  }
  const estimate = await getDispatchTravelEstimate(destination);
  if (!estimate || estimate.error) {
    return {
      travel_minutes: null,
      travel_miles: null,
      travel_summary: (estimate == null ? void 0 : estimate.summary) || (estimate == null ? void 0 : estimate.error) || null
    };
  }
  return {
    travel_minutes: estimate.minutes,
    travel_miles: estimate.miles,
    travel_summary: estimate.summary
  };
}
async function ensureSeedDispatchOrders() {
  if (process.env.DISPATCH_SEED_EXAMPLE_ORDERS !== "true") {
    return;
  }
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
      delivery_status: "not_started"
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
    seedDispatchRoutes.map((route38) => ({
      id: route38.id,
      code: route38.code,
      truck_id: route38.truckId || null,
      truck: route38.truck,
      driver_id: route38.driverId || null,
      driver: route38.driver,
      helper_id: route38.helperId || null,
      helper: route38.helper,
      color: route38.color,
      shift: route38.shift,
      region: route38.region,
      is_active: route38.isActive !== false
    }))
  );
  if (insertError) {
    throw new Error(formatSupabaseError(insertError));
  }
}
async function ensureSeedDispatchTrucks() {
  const { data: data2, error } = await supabaseAdmin.from(TRUCKS_TABLE).select("id", { count: "exact", head: false }).limit(1);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  if ((data2 || []).length > 0) return;
  const { error: insertError } = await supabaseAdmin.from(TRUCKS_TABLE).insert(
    seedDispatchTrucks.map((truck) => ({
      id: truck.id,
      label: truck.label,
      truck_type: truck.truckType,
      capacity: truck.capacity || "",
      tons: truck.tons || null,
      yards: truck.yards || null,
      license_plate: truck.licensePlate || null,
      is_active: truck.isActive !== false
    }))
  );
  if (insertError) {
    throw new Error(formatSupabaseError(insertError));
  }
}
async function ensureSeedDispatchEmployees() {
  const { data: data2, error } = await supabaseAdmin.from(EMPLOYEES_TABLE).select("id", { count: "exact", head: false }).limit(1);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  if ((data2 || []).length > 0) return;
  const { error: insertError } = await supabaseAdmin.from(EMPLOYEES_TABLE).insert(
    seedDispatchEmployees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      role: employee.role,
      phone: employee.phone || null,
      email: employee.email || null,
      is_active: employee.isActive !== false
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
async function getDispatchOrderByMailboxMessageId(messageId) {
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).select("*").eq("mailbox_message_id", messageId).maybeSingle();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return data2 ? normalizeOrder(data2) : null;
}
async function getDispatchRoutes() {
  const { data: data2, error } = await supabaseAdmin.from(ROUTES_TABLE).select("*").eq("is_active", true).order("created_at", { ascending: true });
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return (data2 || []).map(normalizeRoute);
}
function getDispatchLocalDate() {
  const timeZone = process.env.DISPATCH_RESET_TIMEZONE || "America/Chicago";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(/* @__PURE__ */ new Date());
}
async function resetDispatchRoutesForNewDay() {
  const today = getDispatchLocalDate();
  const settingKey = "last_daily_route_reset";
  const { data: setting, error: settingError } = await supabaseAdmin.from(SETTINGS_TABLE).select("value").eq("key", settingKey).maybeSingle();
  if (settingError) {
    console.error("[DISPATCH DAILY RESET SKIPPED]", formatSupabaseError(settingError));
    return { reset: false, date: today };
  }
  if ((setting == null ? void 0 : setting.value) === today) {
    return { reset: false, date: today };
  }
  const hasPreviousResetDate = Boolean(setting == null ? void 0 : setting.value);
  const { error: upsertError } = await supabaseAdmin.from(SETTINGS_TABLE).upsert({
    key: settingKey,
    value: today,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (upsertError) {
    console.error("[DISPATCH DAILY RESET SKIPPED]", formatSupabaseError(upsertError));
    return { reset: false, date: today };
  }
  if (!hasPreviousResetDate) {
    return { reset: false, date: today };
  }
  const { error: ordersError } = await supabaseAdmin.from(ORDERS_TABLE).update({
    status: "new",
    assigned_route_id: null,
    stop_sequence: null,
    eta: null,
    delivery_status: "not_started",
    arrived_at: null,
    departed_at: null
  }).neq("status", "delivered");
  if (ordersError) {
    throw new Error(formatSupabaseError(ordersError));
  }
  const { error: routesError } = await supabaseAdmin.from(ROUTES_TABLE).update({ is_active: false }).eq("is_active", true);
  if (routesError) {
    throw new Error(formatSupabaseError(routesError));
  }
  return { reset: true, date: today };
}
async function getDispatchTrucks() {
  const { data: data2, error } = await supabaseAdmin.from(TRUCKS_TABLE).select("*").eq("is_active", true).order("label", { ascending: true });
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return (data2 || []).map(normalizeTruck);
}
async function getDispatchEmployees() {
  const { data: data2, error } = await supabaseAdmin.from(EMPLOYEES_TABLE).select("*").eq("is_active", true).order("name", { ascending: true });
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return (data2 || []).map(normalizeEmployee);
}
async function createDispatchOrder(input) {
  const id = `D-${Date.now().toString().slice(-6)}`;
  const travelPayload = await buildDispatchTravelPayload(input.address, input.city);
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).insert({
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
    ...travelPayload
  }).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeOrder(data2);
}
async function getNextRouteStopSequence(routeId) {
  var _a2;
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).select("stop_sequence").eq("assigned_route_id", routeId).not("stop_sequence", "is", null).order("stop_sequence", { ascending: false }).limit(1);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  const currentMax = Number(((_a2 = data2 == null ? void 0 : data2[0]) == null ? void 0 : _a2.stop_sequence) || 0);
  return currentMax + 1;
}
async function createDispatchRoute(input) {
  const id = `route-${Date.now().toString(36)}`;
  const { data: data2, error } = await supabaseAdmin.from(ROUTES_TABLE).insert({
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
    is_active: true
  }).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeRoute(data2);
}
async function updateDispatchRoute(id, patch) {
  const payload = {};
  if (patch.code !== void 0) payload.code = patch.code;
  if (patch.truckId !== void 0) payload.truck_id = patch.truckId;
  if (patch.truck !== void 0) payload.truck = patch.truck;
  if (patch.driverId !== void 0) payload.driver_id = patch.driverId;
  if (patch.driver !== void 0) payload.driver = patch.driver;
  if (patch.helperId !== void 0) payload.helper_id = patch.helperId;
  if (patch.helper !== void 0) payload.helper = patch.helper;
  if (patch.color !== void 0) payload.color = patch.color;
  if (patch.shift !== void 0) payload.shift = patch.shift;
  if (patch.region !== void 0) payload.region = patch.region;
  const { data: data2, error } = await supabaseAdmin.from(ROUTES_TABLE).update(payload).eq("id", id).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeRoute(data2);
}
async function createDispatchTruck(input) {
  const id = `truck-${Date.now().toString(36)}`;
  const { data: data2, error } = await supabaseAdmin.from(TRUCKS_TABLE).insert({
    id,
    label: input.label,
    truck_type: input.truckType || "",
    capacity: "",
    tons: input.tons || null,
    yards: input.yards || null,
    license_plate: input.licensePlate || null,
    is_active: true
  }).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeTruck(data2);
}
async function updateDispatchTruck(id, patch) {
  const payload = {};
  if (patch.label !== void 0) payload.label = patch.label;
  if (patch.truckType !== void 0) payload.truck_type = patch.truckType;
  if (patch.tons !== void 0) payload.tons = patch.tons;
  if (patch.yards !== void 0) payload.yards = patch.yards;
  if (patch.licensePlate !== void 0) payload.license_plate = patch.licensePlate;
  const { data: data2, error } = await supabaseAdmin.from(TRUCKS_TABLE).update(payload).eq("id", id).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeTruck(data2);
}
async function deleteDispatchTruck(id) {
  const { data: data2, error } = await supabaseAdmin.from(TRUCKS_TABLE).update({ is_active: false }).eq("id", id).select("id");
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  if (!(data2 == null ? void 0 : data2.length)) {
    throw new Error(`No dispatch truck found for ${id}`);
  }
}
async function createDispatchEmployee(input) {
  const id = `employee-${Date.now().toString(36)}`;
  const { data: data2, error } = await supabaseAdmin.from(EMPLOYEES_TABLE).insert({
    id,
    name: input.name,
    role: input.role,
    phone: input.phone || null,
    email: input.email || null,
    is_active: true
  }).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeEmployee(data2);
}
async function updateDispatchEmployee(id, patch) {
  const payload = {};
  if (patch.name !== void 0) payload.name = patch.name;
  if (patch.role !== void 0) payload.role = patch.role;
  if (patch.phone !== void 0) payload.phone = patch.phone;
  if (patch.email !== void 0) payload.email = patch.email;
  const { data: data2, error } = await supabaseAdmin.from(EMPLOYEES_TABLE).update(payload).eq("id", id).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeEmployee(data2);
}
async function deleteDispatchEmployee(id) {
  const { data: data2, error } = await supabaseAdmin.from(EMPLOYEES_TABLE).update({ is_active: false }).eq("id", id).select("id");
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  if (!(data2 == null ? void 0 : data2.length)) {
    throw new Error(`No dispatch employee found for ${id}`);
  }
}
async function updateDispatchOrder(id, patch) {
  const payload = {};
  if (patch.status) payload.status = patch.status;
  if (patch.assignedRouteId !== void 0) {
    payload.assigned_route_id = patch.assignedRouteId;
  }
  if (patch.stopSequence !== void 0) {
    payload.stop_sequence = patch.stopSequence;
  }
  if (patch.deliveryStatus) payload.delivery_status = patch.deliveryStatus;
  if (patch.eta !== void 0) payload.eta = patch.eta;
  if (patch.arrivedAt !== void 0) payload.arrived_at = patch.arrivedAt;
  if (patch.departedAt !== void 0) payload.departed_at = patch.departedAt;
  if (patch.deliveredAt !== void 0) payload.delivered_at = patch.deliveredAt;
  if (patch.proofName !== void 0) payload.proof_name = patch.proofName;
  if (patch.proofNotes !== void 0) payload.proof_notes = patch.proofNotes;
  if (patch.emailSubject !== void 0) payload.email_subject = patch.emailSubject;
  if (patch.rawEmail !== void 0) payload.raw_email = patch.rawEmail;
  if (patch.mailboxMessageId !== void 0) payload.mailbox_message_id = patch.mailboxMessageId;
  if (patch.signatureName !== void 0) payload.signature_name = patch.signatureName;
  if (patch.signatureData !== void 0) payload.signature_data = patch.signatureData;
  if (patch.photoUrls !== void 0) payload.photo_urls = patch.photoUrls;
  if (patch.ticketNumbers !== void 0) payload.ticket_numbers = patch.ticketNumbers;
  if (patch.inspectionStatus !== void 0) payload.inspection_status = patch.inspectionStatus;
  if (patch.checklistJson !== void 0) payload.checklist_json = patch.checklistJson;
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).update(payload).eq("id", id).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeOrder(data2);
}
async function updateDispatchOrderDetails(id, patch) {
  const payload = {};
  if (patch.orderNumber !== void 0) payload.order_number = patch.orderNumber;
  if (patch.customer !== void 0) payload.customer = patch.customer;
  if (patch.contact !== void 0) payload.contact = patch.contact;
  if (patch.address !== void 0) payload.address = patch.address;
  if (patch.city !== void 0) payload.city = patch.city;
  if (patch.material !== void 0) payload.material = patch.material;
  if (patch.quantity !== void 0) payload.quantity = patch.quantity;
  if (patch.unit !== void 0) payload.unit = patch.unit;
  if (patch.requestedWindow !== void 0) {
    payload.requested_window = patch.requestedWindow;
  }
  if (patch.timePreference !== void 0) {
    payload.time_preference = patch.timePreference;
  }
  if (patch.truckPreference !== void 0) {
    payload.truck_preference = patch.truckPreference;
  }
  if (patch.notes !== void 0) payload.notes = patch.notes;
  if (patch.status !== void 0) payload.status = patch.status;
  if (patch.address !== void 0 || patch.city !== void 0) {
    const { data: current, error: currentError } = await supabaseAdmin.from(ORDERS_TABLE).select("address, city").eq("id", id).maybeSingle();
    if (currentError) {
      throw new Error(formatSupabaseError(currentError));
    }
    Object.assign(
      payload,
      await buildDispatchTravelPayload(
        patch.address !== void 0 ? patch.address : current == null ? void 0 : current.address,
        patch.city !== void 0 ? patch.city : current == null ? void 0 : current.city
      )
    );
  }
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).update(payload).eq("id", id).select("*").single();
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return normalizeOrder(data2);
}
async function deleteDispatchOrder(id) {
  const { data: data2, error } = await supabaseAdmin.from(ORDERS_TABLE).delete().eq("id", id).select("id");
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  if (!(data2 == null ? void 0 : data2.length)) {
    throw new Error(`No dispatch order found for ${id}`);
  }
}
let lastAutoPollAt = 0;
const DEFAULT_ORDER_SUBJECT_PREFIX = "You've Got A New Order: #";
function getMailboxConfig() {
  const host = process.env.DISPATCH_MAILBOX_HOST || "";
  const user = process.env.DISPATCH_MAILBOX_USER || "";
  const password = process.env.DISPATCH_MAILBOX_PASSWORD || "";
  if (!host || !user || !password) return null;
  return {
    host,
    port: Number(process.env.DISPATCH_MAILBOX_PORT || 993),
    user,
    password,
    mailbox: process.env.DISPATCH_MAILBOX_NAME || "INBOX",
    limit: Number(process.env.DISPATCH_MAILBOX_LIMIT || 10),
    markSeen: process.env.DISPATCH_MAILBOX_MARK_SEEN === "true",
    subjectPrefix: process.env.DISPATCH_MAILBOX_SUBJECT_PREFIX || DEFAULT_ORDER_SUBJECT_PREFIX
  };
}
function escapeImapString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function readHeader(raw, header) {
  const match = raw.match(new RegExp(`^${header}:\\s*(.+(?:\\r?\\n[\\t ].+)*)`, "im"));
  return ((match == null ? void 0 : match[1]) || "").replace(/\r?\n[\t ]+/g, " ").trim();
}
function getMessageBody(raw) {
  const split = raw.split(/\r?\n\r?\n/);
  return split.length > 1 ? split.slice(1).join("\n\n") : raw;
}
class SimpleImapClient {
  constructor(config) {
    __publicField(this, "socket");
    __publicField(this, "buffer", "");
    __publicField(this, "tagCounter", 1);
    this.socket = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host
    });
  }
  async connect() {
    await this.readUntil((text) => /^\* OK/im.test(text));
  }
  async command(command) {
    const tag = `A${String(this.tagCounter++).padStart(4, "0")}`;
    this.socket.write(`${tag} ${command}\r
`);
    return this.readUntil((text) => new RegExp(`^${tag} (OK|NO|BAD)`, "im").test(text));
  }
  close() {
    this.socket.end();
  }
  readUntil(done) {
    return new Promise((resolve, reject) => {
      const onData = (chunk) => {
        this.buffer += chunk.toString("utf8");
        if (!done(this.buffer)) return;
        const output = this.buffer;
        this.buffer = "";
        cleanup();
        resolve(output);
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.socket.off("data", onData);
        this.socket.off("error", onError);
      };
      this.socket.on("data", onData);
      this.socket.on("error", onError);
    });
  }
}
function parseSearchResponse(response) {
  var _a2;
  const line = ((_a2 = response.match(/^\* SEARCH\s+(.+)$/im)) == null ? void 0 : _a2[1]) || "";
  return line.split(/\s+/).map((uid) => uid.trim()).filter(Boolean);
}
function parseFetchResponse(uid, response) {
  var _a2;
  const literalMatch = response.match(/\{(\d+)\}\r?\n([\s\S]*)\r?\n\)/);
  const raw = (_a2 = literalMatch == null ? void 0 : literalMatch[2]) == null ? void 0 : _a2.trim();
  if (!raw) return null;
  const subject = readHeader(raw, "Subject");
  const messageId = readHeader(raw, "Message-ID") || `${uid}:${subject}`;
  const body = getMessageBody(raw);
  return {
    uid,
    messageId,
    subject,
    raw: `Subject: ${subject}
${body}`
  };
}
function summarizeSkipReasons(skipReasons) {
  const counts = skipReasons.reduce((summary, item) => {
    summary[item.reason] = (summary[item.reason] || 0) + 1;
    return summary;
  }, {});
  return Object.entries(counts).map(([reason, count]) => `${count} ${reason}`);
}
function suffixOrderNumber$1(orderNumber, index, total) {
  if (!orderNumber || total <= 1) return orderNumber;
  return `${orderNumber}${String.fromCharCode(97 + index)}`;
}
function suffixMailboxMessageId(messageId, index, total) {
  if (!messageId || total <= 1) return messageId;
  return `${messageId}#${String.fromCharCode(97 + index)}`;
}
async function fetchUnreadEmails(config) {
  const client = new SimpleImapClient(config);
  const emails = [];
  await client.connect();
  await client.command(`LOGIN ${escapeImapString(config.user)} ${escapeImapString(config.password)}`);
  await client.command(`SELECT ${escapeImapString(config.mailbox)}`);
  const searchResponse = await client.command(
    `UID SEARCH UNSEEN SUBJECT ${escapeImapString(config.subjectPrefix)}`
  );
  const uids = parseSearchResponse(searchResponse).slice(-config.limit);
  for (const uid of uids) {
    const fetchCommand = config.markSeen ? `UID FETCH ${uid} BODY[]` : `UID FETCH ${uid} BODY.PEEK[]`;
    const fetchResponse = await client.command(fetchCommand);
    const email = parseFetchResponse(uid, fetchResponse);
    if (email) emails.push(email);
  }
  await client.command("LOGOUT").catch(() => "");
  client.close();
  return emails;
}
async function pollDispatchMailbox() {
  var _a2;
  const config = getMailboxConfig();
  if (!config) {
    return {
      configured: false,
      imported: 0,
      skipped: 0,
      skipReasons: [],
      skipSummary: [],
      message: "Mailbox polling is not configured yet."
    };
  }
  const emails = await fetchUnreadEmails(config);
  let imported = 0;
  const skipReasons = [];
  for (const email of emails) {
    if (!email.subject.startsWith(config.subjectPrefix)) {
      skipReasons.push({
        uid: email.uid,
        subject: email.subject || "(No subject)",
        reason: `ignored because subject does not start with "${config.subjectPrefix}"`
      });
      continue;
    }
    const existing = await getDispatchOrderByMailboxMessageId(email.messageId) || await getDispatchOrderByMailboxMessageId(`${email.messageId}#a`);
    if (existing) {
      skipReasons.push({
        uid: email.uid,
        subject: email.subject || "(No subject)",
        reason: "skipped because it was already imported"
      });
      continue;
    }
    const parsed = parseDispatchEmail(email.raw);
    const products = ((_a2 = parsed.products) == null ? void 0 : _a2.length) ? parsed.products : [{ material: parsed.material, quantity: parsed.quantity }];
    if (!parsed.address || products.every((product) => !product.material)) {
      const missing = [
        !parsed.address ? "address" : "",
        products.every((product) => !product.material) ? "material" : ""
      ].filter(Boolean);
      skipReasons.push({
        uid: email.uid,
        subject: email.subject || "(No subject)",
        reason: `skipped because it is missing ${missing.join(" and ")}`
      });
      continue;
    }
    const validProducts = products.filter((product) => product.material);
    for (const [index, product] of validProducts.entries()) {
      await createDispatchOrder({
        source: "email",
        orderNumber: suffixOrderNumber$1(parsed.orderNumber, index, validProducts.length),
        customer: parsed.customer,
        contact: parsed.contact,
        address: parsed.address,
        city: parsed.city,
        material: product.material,
        quantity: product.quantity,
        unit: await getDispatchUnitForMaterial(product.material) || parsed.unit,
        requestedWindow: parsed.requestedWindow,
        timePreference: parsed.timePreference,
        truckPreference: parsed.truckPreference,
        notes: parsed.notes || "Imported from mailbox.",
        emailSubject: parsed.subject || email.subject,
        rawEmail: email.raw,
        mailboxMessageId: suffixMailboxMessageId(
          email.messageId,
          index,
          validProducts.length
        )
      });
      imported += 1;
    }
  }
  const skipSummary = summarizeSkipReasons(skipReasons);
  return {
    configured: true,
    imported,
    skipped: skipReasons.length,
    skipReasons,
    skipSummary,
    message: `Mailbox poll complete: ${imported} imported, ${skipReasons.length} skipped${skipSummary.length ? ` (${skipSummary.join("; ")})` : ""}.`
  };
}
async function maybeAutoPollDispatchMailbox() {
  if (process.env.DISPATCH_MAILBOX_AUTO_POLL !== "true") return null;
  if (process.env.DISPATCH_MAILBOX_AUTO_POLL_ON_LOAD !== "true") return null;
  const intervalSeconds = Number(process.env.DISPATCH_MAILBOX_POLL_SECONDS || 300);
  const now = Date.now();
  if (now - lastAutoPollAt < intervalSeconds * 1e3) return null;
  lastAutoPollAt = now;
  return pollDispatchMailbox();
}
function getDeliveryStatusLabel(status) {
  if (status === "en_route") return "Enroute";
  if (status === "delivered") return "Delivered";
  return "Dispatched";
}
function getDeliveryStatusColor(status) {
  if (status === "delivered") return "#22c55e";
  if (status === "en_route") return "#f97316";
  return "#38bdf8";
}
function getOrderDisplayNumber$2(order) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}
function isImageProof$2(value) {
  return /^data:image\//i.test(String(value || "")) || /^https?:\/\/.+\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i.test(String(value || ""));
}
function suffixOrderNumber(orderNumber, index, total) {
  if (!orderNumber || total <= 1) return orderNumber;
  return `${orderNumber}${String.fromCharCode(97 + index)}`;
}
function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function getRequestedDeliverySortValue(order) {
  var _a2;
  const value = String(order.requestedWindow || "").trim();
  const lower = value.toLowerCase();
  const today = /* @__PURE__ */ new Date();
  if (!value || /needs scheduling|unavailable|unknown/i.test(value)) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (/\btoday\b/.test(lower)) return startOfLocalDay(today);
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return startOfLocalDay(tomorrow);
  }
  const slashDate = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slashDate) {
    const year = slashDate[3].length === 2 ? 2e3 + Number(slashDate[3]) : Number(slashDate[3]);
    return new Date(year, Number(slashDate[1]) - 1, Number(slashDate[2])).getTime();
  }
  const monthDate = (_a2 = value.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?/i)) == null ? void 0 : _a2[0];
  if (monthDate) {
    const parsed2 = new Date(/\d{4}/.test(monthDate) ? monthDate : `${monthDate}, ${today.getFullYear()}`);
    if (!Number.isNaN(parsed2.getTime())) return startOfLocalDay(parsed2);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : startOfLocalDay(parsed);
}
function formatRequestedWindow(value) {
  const trimmed = value.trim();
  const dateInput = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateInput) return trimmed;
  return `${dateInput[2]}/${dateInput[3]}/${dateInput[1]}`;
}
function getTruckCapacityForOrderUnit(truck, unit) {
  if (/tons?/i.test(unit)) return Number(truck.tons || 0);
  if (/yards?/i.test(unit)) return Number(truck.yards || 0);
  return 0;
}
function getTruckCapacityLabel(unit) {
  if (/tons?/i.test(unit)) return "tons";
  if (/yards?/i.test(unit)) return "yards";
  return "";
}
function getCapacityError(order, truck) {
  if (!truck) return "This route does not have a truck assigned yet.";
  const quantity = Number(order.quantity || 0);
  const capacity = getTruckCapacityForOrderUnit(truck, order.unit);
  const capacityLabel = getTruckCapacityLabel(order.unit);
  if (!quantity || !capacity || !capacityLabel) return "";
  if (quantity <= capacity) return "";
  return `${order.customer} needs ${quantity} ${capacityLabel}, but ${truck.label} is set to ${capacity} ${capacityLabel}.`;
}
function buildChecklistJson$1(form) {
  return JSON.stringify({
    siteSafe: form.get("siteSafe") === "on",
    loadMatchesTicket: form.get("loadMatchesTicket") === "on",
    customerConfirmedPlacement: form.get("customerConfirmedPlacement") === "on",
    photosTaken: form.get("photosTaken") === "on",
    customChecklist: String(form.get("customChecklist") || "").trim()
  });
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
let googleMapsLoaderPromise = null;
function loadGoogleMaps(apiKey) {
  var _a2;
  if (typeof window === "undefined") return Promise.resolve();
  if ((_a2 = window.google) == null ? void 0 : _a2.maps) return Promise.resolve();
  if (googleMapsLoaderPromise) return googleMapsLoaderPromise;
  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-dispatch-google-maps="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), {
        once: true
      });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")), {
        once: true
      });
      return;
    }
    const script = document.createElement("script");
    script.dataset.dispatchGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return googleMapsLoaderPromise;
}
function RouteMapPreview({
  googleMapsApiKey,
  originAddress,
  routes: routes2
}) {
  const mapRef = useRef(null);
  const mapObjectsRef = useRef([]);
  const [status, setStatus] = useState("");
  const [routeWarnings, setRouteWarnings] = useState([]);
  const getTravelLabel = (order) => {
    if (order.travelMinutes) return `${order.travelMinutes} min RT`;
    return order.travelSummary || "RT not calculated";
  };
  const routePlan = useMemo(() => routes2.map((route38) => ({
    id: route38.id,
    color: route38.color || "#38bdf8",
    label: `${route38.code} · ${route38.truck}`,
    stops: route38.orders.map((order) => ({
      address: [order.address, order.city].map((part) => String(part || "").trim()).filter(Boolean).join(", "),
      customer: order.customer,
      travelLabel: getTravelLabel(order)
    })).filter((stop) => stop.address)
  })).filter((route38) => route38.stops.length > 0), [routes2]);
  useEffect(() => {
    let cancelled = false;
    async function drawMap() {
      if (!mapRef.current) return;
      if (!googleMapsApiKey) {
        setStatus("Add GOOGLE_MAPS_BROWSER_API_KEY to show the live route map.");
        return;
      }
      if (!originAddress) {
        setStatus("Set an active origin address before drawing routes.");
        return;
      }
      if (routePlan.length === 0) {
        setStatus("Assign orders to routes to preview truck paths.");
        return;
      }
      setStatus("Loading route map...");
      setRouteWarnings([]);
      try {
        await loadGoogleMaps(googleMapsApiKey);
        if (cancelled || !mapRef.current) return;
        const google = window.google;
        mapObjectsRef.current.forEach((object) => object.setMap(null));
        mapObjectsRef.current = [];
        const map = new google.maps.Map(mapRef.current, {
          center: {
            lat: 43.1789,
            lng: -88.1173
          },
          zoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true
        });
        const bounds = new google.maps.LatLngBounds();
        const directionsService = new google.maps.DirectionsService();
        const geocoder = new google.maps.Geocoder();
        const warnings = [];
        const addTimeBadge = (position, text, color) => {
          const badge = document.createElement("div");
          badge.textContent = text;
          badge.style.position = "absolute";
          badge.style.transform = "translate(12px, -34px)";
          badge.style.padding = "5px 8px";
          badge.style.borderRadius = "999px";
          badge.style.background = "rgba(15, 23, 42, 0.92)";
          badge.style.border = `1px solid ${color}99`;
          badge.style.boxShadow = "0 8px 18px rgba(2, 6, 23, 0.28)";
          badge.style.color = "#f8fafc";
          badge.style.fontSize = "11px";
          badge.style.fontWeight = "800";
          badge.style.whiteSpace = "nowrap";
          const overlay = new google.maps.OverlayView();
          overlay.onAdd = () => {
            var _a2;
            (_a2 = overlay.getPanes()) == null ? void 0 : _a2.overlayMouseTarget.appendChild(badge);
          };
          overlay.draw = () => {
            var _a2;
            const point = (_a2 = overlay.getProjection()) == null ? void 0 : _a2.fromLatLngToDivPixel(position);
            if (!point) return;
            badge.style.left = `${point.x}px`;
            badge.style.top = `${point.y}px`;
          };
          overlay.onRemove = () => {
            badge.remove();
          };
          overlay.setMap(map);
          mapObjectsRef.current.push(overlay);
        };
        const addStopMarker = (position, route38, stop, stopIndex) => {
          const marker = new google.maps.Marker({
            map,
            position,
            label: String(stopIndex + 1),
            title: `${stop.customer} · ${stop.travelLabel}`
          });
          mapObjectsRef.current.push(marker);
          addTimeBadge(position, stop.travelLabel, route38.color);
          bounds.extend(position);
        };
        const geocodeAddress = (address) => new Promise((resolve) => {
          geocoder.geocode({
            address
          }, (results, geocodeStatus) => {
            var _a2, _b;
            if (geocodeStatus === "OK" && ((_b = (_a2 = results == null ? void 0 : results[0]) == null ? void 0 : _a2.geometry) == null ? void 0 : _b.location)) {
              resolve(results[0].geometry.location);
              return;
            }
            console.warn("[DISPATCH MAP GEOCODE ERROR]", address, geocodeStatus);
            resolve(null);
          });
        });
        const drawFallbackRoute = async (route38) => {
          const points = (await Promise.all([originAddress, ...route38.stops.map((stop) => stop.address), originAddress].map((address) => geocodeAddress(address)))).filter(Boolean);
          if (points.length < 2) return false;
          const polyline = new google.maps.Polyline({
            map,
            path: points,
            strokeColor: route38.color,
            strokeOpacity: 0.82,
            strokeWeight: 5
          });
          mapObjectsRef.current.push(polyline);
          points.forEach((point, index) => {
            const isYard = index === 0 || index === points.length - 1;
            const marker = new google.maps.Marker({
              map,
              position: point,
              label: isYard ? "Y" : String(index),
              title: isYard ? "Yard" : `${route38.stops[index - 1].customer} · ${route38.stops[index - 1].travelLabel}`
            });
            mapObjectsRef.current.push(marker);
            if (!isYard) {
              addTimeBadge(point, route38.stops[index - 1].travelLabel, route38.color);
            }
            bounds.extend(point);
          });
          return true;
        };
        await Promise.all(routePlan.map((route38) => new Promise((resolve) => {
          const renderer = new google.maps.DirectionsRenderer({
            map,
            preserveViewport: true,
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: route38.color,
              strokeOpacity: 0.9,
              strokeWeight: 6
            }
          });
          mapObjectsRef.current.push(renderer);
          directionsService.route({
            origin: originAddress,
            destination: originAddress,
            waypoints: route38.stops.map((stop) => ({
              location: stop.address,
              stopover: true
            })),
            optimizeWaypoints: false,
            travelMode: google.maps.TravelMode.DRIVING
          }, async (result, routeStatus) => {
            var _a2, _b, _c, _d, _e, _f;
            if (result && routeStatus === "OK") {
              renderer.setDirections(result);
              (_c = (_b = (_a2 = result.routes) == null ? void 0 : _a2[0]) == null ? void 0 : _b.legs) == null ? void 0 : _c.forEach((leg) => {
                if (leg.start_location) bounds.extend(leg.start_location);
                if (leg.end_location) bounds.extend(leg.end_location);
              });
              const firstLeg = (_f = (_e = (_d = result.routes) == null ? void 0 : _d[0]) == null ? void 0 : _e.legs) == null ? void 0 : _f[0];
              if (firstLeg == null ? void 0 : firstLeg.start_location) {
                const yardMarker = new google.maps.Marker({
                  map,
                  position: firstLeg.start_location,
                  label: "Y",
                  title: "Yard"
                });
                mapObjectsRef.current.push(yardMarker);
              }
              route38.stops.forEach((stop, stopIndex) => {
                var _a3, _b2, _c2;
                const leg = (_c2 = (_b2 = (_a3 = result.routes) == null ? void 0 : _a3[0]) == null ? void 0 : _b2.legs) == null ? void 0 : _c2[stopIndex];
                if (leg == null ? void 0 : leg.end_location) {
                  addStopMarker(leg.end_location, route38, stop, stopIndex);
                }
              });
            } else {
              console.warn("[DISPATCH MAP ROUTE ERROR]", route38.label, routeStatus);
              renderer.setMap(null);
              const drewFallback = await drawFallbackRoute(route38);
              warnings.push(drewFallback ? `${route38.label}: showing fallback stop-to-stop lines because Google Directions returned ${routeStatus}.` : `${route38.label}: Google Directions returned ${routeStatus}, and the stop addresses could not be geocoded.`);
            }
            resolve();
          });
        })));
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds);
        }
        setStatus("");
        setRouteWarnings(warnings);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to load route map.");
      }
    }
    drawMap();
    return () => {
      cancelled = true;
      mapObjectsRef.current.forEach((object) => object.setMap(null));
      mapObjectsRef.current = [];
    };
  }, [googleMapsApiKey, originAddress, routePlan]);
  return /* @__PURE__ */ jsxs("div", {
    style: styles$6.mapStage,
    children: [/* @__PURE__ */ jsx("div", {
      ref: mapRef,
      style: styles$6.googleMapCanvas
    }), status ? /* @__PURE__ */ jsx("div", {
      style: styles$6.mapStatus,
      children: status
    }) : null, routeWarnings.length ? /* @__PURE__ */ jsx("div", {
      style: styles$6.mapNotice,
      children: routeWarnings.slice(0, 2).map((warning) => /* @__PURE__ */ jsx("div", {
        children: warning
      }, warning))
    }) : null, routePlan.length ? /* @__PURE__ */ jsx("div", {
      style: styles$6.mapLegend,
      children: routePlan.map((route38) => /* @__PURE__ */ jsxs("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8
        },
        children: [/* @__PURE__ */ jsx("div", {
          style: styles$6.routeColor(route38.color)
        }), /* @__PURE__ */ jsx("span", {
          children: route38.label
        })]
      }, route38.id))
    }) : null]
  });
}
function getDispatchPath$1(url) {
  return url.pathname.startsWith("/app/") ? "/app/dispatch" : "/dispatch";
}
function getBrowserGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_BROWSER_API_KEY || "";
}
async function loadDispatchState() {
  try {
    await Promise.all([ensureSeedDispatchTrucks(), ensureSeedDispatchEmployees(), ensureSeedDispatchOrders(), ensureSeedDispatchRoutes()]);
    if (process.env.DISPATCH_AUTO_DAILY_RESET === "true") {
      await resetDispatchRoutesForNewDay();
    }
    const [orders, routes2, trucks, employees, materialOptions, mapOriginAddress] = await Promise.all([getDispatchOrders(), getDispatchRoutes(), getDispatchTrucks(), getDispatchEmployees(), getDispatchMaterialOptions(), getDispatchOriginAddress()]);
    return {
      orders,
      routes: routes2,
      trucks,
      employees,
      materialOptions,
      mapOriginAddress,
      storageReady: true,
      storageError: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load dispatch storage";
    console.error("[DISPATCH STORAGE ERROR]", message);
    return {
      orders: seedDispatchOrders,
      routes: seedDispatchRoutes,
      trucks: seedDispatchTrucks,
      employees: seedDispatchEmployees,
      materialOptions: [],
      mapOriginAddress: "W185 N7487 Narrow Ln, Menomonee Falls, WI 53051",
      storageReady: false,
      storageError: message
    };
  }
}
async function loader$c({
  request
}) {
  const url = new URL(request.url);
  const dispatchPath = getDispatchPath$1(url);
  if (url.searchParams.get("logout") === "1") {
    return redirect(dispatchPath, {
      headers: [["Set-Cookie", await userAuthCookie.serialize("", {
        maxAge: 0
      })], ["Set-Cookie", await adminQuoteCookie.serialize("", {
        maxAge: 0
      })]]
    });
  }
  const allowed = await hasAdminQuotePermissionAccess(request, "dispatch");
  if (!allowed) {
    return data({
      allowed: false,
      orders: [],
      routes: [],
      trucks: [],
      employees: [],
      materialOptions: [],
      googleMapsApiKey: getBrowserGoogleMapsApiKey(),
      mapOriginAddress: "",
      storageReady: false,
      storageError: null
    });
  }
  const currentUser = await getCurrentUser(request);
  const requestedView = url.searchParams.get("view") || "dashboard";
  const manageOnlyViews = /* @__PURE__ */ new Set(["orders", "routes", "trucks", "employees"]);
  if (currentUser && manageOnlyViews.has(requestedView) && !currentUser.permissions.includes("manageDispatch")) {
    return redirect(dispatchPath);
  }
  const [dispatchState, mailboxStatus] = await Promise.all([loadDispatchState(), maybeAutoPollDispatchMailbox().catch((error) => {
    console.error("[DISPATCH MAILBOX AUTO POLL ERROR]", error);
    return {
      configured: true,
      imported: 0,
      skipped: 0,
      message: error instanceof Error ? error.message : "Mailbox auto-poll failed."
    };
  })]);
  return data({
    allowed: true,
    currentUser,
    mailboxStatus,
    googleMapsApiKey: getBrowserGoogleMapsApiKey(),
    ...dispatchState
  });
}
async function action$h({
  request
}) {
  var _a2, _b, _c;
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
        routes: [],
        trucks: [],
        employees: [],
        materialOptions: [],
        googleMapsApiKey: getBrowserGoogleMapsApiKey(),
        mapOriginAddress: ""
      }, {
        status: 401
      });
    }
    const dispatchState = await loadDispatchState();
    return data({
      allowed: true,
      loginError: null,
      googleMapsApiKey: getBrowserGoogleMapsApiKey(),
      ...dispatchState
    }, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("ok")
      }
    });
  }
  const allowed = await hasAdminQuotePermissionAccess(request, "dispatch");
  if (!allowed) {
    return data({
      allowed: false,
      loginError: "Please log in",
      orders: [],
      routes: [],
      trucks: [],
      employees: [],
      materialOptions: [],
      googleMapsApiKey: getBrowserGoogleMapsApiKey(),
      mapOriginAddress: ""
    }, {
      status: 401
    });
  }
  const canManageDispatch = await hasAdminQuotePermissionAccess(request, "manageDispatch");
  const driverOnlyIntents = /* @__PURE__ */ new Set(["update-stop-status"]);
  if (!canManageDispatch && !driverOnlyIntents.has(intent)) {
    const dispatchState = await loadDispatchState();
    return data({
      allowed: true,
      ok: false,
      message: "You do not have permission to manage dispatch.",
      googleMapsApiKey: getBrowserGoogleMapsApiKey(),
      ...dispatchState
    }, {
      status: 403
    });
  }
  try {
    if (process.env.DISPATCH_AUTO_DAILY_RESET === "true") {
      await resetDispatchRoutesForNewDay();
    }
    if (intent === "create-order") {
      const customer = String(form.get("customer") || "").trim();
      const rawAddress = String(form.get("address") || "").trim();
      const splitAddress = splitStreetAndCity(rawAddress);
      const address = splitAddress.address;
      const city = splitAddress.city || String(form.get("city") || "").trim();
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
        orderNumber: String(form.get("orderNumber") || "").trim(),
        customer,
        contact: String(form.get("contact") || "").trim(),
        address,
        city,
        material,
        quantity: String(form.get("quantity") || "").trim(),
        unit: await getDispatchUnitForMaterial(material) || String(form.get("unit") || "Ton").trim() || "Ton",
        requestedWindow: formatRequestedWindow(String(form.get("requestedWindow") || "")),
        timePreference: String(form.get("timePreference") || "").trim() || detectTimePreference(String(form.get("notes") || "")),
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
    if (intent === "parse-email-order") {
      const rawEmail = String(form.get("rawEmail") || "").trim();
      if (!rawEmail) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Paste the order email before parsing.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const parsed = parseDispatchEmail(rawEmail);
      const parsedProducts = ((_a2 = parsed.products) == null ? void 0 : _a2.length) ? parsed.products : [{
        material: parsed.material,
        quantity: parsed.quantity
      }];
      const validProducts = parsedProducts.filter((product) => product.material);
      if (!parsed.address || !validProducts.length) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "I could not find an address and material in that email. Add labels like Address: and Material: and try again.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const createdOrders = [];
      for (const [index, product] of validProducts.entries()) {
        const created = await createDispatchOrder({
          source: "email",
          orderNumber: suffixOrderNumber(parsed.orderNumber, index, validProducts.length),
          customer: parsed.customer,
          contact: parsed.contact,
          address: parsed.address,
          city: parsed.city,
          material: product.material,
          quantity: product.quantity,
          unit: await getDispatchUnitForMaterial(product.material) || parsed.unit,
          requestedWindow: parsed.requestedWindow,
          timePreference: parsed.timePreference,
          truckPreference: parsed.truckPreference,
          notes: parsed.notes || "Parsed from order email.",
          emailSubject: parsed.subject,
          rawEmail
        });
        createdOrders.push(created);
      }
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: createdOrders.length > 1 ? `Parsed ${createdOrders.length} tickets from order ${parsed.orderNumber}.` : `Parsed email order for ${createdOrders[0].customer}.`,
        selectedOrderId: createdOrders[0].id,
        ...dispatchState
      });
    }
    if (intent === "update-order") {
      const orderId = String(form.get("orderId") || "").trim();
      const customer = String(form.get("customer") || "").trim();
      const rawAddress = String(form.get("address") || "").trim();
      const splitAddress = splitStreetAndCity(rawAddress);
      const address = splitAddress.address;
      const city = splitAddress.city || String(form.get("city") || "").trim();
      const material = String(form.get("material") || "").trim();
      const unit = await getDispatchUnitForMaterial(material) || String(form.get("unit") || "").trim() || "Unit";
      const rawStatus = String(form.get("status") || "new").trim();
      const status = rawStatus === "scheduled" || rawStatus === "hold" || rawStatus === "delivered" ? rawStatus : "new";
      const routeId = String(form.get("routeId") || "").trim();
      const eta = String(form.get("eta") || "").trim() || null;
      if (!orderId || !customer || !address || !material) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Order, customer, address, and material are required.",
          selectedOrderId: orderId,
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const updated = await updateDispatchOrderDetails(orderId, {
        orderNumber: String(form.get("orderNumber") || "").trim() || null,
        customer,
        contact: String(form.get("contact") || "").trim(),
        address,
        city,
        material,
        quantity: String(form.get("quantity") || "").trim(),
        unit,
        requestedWindow: String(form.get("requestedWindow") || "").trim() || "Needs scheduling",
        timePreference: String(form.get("timePreference") || "").trim() || detectTimePreference(String(form.get("notes") || "")),
        truckPreference: String(form.get("truckPreference") || "").trim() || null,
        notes: String(form.get("notes") || "").trim(),
        status
      });
      let finalOrder = updated;
      if (form.has("routeId")) {
        if (routeId) {
          const [allRoutes, allTrucks] = await Promise.all([getDispatchRoutes(), getDispatchTrucks()]);
          const selectedRoute = allRoutes.find((route38) => route38.id === routeId);
          const selectedTruck = allTrucks.find((truck) => truck.id === (selectedRoute == null ? void 0 : selectedRoute.truckId));
          const capacityError = getCapacityError(updated, selectedTruck);
          if (!selectedRoute || capacityError) {
            const dispatchState2 = await loadDispatchState();
            return data({
              allowed: true,
              ok: false,
              message: !selectedRoute ? "Select a valid route before assigning this order." : capacityError,
              selectedOrderId: orderId,
              ...dispatchState2
            }, {
              status: 400
            });
          }
          const stopSequence = updated.assignedRouteId === routeId && updated.stopSequence ? updated.stopSequence : await getNextRouteStopSequence(routeId);
          finalOrder = await updateDispatchOrder(orderId, {
            status: status === "delivered" ? "delivered" : "scheduled",
            assignedRouteId: routeId,
            stopSequence,
            deliveryStatus: status === "delivered" ? "delivered" : updated.deliveryStatus || "not_started",
            eta
          });
        } else {
          finalOrder = await updateDispatchOrder(orderId, {
            status: status === "delivered" || status === "hold" ? status : "new",
            assignedRouteId: null,
            stopSequence: null,
            deliveryStatus: status === "delivered" ? "delivered" : "not_started",
            eta: null
          });
        }
      }
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: `Updated ${finalOrder.customer}.`,
        selectedOrderId: finalOrder.id,
        ...dispatchState
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
        selectedOrderId: (_b = dispatchState.orders[0]) == null ? void 0 : _b.id,
        ...dispatchState
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
        ...dispatchState
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
        truckId: selectedTruck.id,
        truck: selectedTruck.label,
        driverId: selectedDriver.id,
        driver: selectedDriver.name,
        helperId: selectedHelper == null ? void 0 : selectedHelper.id,
        helper: (selectedHelper == null ? void 0 : selectedHelper.name) || "",
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
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Route and route code are required.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      if (selectedTruck) {
        const assignedOrders = (await getDispatchOrders()).filter((order) => order.assignedRouteId === routeId && order.status !== "delivered");
        const capacityError = assignedOrders.map((order) => getCapacityError(order, selectedTruck)).find(Boolean);
        if (capacityError) {
          const dispatchState2 = await loadDispatchState();
          return data({
            allowed: true,
            ok: false,
            message: capacityError,
            ...dispatchState2
          }, {
            status: 400
          });
        }
      }
      const updated = await updateDispatchRoute(routeId, {
        code,
        truckId: (selectedTruck == null ? void 0 : selectedTruck.id) || null,
        truck: (selectedTruck == null ? void 0 : selectedTruck.label) || "",
        driverId: (selectedDriver == null ? void 0 : selectedDriver.id) || null,
        driver: (selectedDriver == null ? void 0 : selectedDriver.name) || "",
        helperId: (selectedHelper == null ? void 0 : selectedHelper.id) || null,
        helper: (selectedHelper == null ? void 0 : selectedHelper.name) || "",
        color: String(form.get("color") || "#38bdf8").trim(),
        shift: String(form.get("shift") || "").trim(),
        region: String(form.get("region") || "").trim()
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: `Updated ${updated.code}.`,
        ...dispatchState
      });
    }
    if (intent === "create-truck") {
      const label = String(form.get("label") || "").trim();
      if (!label) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Truck name is required.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const created = await createDispatchTruck({
        label,
        truckType: String(form.get("truckType") || "").trim(),
        tons: String(form.get("tons") || "").trim(),
        yards: String(form.get("yards") || "").trim(),
        licensePlate: String(form.get("licensePlate") || "").trim()
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: `Added ${created.label} to the fleet.`,
        ...dispatchState
      });
    }
    if (intent === "update-truck") {
      const truckId = String(form.get("truckId") || "").trim();
      const label = String(form.get("label") || "").trim();
      if (!truckId || !label) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Truck and truck name are required.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const updated = await updateDispatchTruck(truckId, {
        label,
        truckType: String(form.get("truckType") || "").trim(),
        tons: String(form.get("tons") || "").trim() || null,
        yards: String(form.get("yards") || "").trim() || null,
        licensePlate: String(form.get("licensePlate") || "").trim() || null
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: `Updated ${updated.label}.`,
        ...dispatchState
      });
    }
    if (intent === "delete-truck") {
      const truckId = String(form.get("truckId") || "").trim();
      if (!truckId) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Truck is required.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      await deleteDispatchTruck(truckId);
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: "Deleted truck from active fleet.",
        ...dispatchState
      });
    }
    if (intent === "create-employee") {
      const name = String(form.get("name") || "").trim();
      const rawRole = String(form.get("role") || "driver").trim();
      const role = rawRole === "helper" || rawRole === "dispatcher" ? rawRole : "driver";
      if (!name) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Employee name is required.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const created = await createDispatchEmployee({
        name,
        role,
        phone: String(form.get("phone") || "").trim(),
        email: String(form.get("email") || "").trim()
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: `Added ${created.name} to employees.`,
        ...dispatchState
      });
    }
    if (intent === "update-employee") {
      const employeeId = String(form.get("employeeId") || "").trim();
      const name = String(form.get("name") || "").trim();
      const rawRole = String(form.get("role") || "driver").trim();
      const role = rawRole === "helper" || rawRole === "dispatcher" ? rawRole : "driver";
      if (!employeeId || !name) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Employee and employee name are required.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const updated = await updateDispatchEmployee(employeeId, {
        name,
        role,
        phone: String(form.get("phone") || "").trim() || null,
        email: String(form.get("email") || "").trim() || null
      });
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: `Updated ${updated.name}.`,
        ...dispatchState
      });
    }
    if (intent === "delete-employee") {
      const employeeId = String(form.get("employeeId") || "").trim();
      if (!employeeId) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: "Employee is required.",
          ...dispatchState2
        }, {
          status: 400
        });
      }
      await deleteDispatchEmployee(employeeId);
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: "Deleted employee from active roster.",
        ...dispatchState
      });
    }
    if (intent === "assign-order") {
      const orderId = String(form.get("orderId") || "").trim();
      const routeId = String(form.get("routeId") || "").trim();
      if (!orderId || !routeId) {
        throw new Error("Missing order or route assignment details");
      }
      const [allOrders, allRoutes, allTrucks] = await Promise.all([getDispatchOrders(), getDispatchRoutes(), getDispatchTrucks()]);
      const selectedOrder = allOrders.find((order) => order.id === orderId);
      const selectedRoute = allRoutes.find((route38) => route38.id === routeId);
      const selectedTruck = allTrucks.find((truck) => truck.id === (selectedRoute == null ? void 0 : selectedRoute.truckId));
      const capacityError = selectedOrder ? getCapacityError(selectedOrder, selectedTruck) : "Order was not found.";
      if (capacityError) {
        const dispatchState2 = await loadDispatchState();
        return data({
          allowed: true,
          ok: false,
          message: capacityError,
          selectedOrderId: orderId,
          ...dispatchState2
        }, {
          status: 400
        });
      }
      const stopSequence = await getNextRouteStopSequence(routeId);
      await updateDispatchOrder(orderId, {
        status: "scheduled",
        assignedRouteId: routeId,
        stopSequence,
        deliveryStatus: "not_started",
        eta: String(form.get("eta") || "").trim() || null
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
    if (intent === "sequence-route") {
      const routeId = String(form.get("routeId") || "").trim();
      const mode = String(form.get("sequenceMode") || "city").trim();
      if (!routeId) throw new Error("Missing route selection");
      const routeOrders = (await getDispatchOrders()).filter((order) => order.assignedRouteId === routeId).sort((a, b) => {
        if (mode === "reverse") {
          return Number(b.stopSequence || 0) - Number(a.stopSequence || 0);
        }
        if (mode === "address") {
          return `${a.address} ${a.city}`.localeCompare(`${b.address} ${b.city}`);
        }
        return `${a.city} ${a.address}`.localeCompare(`${b.city} ${b.address}`);
      });
      await Promise.all(routeOrders.map((order, index) => updateDispatchOrder(order.id, {
        stopSequence: index + 1
      })));
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: "Route stop sequence updated.",
        selectedOrderId: (_c = routeOrders[0]) == null ? void 0 : _c.id,
        ...dispatchState
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
        eta: null
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
        assignedRouteId: null,
        stopSequence: null,
        deliveryStatus: "not_started",
        eta: null
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
    if (intent === "update-stop-status") {
      const orderId = String(form.get("orderId") || "").trim();
      const rawDeliveryStatus = String(form.get("deliveryStatus") || "").trim();
      const deliveryStatus = rawDeliveryStatus === "en_route" || rawDeliveryStatus === "delivered" || rawDeliveryStatus === "not_started" ? rawDeliveryStatus : "not_started";
      if (!orderId) throw new Error("Missing order selection");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const patch = {
        deliveryStatus,
        proofName: String(form.get("proofName") || "").trim() || null,
        proofNotes: String(form.get("proofNotes") || "").trim() || null,
        signatureName: String(form.get("signatureName") || "").trim() || null,
        signatureData: String(form.get("signatureData") || "").trim() || null,
        photoUrls: String(form.get("photoUrls") || "").trim() || null,
        inspectionStatus: String(form.get("inspectionStatus") || "").trim() || null,
        checklistJson: buildChecklistJson$1(form)
      };
      if (deliveryStatus === "en_route") patch.departedAt = now;
      if (deliveryStatus === "delivered") {
        patch.status = "delivered";
        patch.departedAt = patch.departedAt || now;
        patch.deliveredAt = now;
      }
      const updatedOrder = await updateDispatchOrder(orderId, patch);
      const route38 = updatedOrder.assignedRouteId ? (await getDispatchRoutes()).find((entry2) => entry2.id === updatedOrder.assignedRouteId) || null : null;
      let emailNote = "";
      if (deliveryStatus === "delivered") {
        try {
          const emailResult = await sendDeliveryConfirmationEmail({
            order: updatedOrder,
            route: route38
          });
          emailNote = emailResult.sent ? " Delivery confirmation email sent." : ` Delivery confirmation email skipped: ${emailResult.reason}`;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown email error.";
          emailNote = ` Delivery confirmation email failed: ${message}`;
        }
      }
      const dispatchState = await loadDispatchState();
      return data({
        allowed: true,
        ok: true,
        message: `Stop marked ${getDeliveryStatusLabel(deliveryStatus).toLowerCase()}.${emailNote}`,
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
  var _a2, _b;
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const assignmentFetcher = useFetcher();
  const location = useLocation();
  const allowed = (actionData == null ? void 0 : actionData.allowed) ?? loaderData.allowed;
  const currentUser = (actionData == null ? void 0 : actionData.currentUser) ?? loaderData.currentUser ?? null;
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const quoteHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const reviewHref = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  const mobileHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const logoutHref = `${dispatchHref}?logout=1`;
  const canAccess = (permission) => {
    var _a3;
    return !currentUser || ((_a3 = currentUser.permissions) == null ? void 0 : _a3.includes(permission));
  };
  const canManageDispatch = canAccess("manageDispatch");
  const orders = (actionData == null ? void 0 : actionData.orders) ?? loaderData.orders ?? [];
  const dispatchRoutes = (actionData == null ? void 0 : actionData.routes) ?? loaderData.routes ?? [];
  const trucks = (actionData == null ? void 0 : actionData.trucks) ?? loaderData.trucks ?? [];
  const employees = (actionData == null ? void 0 : actionData.employees) ?? loaderData.employees ?? [];
  const materialOptions = (actionData == null ? void 0 : actionData.materialOptions) ?? loaderData.materialOptions ?? [];
  const storageReady = (actionData == null ? void 0 : actionData.storageReady) ?? loaderData.storageReady ?? false;
  const storageError = (actionData == null ? void 0 : actionData.storageError) ?? loaderData.storageError ?? null;
  const mailboxStatus = (actionData == null ? void 0 : actionData.mailboxStatus) ?? loaderData.mailboxStatus ?? null;
  const googleMapsApiKey = (actionData == null ? void 0 : actionData.googleMapsApiKey) ?? loaderData.googleMapsApiKey ?? "";
  const mapOriginAddress = (actionData == null ? void 0 : actionData.mapOriginAddress) ?? loaderData.mapOriginAddress ?? "";
  const searchParams = new URLSearchParams(location.search);
  const rawView = searchParams.get("view") || "dashboard";
  const activeView = rawView === "orders" || rawView === "scheduled" || rawView === "routes" || rawView === "trucks" || rawView === "employees" || rawView === "delivered" ? rawView : "dashboard";
  useEffect(() => {
    if (!allowed || !googleMapsApiKey || activeView !== "orders") return;
    loadGooglePlaces(googleMapsApiKey).then(() => {
      attachAddressAutocomplete({
        address1Id: "dispatch-address",
        cityId: "dispatch-city",
        provinceId: "dispatch-province",
        postalCodeId: "dispatch-postal-code",
        countryId: "dispatch-country",
        cityFormat: "cityStateZip"
      });
    }).catch((error) => {
      console.error("[DISPATCH GOOGLE PLACES LOAD ERROR]", error);
    });
  }, [allowed, googleMapsApiKey, activeView]);
  const querySelectedOrderId = searchParams.get("order");
  const queryDashboardSelectedOrderId = searchParams.get("selected");
  const selectedOrderId = (actionData == null ? void 0 : actionData.selectedOrderId) || queryDashboardSelectedOrderId || querySelectedOrderId || ((_a2 = orders[0]) == null ? void 0 : _a2.id);
  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) || orders[0] || null, [orders, selectedOrderId]);
  const routes2 = useMemo(() => dispatchRoutes.map((route38) => {
    const routeOrders = orders.filter((order) => order.assignedRouteId === route38.id && order.status !== "delivered" && order.deliveryStatus !== "delivered").sort((a, b) => Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999));
    return {
      ...route38,
      stops: routeOrders.length,
      loadSummary: routeOrders.map((order) => `${order.quantity} ${order.unit} ${order.material}`).slice(0, 2).join(" • "),
      orders: routeOrders
    };
  }), [dispatchRoutes, orders]);
  const selectedOrderRoute = (selectedOrder == null ? void 0 : selectedOrder.assignedRouteId) ? routes2.find((route38) => route38.id === selectedOrder.assignedRouteId) || null : null;
  const activeOrders = useMemo(() => orders.filter((order) => !order.assignedRouteId && order.status !== "scheduled" && order.status !== "delivered" && order.deliveryStatus !== "delivered").sort((a, b) => {
    const dateDiff = getRequestedDeliverySortValue(a) - getRequestedDeliverySortValue(b);
    if (dateDiff !== 0) return dateDiff;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  }), [orders]);
  const inboxOrders = orders.filter((order) => !order.assignedRouteId && order.status === "new");
  const holdOrders = orders.filter((order) => order.status === "hold");
  const scheduledOrders = useMemo(() => orders.filter((order) => order.assignedRouteId && order.status !== "delivered" && order.deliveryStatus !== "delivered").sort((a, b) => {
    const dateDiff = getRequestedDeliverySortValue(a) - getRequestedDeliverySortValue(b);
    if (dateDiff !== 0) return dateDiff;
    return Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999);
  }), [orders]);
  const deliveredOrders = orders.filter((order) => order.status === "delivered" || order.deliveryStatus === "delivered");
  const drivers = employees.filter((employee) => employee.role === "driver");
  const helpers = employees.filter((employee) => employee.role === "helper");
  const dispatchViewHref = (view) => `${dispatchHref}?view=${view}`;
  const dashboardSelectHref = (orderId) => `${dispatchHref}?selected=${encodeURIComponent(orderId)}`;
  const dashboardDetailHref = (orderId) => `${dispatchHref}?order=${encodeURIComponent(orderId)}&detail=1`;
  const orderEditorOpen = activeView === "orders" && Boolean(selectedOrder && (querySelectedOrderId || (actionData == null ? void 0 : actionData.selectedOrderId)));
  const dispatchDetailOpen = activeView === "dashboard" && searchParams.get("detail") === "1" && Boolean(selectedOrder && querySelectedOrderId);
  const deliveredDetailOpen = activeView === "delivered" && searchParams.get("detail") === "1" && Boolean(selectedOrder && querySelectedOrderId);
  const [draggedOrderId, setDraggedOrderId] = useState(null);
  const [dragOverRouteId, setDragOverRouteId] = useState(null);
  const [dragOverQueue, setDragOverQueue] = useState(false);
  assignmentFetcher.state === "submitting";
  function getDraggedOrderId(event) {
    return event.dataTransfer.getData("application/x-dispatch-order-id") || event.dataTransfer.getData("text/plain") || draggedOrderId || "";
  }
  function startOrderDrag(orderId, event) {
    if (!canManageDispatch) return;
    setDraggedOrderId(orderId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-dispatch-order-id", orderId);
    event.dataTransfer.setData("text/plain", orderId);
  }
  function clearDragState() {
    setDraggedOrderId(null);
    setDragOverRouteId(null);
    setDragOverQueue(false);
  }
  function assignDraggedOrder(routeId, event) {
    event.preventDefault();
    const orderId = getDraggedOrderId(event);
    clearDragState();
    if (!orderId || !routeId || !canManageDispatch) return;
    assignmentFetcher.submit({
      intent: "assign-order",
      orderId,
      routeId,
      eta: ""
    }, {
      method: "post",
      action: `${dispatchHref}${location.search || ""}`
    });
  }
  function unassignDraggedOrder(event) {
    event.preventDefault();
    const orderId = getDraggedOrderId(event);
    clearDragState();
    if (!orderId || !canManageDispatch) return;
    assignmentFetcher.submit({
      intent: "unassign-order",
      orderId
    }, {
      method: "post",
      action: `${dispatchHref}${location.search || ""}`
    });
  }
  useEffect(() => {
    if (assignmentFetcher.state === "idle") {
      clearDragState();
    }
  }, [assignmentFetcher.state]);
  if (!allowed) {
    return /* @__PURE__ */ jsx("div", {
      style: styles$6.page,
      children: /* @__PURE__ */ jsx("div", {
        style: {
          ...styles$6.shell,
          maxWidth: 520
        },
        children: /* @__PURE__ */ jsxs("div", {
          style: styles$6.loginCard,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$6.title,
            children: "Dispatch"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$6.subtitle,
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
              style: styles$6.label,
              children: "Admin Password"
            }), /* @__PURE__ */ jsx("input", {
              type: "password",
              name: "password",
              autoComplete: "current-password",
              style: styles$6.input
            }), (actionData == null ? void 0 : actionData.loginError) ? /* @__PURE__ */ jsx("div", {
              style: styles$6.statusErr,
              children: actionData.loginError
            }) : null, /* @__PURE__ */ jsx("button", {
              type: "submit",
              style: {
                ...styles$6.primaryButton,
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
    style: styles$6.page,
    children: /* @__PURE__ */ jsxs("div", {
      style: styles$6.appFrame,
      children: [/* @__PURE__ */ jsxs("aside", {
        style: styles$6.sidebar,
        children: [/* @__PURE__ */ jsxs("div", {
          style: styles$6.brandBlock,
          children: [/* @__PURE__ */ jsx("div", {
            style: styles$6.brandMark,
            children: /* @__PURE__ */ jsx("img", {
              src: "/green-hills-logo.png",
              alt: "Green Hills Supply",
              style: styles$6.brandLogo
            })
          }), /* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$6.brandTitle,
              children: "Contractor"
            }), /* @__PURE__ */ jsx("div", {
              style: styles$6.brandSub,
              children: "Dispatch v2.0"
            })]
          })]
        }), /* @__PURE__ */ jsxs("nav", {
          style: styles$6.sideNav,
          children: [/* @__PURE__ */ jsx("a", {
            href: dispatchViewHref("dashboard"),
            style: styles$6.sideNavLink(activeView === "dashboard"),
            children: "Dashboard"
          }), canAccess("manageDispatch") ? /* @__PURE__ */ jsx("a", {
            href: dispatchViewHref("orders"),
            style: styles$6.sideNavLink(activeView === "orders"),
            children: "Orders"
          }) : null, /* @__PURE__ */ jsx("a", {
            href: dispatchViewHref("scheduled"),
            style: styles$6.sideNavLink(activeView === "scheduled"),
            children: "Scheduled"
          }), canAccess("manageDispatch") ? /* @__PURE__ */ jsx("a", {
            href: dispatchViewHref("routes"),
            style: styles$6.sideNavLink(activeView === "routes"),
            children: "Routes"
          }) : null, canAccess("manageDispatch") ? /* @__PURE__ */ jsx("a", {
            href: dispatchViewHref("trucks"),
            style: styles$6.sideNavLink(activeView === "trucks"),
            children: "Trucks"
          }) : null, canAccess("manageDispatch") ? /* @__PURE__ */ jsx("a", {
            href: dispatchViewHref("employees"),
            style: styles$6.sideNavLink(activeView === "employees"),
            children: "Employees"
          }) : null, /* @__PURE__ */ jsx("a", {
            href: dispatchViewHref("delivered"),
            style: styles$6.sideNavLink(activeView === "delivered"),
            children: "Delivered"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles$6.sidebarFooter,
          children: [canAccess("driver") ? /* @__PURE__ */ jsx("a", {
            href: driverHref,
            style: styles$6.sideUtility,
            children: "Driver Route"
          }) : null, canAccess("quoteTool") ? /* @__PURE__ */ jsx("a", {
            href: quoteHref,
            style: styles$6.sideUtility,
            children: "Quote Tool"
          }) : null, canAccess("manageUsers") ? /* @__PURE__ */ jsx("a", {
            href: "/settings",
            style: styles$6.sideUtility,
            children: "Settings"
          }) : null, currentUser ? /* @__PURE__ */ jsx("a", {
            href: "/change-password",
            style: styles$6.sideUtility,
            children: "Change Password"
          }) : null, /* @__PURE__ */ jsx("a", {
            href: currentUser ? "/login?logout=1" : logoutHref,
            style: styles$6.sideUtility,
            children: "Log Out"
          })]
        })]
      }), /* @__PURE__ */ jsxs("main", {
        style: styles$6.shell,
        children: [/* @__PURE__ */ jsxs("div", {
          id: "dashboard",
          style: styles$6.hero,
          children: [/* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$6.kicker,
              children: "Dispatch Workspace"
            }), /* @__PURE__ */ jsx("h1", {
              style: styles$6.title,
              children: "Plan, intake, and assign deliveries"
            }), /* @__PURE__ */ jsx("p", {
              style: styles$6.subtitle,
              children: "Live contractor operations board for mailbox intake, routing, trucks, crews, and field proof."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$6.heroActions,
            children: [/* @__PURE__ */ jsx("a", {
              href: mobileHref,
              style: styles$6.ghostButton,
              children: "Dashboard"
            }), /* @__PURE__ */ jsx("a", {
              href: reviewHref,
              style: styles$6.ghostButton,
              children: "Review Quotes"
            }), /* @__PURE__ */ jsx("a", {
              href: driverHref,
              style: styles$6.ghostButton,
              children: "Driver View"
            })]
          })]
        }), !storageReady ? /* @__PURE__ */ jsxs("div", {
          style: styles$6.statusWarn,
          children: ["Dispatch storage is not ready yet. Run", " ", /* @__PURE__ */ jsx("strong", {
            children: "`dispatch_schema.sql`"
          }), " ", "in Supabase SQL Editor, then refresh. Until then, you are seeing seed data.", storageError ? ` Storage error: ${storageError}` : ""]
        }) : null, (actionData == null ? void 0 : actionData.message) ? /* @__PURE__ */ jsx("div", {
          style: actionData.ok ? styles$6.statusOk : styles$6.statusErr,
          children: actionData.message
        }) : null, mailboxStatus ? /* @__PURE__ */ jsxs("div", {
          style: mailboxStatus.configured ? styles$6.statusOk : styles$6.statusWarn,
          children: [mailboxStatus.message, ((_b = mailboxStatus.skipReasons) == null ? void 0 : _b.length) ? /* @__PURE__ */ jsxs("div", {
            style: styles$6.skipReasonList,
            children: [mailboxStatus.skipReasons.slice(0, 5).map((item) => /* @__PURE__ */ jsxs("div", {
              style: styles$6.skipReasonItem,
              children: [/* @__PURE__ */ jsx("strong", {
                children: item.subject
              }), /* @__PURE__ */ jsx("span", {
                children: item.reason
              })]
            }, `${item.uid}-${item.reason}`)), mailboxStatus.skipReasons.length > 5 ? /* @__PURE__ */ jsxs("div", {
              style: styles$6.skipReasonItem,
              children: [/* @__PURE__ */ jsx("strong", {
                children: "More skipped emails"
              }), /* @__PURE__ */ jsxs("span", {
                children: [mailboxStatus.skipReasons.length - 5, " additional skipped emails not shown."]
              })]
            }) : null]
          }) : null]
        }) : null, /* @__PURE__ */ jsxs("div", {
          style: styles$6.metricsGrid,
          children: [metricCard("Inbox", String(inboxOrders.length), "#f97316"), metricCard("Scheduled", String(scheduledOrders.length), "#22c55e"), metricCard("On Hold", String(holdOrders.length), "#eab308"), metricCard("Delivered", String(deliveredOrders.length), "#38bdf8")]
        }), activeView === "orders" ? /* @__PURE__ */ jsxs("div", {
          style: styles$6.focusGrid,
          children: [/* @__PURE__ */ jsxs("div", {
            id: "orders",
            onDragOver: (event) => {
              if (!draggedOrderId || !canManageDispatch) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDragOverQueue(true);
            },
            onDragLeave: () => setDragOverQueue(false),
            onDrop: unassignDraggedOrder,
            style: {
              ...styles$6.panel,
              ...dragOverQueue ? styles$6.queueDropActive : {}
            },
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$6.panelHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Orders"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "View imported, manual, and held dispatch orders that still need scheduling."
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.headerPill,
                children: [activeOrders.length, " orders"]
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: {
                display: "grid",
                gap: 10
              },
              children: activeOrders.map((order) => {
                const route38 = routes2.find((entry2) => entry2.id === order.assignedRouteId);
                return /* @__PURE__ */ jsxs("a", {
                  href: `${dispatchHref}?view=orders&order=${encodeURIComponent(order.id)}`,
                  style: {
                    ...styles$6.queueCard,
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
                        style: styles$6.queueTitle,
                        children: order.customer
                      }), /* @__PURE__ */ jsxs("div", {
                        style: styles$6.queueMeta,
                        children: [order.address, ", ", order.city]
                      })]
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.badge(order.status),
                      children: order.status
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$6.queueDetails,
                    children: [/* @__PURE__ */ jsx("span", {
                      children: getOrderDisplayNumber$2(order)
                    }), /* @__PURE__ */ jsxs("span", {
                      children: [order.quantity, " ", order.unit]
                    }), /* @__PURE__ */ jsx("span", {
                      children: order.material
                    }), order.travelMinutes ? /* @__PURE__ */ jsxs("span", {
                      children: [order.travelMinutes, " min RT"]
                    }) : null, /* @__PURE__ */ jsx("span", {
                      children: route38 ? route38.truck : "Unassigned"
                    })]
                  })]
                }, order.id);
              })
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$6.panel,
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$6.panelHeader,
              children: /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Add / Import Order"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "Create a dispatch card manually or poll the mailbox."
                })]
              })
            }), /* @__PURE__ */ jsxs(Form, {
              method: "post",
              style: {
                display: "grid",
                gap: 12,
                marginBottom: 16
              },
              children: [/* @__PURE__ */ jsx("input", {
                type: "hidden",
                name: "intent",
                value: "poll-mailbox"
              }), /* @__PURE__ */ jsx("button", {
                type: "submit",
                style: styles$6.primaryButton,
                children: "Poll Mailbox Now"
              })]
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
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$6.label,
                  children: "Order Number"
                }), /* @__PURE__ */ jsx("input", {
                  name: "orderNumber",
                  placeholder: "8789",
                  style: styles$6.input
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridTwo,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Customer"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "customer",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Contact / Email"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "contact",
                    style: styles$6.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridTwo,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Jobsite Address"
                  }), /* @__PURE__ */ jsx("input", {
                    id: "dispatch-address",
                    name: "address",
                    placeholder: "Start typing the street address",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "City"
                  }), /* @__PURE__ */ jsx("input", {
                    id: "dispatch-city",
                    name: "city",
                    placeholder: "City, ST ZIP",
                    style: styles$6.input
                  }), /* @__PURE__ */ jsx("input", {
                    id: "dispatch-province",
                    name: "province",
                    type: "hidden"
                  }), /* @__PURE__ */ jsx("input", {
                    id: "dispatch-postal-code",
                    name: "postalCode",
                    type: "hidden"
                  }), /* @__PURE__ */ jsx("input", {
                    id: "dispatch-country",
                    name: "country",
                    type: "hidden",
                    defaultValue: "US"
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridThree,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Material"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "material",
                    list: "dispatch-material-options",
                    placeholder: "Start typing a synced material",
                    style: styles$6.input
                  }), /* @__PURE__ */ jsx("datalist", {
                    id: "dispatch-material-options",
                    children: materialOptions.map((material) => /* @__PURE__ */ jsx("option", {
                      value: material
                    }, material))
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Quantity"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "quantity",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Unit"
                  }), /* @__PURE__ */ jsxs("select", {
                    name: "unit",
                    style: styles$6.input,
                    children: [/* @__PURE__ */ jsx("option", {
                      children: "Ton"
                    }), /* @__PURE__ */ jsx("option", {
                      children: "Yard"
                    }), /* @__PURE__ */ jsx("option", {
                      children: "Gallons"
                    }), /* @__PURE__ */ jsx("option", {
                      children: "Bags"
                    }), /* @__PURE__ */ jsx("option", {
                      children: "Unit"
                    })]
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridTwo,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Requested Window"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "requestedWindow",
                    type: "date",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Time Preference"
                  }), /* @__PURE__ */ jsxs("select", {
                    name: "timePreference",
                    style: styles$6.input,
                    children: [/* @__PURE__ */ jsx("option", {
                      value: "",
                      children: "Infer from notes"
                    }), /* @__PURE__ */ jsx("option", {
                      value: "Morning",
                      children: "Morning"
                    }), /* @__PURE__ */ jsx("option", {
                      value: "Afternoon",
                      children: "Afternoon"
                    }), /* @__PURE__ */ jsx("option", {
                      value: "Evening",
                      children: "Evening"
                    })]
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  style: styles$6.label,
                  children: "Notes"
                }), /* @__PURE__ */ jsx("textarea", {
                  name: "notes",
                  rows: 3,
                  style: {
                    ...styles$6.input,
                    resize: "vertical"
                  }
                })]
              }), /* @__PURE__ */ jsx("button", {
                type: "submit",
                style: styles$6.primaryButton,
                children: "Add Order"
              })]
            }), /* @__PURE__ */ jsxs(Form, {
              method: "post",
              style: {
                display: "grid",
                gap: 12,
                marginTop: 18
              },
              children: [/* @__PURE__ */ jsx("input", {
                type: "hidden",
                name: "intent",
                value: "parse-email-order"
              }), /* @__PURE__ */ jsx("label", {
                style: styles$6.label,
                children: "Paste Order Email"
              }), /* @__PURE__ */ jsx("textarea", {
                name: "rawEmail",
                rows: 9,
                placeholder: "Subject: You've Got A New Order: #1234\nCustomer: Green Hills Supply\nAddress: 2543 W Applebrook Lane\nCity: Oak Creek, WI\nMaterial: Coarse Torpedo Sand\nQuantity: 12\nUnit: Ton\nRequested Window: Tomorrow 9a - 11a",
                style: {
                  ...styles$6.input,
                  resize: "vertical",
                  minHeight: 180
                }
              }), /* @__PURE__ */ jsx("button", {
                type: "submit",
                style: styles$6.secondaryButton,
                children: "Parse Email Into Dispatch Card"
              })]
            })]
          })]
        }) : null, orderEditorOpen && selectedOrder ? /* @__PURE__ */ jsx("div", {
          style: styles$6.modalOverlay,
          children: /* @__PURE__ */ jsxs("div", {
            style: styles$6.orderModal,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$6.modalHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Edit Selected Order"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "Update order details or delete the selected dispatch card."
                })]
              }), /* @__PURE__ */ jsx("a", {
                href: dispatchViewHref("orders"),
                style: styles$6.modalCloseButton,
                children: "Close"
              })]
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gap: 14
              },
              children: [/* @__PURE__ */ jsxs(Form, {
                method: "post",
                style: {
                  display: "grid",
                  gap: 12
                },
                children: [/* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "intent",
                  value: "update-order"
                }), /* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "orderId",
                  value: selectedOrder.id
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridTwo,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Order Number"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "orderNumber",
                      defaultValue: selectedOrder.orderNumber || "",
                      placeholder: "8789",
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Internal Dispatch ID"
                    }), /* @__PURE__ */ jsx("input", {
                      value: selectedOrder.id,
                      readOnly: true,
                      style: {
                        ...styles$6.input,
                        opacity: 0.75
                      }
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridTwo,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Customer"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "customer",
                      defaultValue: selectedOrder.customer,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Contact / Email"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "contact",
                      defaultValue: selectedOrder.contact,
                      style: styles$6.input
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridTwo,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Address"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "address",
                      defaultValue: selectedOrder.address,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "City"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "city",
                      defaultValue: selectedOrder.city,
                      style: styles$6.input
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridThree,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Material"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "material",
                      defaultValue: selectedOrder.material,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Quantity"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "quantity",
                      defaultValue: selectedOrder.quantity,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Unit"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "unit",
                      defaultValue: selectedOrder.unit,
                      style: styles$6.input
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridTwo,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Requested Window"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "requestedWindow",
                      defaultValue: selectedOrder.requestedWindow,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Time Preference"
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "timePreference",
                      defaultValue: selectedOrder.timePreference || "",
                      style: styles$6.input,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "",
                        children: "Infer from notes"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "Morning",
                        children: "Morning"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "Afternoon",
                        children: "Afternoon"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "Evening",
                        children: "Evening"
                      })]
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridTwo,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Status"
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "status",
                      defaultValue: selectedOrder.status,
                      style: styles$6.input,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "new",
                        children: "New"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "scheduled",
                        children: "Scheduled"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "hold",
                        children: "Hold"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "delivered",
                        children: "Delivered"
                      })]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Truck Preference"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "truckPreference",
                      defaultValue: selectedOrder.truckPreference || "",
                      style: styles$6.input
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridTwo,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Assigned Route / Driver"
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "routeId",
                      defaultValue: selectedOrder.assignedRouteId || "",
                      style: styles$6.input,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "",
                        children: "Unassigned"
                      }), routes2.map((route38) => /* @__PURE__ */ jsxs("option", {
                        value: route38.id,
                        children: [route38.code, " - ", route38.truck, " - ", route38.driver]
                      }, route38.id))]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "ETA"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "eta",
                      defaultValue: selectedOrder.eta || "",
                      placeholder: "Optional",
                      style: styles$6.input
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Notes"
                  }), /* @__PURE__ */ jsx("textarea", {
                    name: "notes",
                    rows: 4,
                    defaultValue: selectedOrder.notes,
                    style: {
                      ...styles$6.input,
                      resize: "vertical"
                    }
                  })]
                }), /* @__PURE__ */ jsx("button", {
                  type: "submit",
                  style: styles$6.primaryButton,
                  children: "Save Order Changes"
                })]
              }), /* @__PURE__ */ jsxs(Form, {
                method: "post",
                onSubmit: (event) => {
                  if (!window.confirm("Delete this order? This cannot be undone.")) {
                    event.preventDefault();
                  }
                },
                children: [/* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "intent",
                  value: "delete-order"
                }), /* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "orderId",
                  value: selectedOrder.id
                }), /* @__PURE__ */ jsx("button", {
                  type: "submit",
                  style: styles$6.dangerButton,
                  children: "Delete Order"
                })]
              })]
            })]
          })
        }) : null, activeView === "scheduled" ? /* @__PURE__ */ jsx("div", {
          style: styles$6.focusGrid,
          children: /* @__PURE__ */ jsxs("div", {
            id: "scheduled",
            style: styles$6.panel,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$6.panelHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Scheduled"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "Orders assigned to a route and waiting for delivery."
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.headerPill,
                children: [scheduledOrders.length, " scheduled"]
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: {
                display: "grid",
                gap: 10
              },
              children: scheduledOrders.length === 0 ? /* @__PURE__ */ jsx("div", {
                style: {
                  color: "#94a3b8"
                },
                children: "No scheduled orders yet."
              }) : scheduledOrders.map((order) => {
                const route38 = routes2.find((entry2) => entry2.id === order.assignedRouteId);
                return /* @__PURE__ */ jsxs("div", {
                  style: styles$6.queueCard,
                  children: [/* @__PURE__ */ jsxs("div", {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12
                    },
                    children: [/* @__PURE__ */ jsxs("div", {
                      children: [/* @__PURE__ */ jsx("div", {
                        style: styles$6.queueTitle,
                        children: order.customer
                      }), /* @__PURE__ */ jsxs("div", {
                        style: styles$6.queueMeta,
                        children: [order.address, ", ", order.city]
                      })]
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.badge("scheduled"),
                      children: "scheduled"
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$6.queueDetails,
                    children: [/* @__PURE__ */ jsx("span", {
                      children: getOrderDisplayNumber$2(order)
                    }), /* @__PURE__ */ jsxs("span", {
                      children: [order.quantity, " ", order.unit]
                    }), /* @__PURE__ */ jsx("span", {
                      children: order.material
                    }), order.travelMinutes ? /* @__PURE__ */ jsxs("span", {
                      children: [order.travelMinutes, " min RT"]
                    }) : null, order.timePreference ? /* @__PURE__ */ jsx("span", {
                      children: order.timePreference
                    }) : null, order.stopSequence ? /* @__PURE__ */ jsxs("span", {
                      children: ["Stop ", order.stopSequence]
                    }) : null, /* @__PURE__ */ jsx("span", {
                      children: route38 ? `${route38.truck || route38.code} / ${route38.driver || "No driver"}` : "No route"
                    })]
                  }), order.notes ? /* @__PURE__ */ jsxs("div", {
                    style: styles$6.queueNotes,
                    children: [/* @__PURE__ */ jsx("strong", {
                      children: "Notes:"
                    }), " ", order.notes]
                  }) : null, /* @__PURE__ */ jsxs("div", {
                    style: styles$6.deliveredActions,
                    children: [/* @__PURE__ */ jsx("a", {
                      href: `${dispatchHref}?view=orders&order=${encodeURIComponent(order.id)}`,
                      style: styles$6.detailButton,
                      children: "Edit"
                    }), /* @__PURE__ */ jsx("a", {
                      href: `${driverHref}?route=${encodeURIComponent(order.assignedRouteId || "")}`,
                      style: styles$6.assignButton,
                      children: "Driver View"
                    })]
                  })]
                }, order.id);
              })
            })]
          })
        }) : null, activeView === "delivered" ? /* @__PURE__ */ jsx("div", {
          style: styles$6.focusGrid,
          children: /* @__PURE__ */ jsxs("div", {
            id: "delivered",
            style: styles$6.panel,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$6.panelHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Delivered"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "Completed orders that drivers marked delivered."
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.headerPill,
                children: [deliveredOrders.length, " delivered"]
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: {
                display: "grid",
                gap: 10
              },
              children: deliveredOrders.length === 0 ? /* @__PURE__ */ jsx("div", {
                style: {
                  color: "#94a3b8"
                },
                children: "No delivered orders yet."
              }) : deliveredOrders.map((order) => {
                const route38 = routes2.find((entry2) => entry2.id === order.assignedRouteId);
                return /* @__PURE__ */ jsxs("div", {
                  style: styles$6.queueCard,
                  children: [/* @__PURE__ */ jsxs("div", {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12
                    },
                    children: [/* @__PURE__ */ jsxs("div", {
                      children: [/* @__PURE__ */ jsx("div", {
                        style: styles$6.queueTitle,
                        children: order.customer
                      }), /* @__PURE__ */ jsxs("div", {
                        style: styles$6.queueMeta,
                        children: [order.address, ", ", order.city]
                      })]
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.badge("delivered"),
                      children: "delivered"
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$6.queueDetails,
                    children: [/* @__PURE__ */ jsx("span", {
                      children: getOrderDisplayNumber$2(order)
                    }), /* @__PURE__ */ jsxs("span", {
                      children: [order.quantity, " ", order.unit]
                    }), /* @__PURE__ */ jsx("span", {
                      children: order.material
                    }), order.deliveredAt ? /* @__PURE__ */ jsx("span", {
                      children: new Date(order.deliveredAt).toLocaleString()
                    }) : null, /* @__PURE__ */ jsx("span", {
                      children: route38 ? route38.truck || route38.code : "No route"
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$6.deliveredActions,
                    children: [/* @__PURE__ */ jsx("a", {
                      href: `${dispatchHref}?view=delivered&order=${encodeURIComponent(order.id)}&detail=1`,
                      style: styles$6.detailButton,
                      children: "Open"
                    }), /* @__PURE__ */ jsxs(Form, {
                      method: "post",
                      onSubmit: (event) => {
                        if (!window.confirm("Delete this delivered order? This cannot be undone.")) {
                          event.preventDefault();
                        }
                      },
                      children: [/* @__PURE__ */ jsx("input", {
                        type: "hidden",
                        name: "intent",
                        value: "delete-order"
                      }), /* @__PURE__ */ jsx("input", {
                        type: "hidden",
                        name: "orderId",
                        value: order.id
                      }), /* @__PURE__ */ jsx("button", {
                        type: "submit",
                        style: styles$6.smallDangerButton,
                        children: "Delete"
                      })]
                    })]
                  })]
                }, order.id);
              })
            })]
          })
        }) : null, deliveredDetailOpen && selectedOrder ? /* @__PURE__ */ jsx("div", {
          style: styles$6.modalOverlay,
          children: /* @__PURE__ */ jsxs("div", {
            style: styles$6.dispatchModal,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$6.panelHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Delivered Order"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "Review the completed delivery details and proof notes."
                })]
              }), /* @__PURE__ */ jsx("a", {
                href: dispatchViewHref("delivered"),
                style: styles$6.modalCloseButton,
                children: "Close"
              })]
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "grid",
                gap: 14
              },
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("div", {
                  style: styles$6.detailId,
                  children: getOrderDisplayNumber$2(selectedOrder)
                }), /* @__PURE__ */ jsx("div", {
                  style: styles$6.detailTitle,
                  children: selectedOrder.customer
                }), /* @__PURE__ */ jsx("div", {
                  style: styles$6.detailMeta,
                  children: selectedOrder.contact
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.detailGrid,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailLabel,
                    children: "Address"
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$6.detailValue,
                    children: [selectedOrder.address, ", ", selectedOrder.city]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailLabel,
                    children: "Load"
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$6.detailValue,
                    children: [selectedOrder.quantity, " ", selectedOrder.unit, " ", selectedOrder.material]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailLabel,
                    children: "Requested"
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$6.detailValue,
                    children: selectedOrder.requestedWindow
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailLabel,
                    children: "Time Preference"
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$6.detailValue,
                    children: selectedOrder.timePreference || "No preference"
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailLabel,
                    children: "Travel Time"
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$6.detailValue,
                    children: selectedOrder.travelSummary || "Not calculated yet"
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailLabel,
                    children: "Delivered"
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$6.detailValue,
                    children: selectedOrder.deliveredAt ? new Date(selectedOrder.deliveredAt).toLocaleString() : "Delivered"
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailLabel,
                    children: "Proof Name"
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$6.detailValue,
                    children: selectedOrder.proofName || selectedOrder.signatureName || "Not captured"
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailLabel,
                    children: "Inspection"
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$6.detailValue,
                    children: selectedOrder.inspectionStatus || "Not completed"
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.notesBlock,
                children: [/* @__PURE__ */ jsx("div", {
                  style: styles$6.detailLabel,
                  children: "Notes"
                }), /* @__PURE__ */ jsx("div", {
                  style: {
                    color: "#e2e8f0",
                    lineHeight: 1.55
                  },
                  children: selectedOrder.notes || "No dispatch notes."
                })]
              }), selectedOrder.proofNotes ? /* @__PURE__ */ jsxs("div", {
                style: styles$6.notesBlock,
                children: [/* @__PURE__ */ jsx("div", {
                  style: styles$6.detailLabel,
                  children: "Proof Notes"
                }), /* @__PURE__ */ jsx("div", {
                  style: {
                    color: "#e2e8f0",
                    lineHeight: 1.55
                  },
                  children: selectedOrder.proofNotes
                })]
              }) : null, selectedOrder.photoUrls ? /* @__PURE__ */ jsxs("div", {
                style: styles$6.notesBlock,
                children: [/* @__PURE__ */ jsx("div", {
                  style: styles$6.detailLabel,
                  children: "Photo Proof"
                }), isImageProof$2(selectedOrder.photoUrls) ? /* @__PURE__ */ jsx("img", {
                  src: selectedOrder.photoUrls,
                  alt: "Delivered material proof",
                  style: styles$6.deliveredPhoto
                }) : /* @__PURE__ */ jsx("div", {
                  style: {
                    color: "#e2e8f0",
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap"
                  },
                  children: selectedOrder.photoUrls
                })]
              }) : null]
            })]
          })
        }) : null, activeView === "trucks" ? /* @__PURE__ */ jsxs("div", {
          style: styles$6.focusGrid,
          children: [/* @__PURE__ */ jsxs("div", {
            id: "trucks",
            style: styles$6.panel,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$6.panelHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Fleet"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "View and edit active trucks, ton limits, and yard limits."
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.headerPill,
                children: [trucks.length, " trucks"]
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: styles$6.resourceList,
              children: trucks.map((truck) => /* @__PURE__ */ jsxs(Form, {
                method: "post",
                style: {
                  ...styles$6.resourceCard,
                  gap: 12
                },
                onSubmit: (event) => {
                  const submitter = event.nativeEvent.submitter;
                  if ((submitter == null ? void 0 : submitter.value) === "delete-truck" && !window.confirm("Delete this truck from the active fleet? Existing routes and history will remain.")) {
                    event.preventDefault();
                  }
                },
                children: [/* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "truckId",
                  value: truck.id
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridThree,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Truck Name"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "label",
                      defaultValue: truck.label,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Type"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "truckType",
                      defaultValue: truck.truckType,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Plate"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "licensePlate",
                      defaultValue: truck.licensePlate || "",
                      style: styles$6.input
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridThree,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Tons"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "tons",
                      defaultValue: truck.tons || "",
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Yards"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "yards",
                      defaultValue: truck.yards || "",
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: {
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 8
                    },
                    children: [/* @__PURE__ */ jsx("button", {
                      type: "submit",
                      name: "intent",
                      value: "update-truck",
                      style: {
                        ...styles$6.secondaryButton,
                        width: "100%"
                      },
                      children: "Save Truck"
                    }), /* @__PURE__ */ jsx("button", {
                      type: "submit",
                      name: "intent",
                      value: "delete-truck",
                      style: {
                        ...styles$6.dangerButton,
                        width: "100%"
                      },
                      children: "Delete"
                    })]
                  })]
                })]
              }, truck.id))
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$6.panel,
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$6.panelHeader,
              children: /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Add Truck"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "Add trucks before assigning routes."
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
                value: "create-truck"
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridTwo,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Truck Name"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "label",
                    placeholder: "Truck 22",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Type"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "truckType",
                    placeholder: "Tri-axle",
                    style: styles$6.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridThree,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Tons"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "tons",
                    placeholder: "22",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Yards"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "yards",
                    placeholder: "18",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Plate"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "licensePlate",
                    style: styles$6.input
                  })]
                })]
              }), /* @__PURE__ */ jsx("button", {
                type: "submit",
                style: {
                  ...styles$6.primaryButton,
                  width: "100%"
                },
                children: "Add Truck"
              })]
            })]
          })]
        }) : null, activeView === "employees" ? /* @__PURE__ */ jsxs("div", {
          style: styles$6.focusGrid,
          children: [/* @__PURE__ */ jsxs("div", {
            id: "employees",
            style: styles$6.panel,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$6.panelHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Employees"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "View drivers, helpers, and dispatchers."
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.headerPill,
                children: [employees.length, " people"]
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: styles$6.resourceList,
              children: employees.map((employee) => /* @__PURE__ */ jsxs(Form, {
                method: "post",
                style: {
                  ...styles$6.resourceCard,
                  gap: 12
                },
                onSubmit: (event) => {
                  const submitter = event.nativeEvent.submitter;
                  if ((submitter == null ? void 0 : submitter.value) === "delete-employee" && !window.confirm("Delete this employee from the active roster? Existing routes and history will remain.")) {
                    event.preventDefault();
                  }
                },
                children: [/* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "employeeId",
                  value: employee.id
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridThree,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Name"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "name",
                      defaultValue: employee.name,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Role"
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "role",
                      defaultValue: employee.role,
                      style: styles$6.input,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "driver",
                        children: "Driver"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "helper",
                        children: "Helper"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "dispatcher",
                        children: "Dispatcher"
                      })]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Phone"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "phone",
                      defaultValue: employee.phone || "",
                      style: styles$6.input
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.formGridTwo,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Email"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "email",
                      type: "email",
                      defaultValue: employee.email || "",
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: {
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 8
                    },
                    children: [/* @__PURE__ */ jsx("button", {
                      type: "submit",
                      name: "intent",
                      value: "update-employee",
                      style: {
                        ...styles$6.secondaryButton,
                        width: "100%"
                      },
                      children: "Save Employee"
                    }), /* @__PURE__ */ jsx("button", {
                      type: "submit",
                      name: "intent",
                      value: "delete-employee",
                      style: {
                        ...styles$6.dangerButton,
                        width: "100%"
                      },
                      children: "Delete"
                    })]
                  })]
                })]
              }, employee.id))
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$6.panel,
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$6.panelHeader,
              children: /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Add Employee"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "Add drivers, helpers, or dispatch users."
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
                value: "create-employee"
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridThree,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Name"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "name",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Role"
                  }), /* @__PURE__ */ jsxs("select", {
                    name: "role",
                    style: styles$6.input,
                    children: [/* @__PURE__ */ jsx("option", {
                      value: "driver",
                      children: "Driver"
                    }), /* @__PURE__ */ jsx("option", {
                      value: "helper",
                      children: "Helper"
                    }), /* @__PURE__ */ jsx("option", {
                      value: "dispatcher",
                      children: "Dispatcher"
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Phone"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "phone",
                    style: styles$6.input
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridTwo,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Email"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "email",
                    type: "email",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsx("div", {
                  style: {
                    display: "flex",
                    alignItems: "flex-end"
                  },
                  children: /* @__PURE__ */ jsx("button", {
                    type: "submit",
                    style: {
                      ...styles$6.primaryButton,
                      width: "100%"
                    },
                    children: "Add Employee"
                  })
                })]
              })]
            })]
          })]
        }) : null, activeView === "routes" ? /* @__PURE__ */ jsxs("div", {
          style: styles$6.focusGrid,
          children: [/* @__PURE__ */ jsxs("div", {
            id: "routes",
            style: styles$6.panel,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles$6.panelHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Routes"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "View route assignments, open driver view, and sequence stops."
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.headerPill,
                children: [routes2.length, " routes"]
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: {
                display: "grid",
                gap: 12
              },
              children: routes2.map((route38) => /* @__PURE__ */ jsxs(Form, {
                method: "post",
                style: styles$6.routeCard(route38.color),
                children: [/* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "intent",
                  value: "update-route"
                }), /* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "routeId",
                  value: route38.id
                }), /* @__PURE__ */ jsxs("div", {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsxs("div", {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 10
                      },
                      children: [/* @__PURE__ */ jsx("div", {
                        style: styles$6.routeColor(route38.color)
                      }), /* @__PURE__ */ jsx("div", {
                        style: styles$6.routeCode,
                        children: route38.code
                      }), /* @__PURE__ */ jsx("div", {
                        style: styles$6.routeRegion,
                        children: route38.region
                      })]
                    }), /* @__PURE__ */ jsxs("div", {
                      style: {
                        marginTop: 8,
                        color: "#e2e8f0",
                        fontWeight: 700
                      },
                      children: [route38.truck || "No truck", " · ", route38.driver || "No driver", " / ", route38.helper || "No helper"]
                    })]
                  }), /* @__PURE__ */ jsx("a", {
                    href: `${driverHref}?route=${encodeURIComponent(route38.id)}`,
                    style: styles$6.assignButton,
                    children: "Driver View"
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: {
                    ...styles$6.formGridThree,
                    marginTop: 14
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Route Code"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "code",
                      defaultValue: route38.code,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Truck"
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "truckId",
                      defaultValue: route38.truckId || "",
                      style: styles$6.input,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "",
                        children: "Unassigned"
                      }), trucks.map((truck) => /* @__PURE__ */ jsx("option", {
                        value: truck.id,
                        children: truck.label
                      }, truck.id))]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Color"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "color",
                      name: "color",
                      defaultValue: route38.color,
                      style: styles$6.colorInput
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: {
                    ...styles$6.formGridThree,
                    marginTop: 12
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Driver"
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "driverId",
                      defaultValue: route38.driverId || "",
                      style: styles$6.input,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "",
                        children: "Unassigned"
                      }), drivers.map((employee) => /* @__PURE__ */ jsx("option", {
                        value: employee.id,
                        children: employee.name
                      }, employee.id))]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Helper"
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "helperId",
                      defaultValue: route38.helperId || "",
                      style: styles$6.input,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "",
                        children: "Unassigned"
                      }), helpers.map((employee) => /* @__PURE__ */ jsx("option", {
                        value: employee.id,
                        children: employee.name
                      }, employee.id))]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Shift"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "shift",
                      defaultValue: route38.shift,
                      style: styles$6.input
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: {
                    ...styles$6.formGridTwo,
                    marginTop: 12
                  },
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Region"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "region",
                      defaultValue: route38.region,
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsx("div", {
                    style: {
                      display: "flex",
                      alignItems: "flex-end"
                    },
                    children: /* @__PURE__ */ jsx("button", {
                      type: "submit",
                      style: {
                        ...styles$6.secondaryButton,
                        width: "100%"
                      },
                      children: "Save Route Assignments"
                    })
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.routeStats,
                  children: [/* @__PURE__ */ jsx("span", {
                    children: route38.shift
                  }), /* @__PURE__ */ jsxs("span", {
                    children: [route38.stops, " stops"]
                  }), /* @__PURE__ */ jsx("span", {
                    children: route38.loadSummary || "No assigned loads yet"
                  })]
                })]
              }, route38.id))
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$6.panel,
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$6.panelHeader,
              children: /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("h2", {
                  style: styles$6.panelTitle,
                  children: "Add Route"
                }), /* @__PURE__ */ jsx("p", {
                  style: styles$6.panelSub,
                  children: "Create a route using an active truck and driver."
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
                value: "create-route"
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridThree,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Route Code"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "code",
                    placeholder: "R-22",
                    style: styles$6.input
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Truck"
                  }), /* @__PURE__ */ jsxs("select", {
                    name: "truckId",
                    style: styles$6.input,
                    children: [/* @__PURE__ */ jsx("option", {
                      value: "",
                      children: "Select truck"
                    }), trucks.map((truck) => /* @__PURE__ */ jsx("option", {
                      value: truck.id,
                      children: truck.label
                    }, truck.id))]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Color"
                  }), /* @__PURE__ */ jsx("input", {
                    type: "color",
                    name: "color",
                    defaultValue: "#38bdf8",
                    style: styles$6.colorInput
                  })]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: styles$6.formGridThree,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Driver"
                  }), /* @__PURE__ */ jsxs("select", {
                    name: "driverId",
                    style: styles$6.input,
                    children: [/* @__PURE__ */ jsx("option", {
                      value: "",
                      children: "Select driver"
                    }), drivers.map((employee) => /* @__PURE__ */ jsx("option", {
                      value: employee.id,
                      children: employee.name
                    }, employee.id))]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Helper"
                  }), /* @__PURE__ */ jsxs("select", {
                    name: "helperId",
                    style: styles$6.input,
                    children: [/* @__PURE__ */ jsx("option", {
                      value: "",
                      children: "No helper"
                    }), helpers.map((employee) => /* @__PURE__ */ jsx("option", {
                      value: employee.id,
                      children: employee.name
                    }, employee.id))]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("label", {
                    style: styles$6.label,
                    children: "Shift"
                  }), /* @__PURE__ */ jsx("input", {
                    name: "shift",
                    placeholder: "7:00a - 4:00p",
                    style: styles$6.input
                  })]
                })]
              }), /* @__PURE__ */ jsx("button", {
                type: "submit",
                style: styles$6.primaryButton,
                children: "Add Route"
              })]
            })]
          })]
        }) : null, activeView === "dashboard" ? /* @__PURE__ */ jsxs("div", {
          style: styles$6.workspaceGrid,
          children: [/* @__PURE__ */ jsx("div", {
            style: styles$6.leftColumn,
            children: /* @__PURE__ */ jsxs("div", {
              id: "orders",
              onDragEnter: (event) => {
                if (!draggedOrderId || !canManageDispatch) return;
                event.preventDefault();
                setDragOverQueue(true);
              },
              onDragOver: (event) => {
                if (!draggedOrderId || !canManageDispatch) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverQueue(true);
              },
              onDrop: unassignDraggedOrder,
              style: {
                ...styles$6.panel,
                ...dragOverQueue ? styles$6.queueDropActive : {}
              },
              children: [/* @__PURE__ */ jsxs("div", {
                style: styles$6.panelHeader,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("h2", {
                    style: styles$6.panelTitle,
                    children: "Email Intake Queue"
                  }), /* @__PURE__ */ jsxs("p", {
                    style: styles$6.panelSub,
                    children: ["Orders that came in by email or were typed in manually can be reviewed and routed here.", canManageDispatch ? " Drag cards between the queue and routes to assign or unassign." : ""]
                  })]
                }), /* @__PURE__ */ jsx("div", {
                  style: styles$6.headerPill,
                  children: "Today"
                })]
              }), /* @__PURE__ */ jsx("div", {
                style: {
                  display: "grid",
                  gap: 10
                },
                children: activeOrders.map((order) => {
                  const active = order.id === (selectedOrder == null ? void 0 : selectedOrder.id);
                  const route38 = routes2.find((entry2) => entry2.id === order.assignedRouteId);
                  return /* @__PURE__ */ jsx("div", {
                    draggable: canManageDispatch,
                    onDragStart: (event) => startOrderDrag(order.id, event),
                    onDragEnd: clearDragState,
                    style: {
                      ...styles$6.queueCard,
                      borderColor: active ? "#38bdf8" : "rgba(51, 65, 85, 0.92)",
                      boxShadow: active ? "0 0 0 1px rgba(56, 189, 248, 0.45)" : "none",
                      cursor: canManageDispatch ? "grab" : "pointer",
                      opacity: draggedOrderId === order.id ? 0.58 : 1
                    },
                    children: /* @__PURE__ */ jsxs("div", {
                      style: styles$6.cardActionRow,
                      children: [/* @__PURE__ */ jsxs("a", {
                        href: dashboardSelectHref(order.id),
                        draggable: false,
                        style: styles$6.cardSelectArea,
                        children: [/* @__PURE__ */ jsxs("div", {
                          style: {
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12
                          },
                          children: [/* @__PURE__ */ jsxs("div", {
                            children: [/* @__PURE__ */ jsx("div", {
                              style: styles$6.queueTitle,
                              children: order.customer
                            }), /* @__PURE__ */ jsxs("div", {
                              style: styles$6.queueMeta,
                              children: [order.address, ", ", order.city]
                            })]
                          }), /* @__PURE__ */ jsx("div", {
                            style: styles$6.badge(order.status),
                            children: order.status
                          })]
                        }), /* @__PURE__ */ jsxs("div", {
                          style: styles$6.queueDetails,
                          children: [/* @__PURE__ */ jsx("span", {
                            children: getOrderDisplayNumber$2(order)
                          }), /* @__PURE__ */ jsxs("span", {
                            children: [order.quantity, " ", order.unit]
                          }), /* @__PURE__ */ jsx("span", {
                            children: order.material
                          }), order.travelMinutes ? /* @__PURE__ */ jsxs("span", {
                            children: [order.travelMinutes, " min RT"]
                          }) : null, order.timePreference ? /* @__PURE__ */ jsx("span", {
                            children: order.timePreference
                          }) : null, order.stopSequence ? /* @__PURE__ */ jsxs("span", {
                            children: ["Stop ", order.stopSequence]
                          }) : null]
                        }), order.notes ? /* @__PURE__ */ jsxs("div", {
                          style: styles$6.queueNotes,
                          children: [/* @__PURE__ */ jsx("strong", {
                            children: "Notes:"
                          }), " ", order.notes]
                        }) : null, /* @__PURE__ */ jsxs("div", {
                          style: styles$6.queueFooter,
                          children: [/* @__PURE__ */ jsx("span", {
                            children: order.requestedWindow
                          }), /* @__PURE__ */ jsx("span", {
                            children: route38 ? `${route38.truck} / ${getDeliveryStatusLabel(order.deliveryStatus)}` : "Unassigned"
                          })]
                        })]
                      }), /* @__PURE__ */ jsx("a", {
                        href: dashboardDetailHref(order.id),
                        draggable: false,
                        style: styles$6.detailButton,
                        children: "Open"
                      })]
                    })
                  }, order.id);
                })
              }), draggedOrderId && canManageDispatch ? /* @__PURE__ */ jsx("div", {
                style: dragOverQueue ? styles$6.dropHintActive : styles$6.dropHint,
                children: "Drop here to move back to queue"
              }) : null]
            })
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$6.centerColumn,
            children: [/* @__PURE__ */ jsxs("div", {
              id: "routes",
              style: styles$6.panel,
              children: [/* @__PURE__ */ jsxs("div", {
                style: styles$6.panelHeader,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("h2", {
                    style: styles$6.panelTitle,
                    children: "Routes & Fleet"
                  }), /* @__PURE__ */ jsx("p", {
                    style: styles$6.panelSub,
                    children: "Active trucks, crew assignments, and current stop counts."
                  })]
                }), /* @__PURE__ */ jsx("div", {
                  style: styles$6.headerPill,
                  children: "Live Board"
                })]
              }), /* @__PURE__ */ jsx("div", {
                style: {
                  display: "grid",
                  gap: 12
                },
                children: routes2.map((route38) => /* @__PURE__ */ jsxs("div", {
                  onDragEnter: (event) => {
                    if (!draggedOrderId || !canManageDispatch) return;
                    event.preventDefault();
                    setDragOverQueue(false);
                    setDragOverRouteId(route38.id);
                  },
                  onDragOver: (event) => {
                    if (!draggedOrderId || !canManageDispatch) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverQueue(false);
                    setDragOverRouteId(route38.id);
                  },
                  onDrop: (event) => assignDraggedOrder(route38.id, event),
                  style: {
                    ...styles$6.routeCard(route38.color),
                    ...dragOverRouteId === route38.id ? styles$6.routeDropActive : {}
                  },
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
                          style: styles$6.routeColor(route38.color)
                        }), /* @__PURE__ */ jsx("div", {
                          style: styles$6.routeCode,
                          children: route38.code
                        }), /* @__PURE__ */ jsx("div", {
                          style: styles$6.routeRegion,
                          children: route38.region
                        })]
                      }), /* @__PURE__ */ jsxs("div", {
                        style: {
                          marginTop: 8,
                          color: "#e2e8f0",
                          fontWeight: 700
                        },
                        children: [route38.truck, " · ", route38.driver, " / ", route38.helper]
                      })]
                    }), /* @__PURE__ */ jsx("a", {
                      href: `${driverHref}?route=${encodeURIComponent(route38.id)}`,
                      draggable: false,
                      style: styles$6.assignButton,
                      children: "Driver View"
                    }), selectedOrder ? selectedOrder.assignedRouteId === route38.id ? /* @__PURE__ */ jsxs(Form, {
                      method: "post",
                      style: styles$6.assignForm,
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
                        style: styles$6.secondaryButton,
                        children: "Unassign Selected"
                      })]
                    }) : /* @__PURE__ */ jsxs(Form, {
                      method: "post",
                      style: styles$6.assignForm,
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
                        value: route38.id
                      }), /* @__PURE__ */ jsx("input", {
                        name: "eta",
                        placeholder: "ETA",
                        defaultValue: selectedOrder.eta || "",
                        style: styles$6.compactInput
                      }), /* @__PURE__ */ jsx("button", {
                        type: "submit",
                        style: styles$6.assignButton,
                        children: "Assign Selected"
                      })]
                    }) : null]
                  }), draggedOrderId && canManageDispatch ? /* @__PURE__ */ jsxs("div", {
                    style: dragOverRouteId === route38.id ? styles$6.dropHintActive : styles$6.dropHint,
                    children: ["Drop here to assign to ", route38.code]
                  }) : null, /* @__PURE__ */ jsxs("div", {
                    style: styles$6.routeStats,
                    children: [/* @__PURE__ */ jsx("span", {
                      children: route38.shift
                    }), /* @__PURE__ */ jsxs("span", {
                      children: [route38.stops, " stops"]
                    }), /* @__PURE__ */ jsx("span", {
                      children: route38.loadSummary || "No assigned loads yet"
                    })]
                  }), route38.orders.length ? /* @__PURE__ */ jsx("div", {
                    style: styles$6.stopList,
                    children: route38.orders.map((order) => /* @__PURE__ */ jsxs("div", {
                      draggable: canManageDispatch,
                      onDragStartCapture: (event) => startOrderDrag(order.id, event),
                      onDragEnd: clearDragState,
                      style: {
                        ...styles$6.stopRow,
                        cursor: canManageDispatch ? "grab" : "default",
                        opacity: draggedOrderId === order.id ? 0.58 : 1
                      },
                      children: [/* @__PURE__ */ jsx("span", {
                        draggable: canManageDispatch,
                        onDragStart: (event) => startOrderDrag(order.id, event),
                        title: "Drag to another route or back to queue",
                        style: styles$6.dragHandle,
                        children: "::"
                      }), /* @__PURE__ */ jsxs("a", {
                        href: dashboardSelectHref(order.id),
                        draggable: false,
                        style: styles$6.stopSelectArea,
                        children: [/* @__PURE__ */ jsx("span", {
                          style: styles$6.stopNumber,
                          children: order.stopSequence || "-"
                        }), /* @__PURE__ */ jsxs("span", {
                          style: styles$6.stopMain,
                          children: [/* @__PURE__ */ jsx("strong", {
                            children: order.customer
                          }), /* @__PURE__ */ jsxs("small", {
                            children: [order.city, " · ", order.material]
                          })]
                        }), /* @__PURE__ */ jsx("span", {
                          style: styles$6.stopStatus(getDeliveryStatusColor(order.deliveryStatus)),
                          children: getDeliveryStatusLabel(order.deliveryStatus)
                        })]
                      }), /* @__PURE__ */ jsx("a", {
                        href: dashboardDetailHref(order.id),
                        draggable: false,
                        style: styles$6.stopDetailButton,
                        children: "Open"
                      })]
                    }, order.id))
                  }) : null, route38.orders.length ? /* @__PURE__ */ jsxs(Form, {
                    method: "post",
                    style: styles$6.sequenceForm,
                    children: [/* @__PURE__ */ jsx("input", {
                      type: "hidden",
                      name: "intent",
                      value: "sequence-route"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "hidden",
                      name: "routeId",
                      value: route38.id
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "sequenceMode",
                      style: styles$6.compactSelect,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "city",
                        children: "Sequence by city/address"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "address",
                        children: "Sequence by address"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "reverse",
                        children: "Reverse current order"
                      })]
                    }), /* @__PURE__ */ jsx("button", {
                      type: "submit",
                      style: styles$6.assignButton,
                      children: "Sequence Stops"
                    })]
                  }) : null]
                }, route38.id))
              })]
            }), /* @__PURE__ */ jsxs("div", {
              style: styles$6.panel,
              children: [/* @__PURE__ */ jsx("div", {
                style: styles$6.panelHeader,
                children: /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("h2", {
                    style: styles$6.panelTitle,
                    children: "Route Map Preview"
                  }), /* @__PURE__ */ jsx("p", {
                    style: styles$6.panelSub,
                    children: "Live Google route preview from the shop to each assigned stop and back."
                  })]
                })
              }), /* @__PURE__ */ jsx(RouteMapPreview, {
                googleMapsApiKey,
                originAddress: mapOriginAddress,
                routes: routes2
              })]
            })]
          }), dispatchDetailOpen ? /* @__PURE__ */ jsx("div", {
            style: styles$6.modalOverlay,
            children: /* @__PURE__ */ jsxs("div", {
              style: styles$6.dispatchModal,
              children: [/* @__PURE__ */ jsxs("div", {
                style: styles$6.panelHeader,
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("h2", {
                    style: styles$6.panelTitle,
                    children: "Dispatch Detail"
                  }), /* @__PURE__ */ jsx("p", {
                    style: styles$6.panelSub,
                    children: "Review the selected order, then assign it to a truck and crew or place it on hold."
                  })]
                }), /* @__PURE__ */ jsx("a", {
                  href: selectedOrder ? dashboardSelectHref(selectedOrder.id) : dispatchViewHref("dashboard"),
                  style: styles$6.modalCloseButton,
                  children: "Close"
                })]
              }), selectedOrder ? /* @__PURE__ */ jsxs("div", {
                style: {
                  display: "grid",
                  gap: 14
                },
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailId,
                    children: getOrderDisplayNumber$2(selectedOrder)
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$6.detailTitle,
                    children: selectedOrder.customer
                  }), /* @__PURE__ */ jsx("div", {
                    style: styles$6.detailMeta,
                    children: selectedOrder.contact
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.detailGrid,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Address"
                    }), /* @__PURE__ */ jsxs("div", {
                      style: styles$6.detailValue,
                      children: [selectedOrder.address, ", ", selectedOrder.city]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Load"
                    }), /* @__PURE__ */ jsxs("div", {
                      style: styles$6.detailValue,
                      children: [selectedOrder.quantity, " ", selectedOrder.unit, " ", selectedOrder.material]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Requested"
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.detailValue,
                      children: selectedOrder.requestedWindow
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Time Preference"
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.detailValue,
                      children: selectedOrder.timePreference || "No preference"
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Travel Time"
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.detailValue,
                      children: selectedOrder.travelSummary || "Not calculated yet"
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Truck Preference"
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.detailValue,
                      children: selectedOrder.truckPreference || "No preference"
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Route Stop"
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.detailValue,
                      children: selectedOrder.assignedRouteId ? `Stop ${selectedOrder.stopSequence || "-"}` : "Unassigned"
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Delivery Status"
                    }), /* @__PURE__ */ jsxs("div", {
                      style: {
                        ...styles$6.detailValue,
                        color: getDeliveryStatusColor(selectedOrder.deliveryStatus)
                      },
                      children: [getDeliveryStatusLabel(selectedOrder.deliveryStatus), selectedOrder.eta ? ` · ETA ${selectedOrder.eta}` : ""]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Inspection"
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.detailValue,
                      children: selectedOrder.inspectionStatus || "Not completed"
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.notesBlock,
                  children: [/* @__PURE__ */ jsx("div", {
                    style: styles$6.detailLabel,
                    children: "Notes"
                  }), /* @__PURE__ */ jsx("div", {
                    style: {
                      color: "#e2e8f0",
                      lineHeight: 1.55
                    },
                    children: selectedOrder.notes || "No dispatch notes yet."
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  style: styles$6.assignmentPanel,
                  children: [/* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      style: styles$6.detailLabel,
                      children: "Assigned Route"
                    }), /* @__PURE__ */ jsx("div", {
                      style: styles$6.detailValue,
                      children: selectedOrderRoute ? `${selectedOrderRoute.code} · ${selectedOrderRoute.truck} · ${selectedOrderRoute.driver}` : "Unassigned"
                    })]
                  }), /* @__PURE__ */ jsxs(Form, {
                    method: "post",
                    style: styles$6.assignmentForm,
                    children: [/* @__PURE__ */ jsx("input", {
                      type: "hidden",
                      name: "intent",
                      value: "assign-order"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "hidden",
                      name: "orderId",
                      value: selectedOrder.id
                    }), /* @__PURE__ */ jsxs("div", {
                      style: styles$6.formGridTwo,
                      children: [/* @__PURE__ */ jsxs("div", {
                        children: [/* @__PURE__ */ jsx("label", {
                          style: styles$6.label,
                          children: "Assign To Route / Driver"
                        }), /* @__PURE__ */ jsxs("select", {
                          name: "routeId",
                          defaultValue: selectedOrder.assignedRouteId || "",
                          style: styles$6.input,
                          required: true,
                          children: [/* @__PURE__ */ jsx("option", {
                            value: "",
                            disabled: true,
                            children: "Select route"
                          }), routes2.map((route38) => /* @__PURE__ */ jsxs("option", {
                            value: route38.id,
                            children: [route38.code, " - ", route38.truck, " - ", route38.driver]
                          }, route38.id))]
                        })]
                      }), /* @__PURE__ */ jsxs("div", {
                        children: [/* @__PURE__ */ jsx("label", {
                          style: styles$6.label,
                          children: "ETA"
                        }), /* @__PURE__ */ jsx("input", {
                          name: "eta",
                          defaultValue: selectedOrder.eta || "",
                          placeholder: "Optional",
                          style: styles$6.input
                        })]
                      })]
                    }), /* @__PURE__ */ jsx("button", {
                      type: "submit",
                      style: styles$6.primaryButton,
                      children: selectedOrder.assignedRouteId ? "Reassign Order" : "Assign Order"
                    })]
                  })]
                }), /* @__PURE__ */ jsxs(Form, {
                  method: "post",
                  style: styles$6.stopStatusForm,
                  children: [/* @__PURE__ */ jsx("input", {
                    type: "hidden",
                    name: "intent",
                    value: "update-stop-status"
                  }), /* @__PURE__ */ jsx("input", {
                    type: "hidden",
                    name: "orderId",
                    value: selectedOrder.id
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Stop Status"
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "deliveryStatus",
                      defaultValue: selectedOrder.deliveryStatus || "not_started",
                      style: styles$6.input,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "not_started",
                        children: "Dispatched"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "en_route",
                        children: "Enroute"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "delivered",
                        children: "Delivered"
                      })]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Proof Name"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "proofName",
                      defaultValue: selectedOrder.proofName || "",
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Signature / Authorized Name"
                    }), /* @__PURE__ */ jsx("input", {
                      name: "signatureName",
                      defaultValue: selectedOrder.signatureName || (selectedOrderRoute == null ? void 0 : selectedOrderRoute.driver) || "",
                      style: styles$6.input
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Photo Links"
                    }), /* @__PURE__ */ jsx("textarea", {
                      name: "photoUrls",
                      defaultValue: selectedOrder.photoUrls || "",
                      rows: 3,
                      placeholder: "Paste photo URLs or file references, one per line",
                      style: {
                        ...styles$6.input,
                        resize: "vertical"
                      }
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Inspection Status"
                    }), /* @__PURE__ */ jsxs("select", {
                      name: "inspectionStatus",
                      defaultValue: selectedOrder.inspectionStatus || "",
                      style: styles$6.input,
                      children: [/* @__PURE__ */ jsx("option", {
                        value: "",
                        children: "Not completed"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "Passed",
                        children: "Passed"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "Needs review",
                        children: "Needs review"
                      }), /* @__PURE__ */ jsx("option", {
                        value: "Blocked",
                        children: "Blocked"
                      })]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    style: styles$6.checklistGrid,
                    children: [/* @__PURE__ */ jsxs("label", {
                      style: styles$6.checkboxLabel,
                      children: [/* @__PURE__ */ jsx("input", {
                        type: "checkbox",
                        name: "siteSafe"
                      }), " Site safe"]
                    }), /* @__PURE__ */ jsxs("label", {
                      style: styles$6.checkboxLabel,
                      children: [/* @__PURE__ */ jsx("input", {
                        type: "checkbox",
                        name: "loadMatchesTicket"
                      }), " Load matches ticket"]
                    }), /* @__PURE__ */ jsxs("label", {
                      style: styles$6.checkboxLabel,
                      children: [/* @__PURE__ */ jsx("input", {
                        type: "checkbox",
                        name: "customerConfirmedPlacement"
                      }), " Placement confirmed"]
                    }), /* @__PURE__ */ jsxs("label", {
                      style: styles$6.checkboxLabel,
                      children: [/* @__PURE__ */ jsx("input", {
                        type: "checkbox",
                        name: "photosTaken"
                      }), " Photos taken"]
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Custom Checklist Notes"
                    }), /* @__PURE__ */ jsx("textarea", {
                      name: "customChecklist",
                      rows: 3,
                      defaultValue: selectedOrder.checklistJson || "",
                      style: {
                        ...styles$6.input,
                        resize: "vertical"
                      }
                    })]
                  }), /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("label", {
                      style: styles$6.label,
                      children: "Proof Notes"
                    }), /* @__PURE__ */ jsx("textarea", {
                      name: "proofNotes",
                      defaultValue: selectedOrder.proofNotes || "",
                      rows: 3,
                      style: {
                        ...styles$6.input,
                        resize: "vertical"
                      }
                    })]
                  }), /* @__PURE__ */ jsx("button", {
                    type: "submit",
                    style: styles$6.primaryButton,
                    children: "Update Stop"
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
                      style: styles$6.secondaryButton,
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
                      style: styles$6.secondaryButton,
                      children: "Put On Hold"
                    })]
                  }), /* @__PURE__ */ jsxs(Form, {
                    method: "post",
                    onSubmit: (event) => {
                      if (!window.confirm("Delete this order? This cannot be undone.")) {
                        event.preventDefault();
                      }
                    },
                    children: [/* @__PURE__ */ jsx("input", {
                      type: "hidden",
                      name: "intent",
                      value: "delete-order"
                    }), /* @__PURE__ */ jsx("input", {
                      type: "hidden",
                      name: "orderId",
                      value: selectedOrder.id
                    }), /* @__PURE__ */ jsx("button", {
                      type: "submit",
                      style: styles$6.dangerButton,
                      children: "Delete Order"
                    })]
                  })]
                })]
              }) : /* @__PURE__ */ jsx("div", {
                style: {
                  color: "#94a3b8"
                },
                children: "Select an order to view dispatch detail."
              })]
            })
          }) : null]
        }) : null]
      })]
    })
  });
});
const styles$6 = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top left, rgba(14, 165, 233, 0.14), transparent 26%), radial-gradient(circle at top right, rgba(20, 184, 166, 0.12), transparent 24%), linear-gradient(180deg, #09101d 0%, #0f172a 42%, #020617 100%)",
    color: "#f8fafc",
    padding: "18px",
    fontFamily: '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  appFrame: {
    maxWidth: 1740,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "230px minmax(0, 1fr)",
    gap: 18,
    alignItems: "start"
  },
  sidebar: {
    position: "sticky",
    top: 18,
    minHeight: "calc(100vh - 36px)",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: 22,
    padding: 18,
    borderRadius: 28,
    border: "1px solid rgba(30, 41, 59, 0.95)",
    background: "linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.96))",
    boxShadow: "0 24px 60px rgba(2, 6, 23, 0.42)"
  },
  brandBlock: {
    display: "flex",
    alignItems: "center",
    gap: 12
  },
  brandMark: {
    width: 70,
    height: 54,
    borderRadius: 16,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(2, 6, 23, 0.64)",
    border: "1px solid rgba(132, 204, 22, 0.32)",
    overflow: "hidden",
    boxShadow: "0 12px 28px rgba(22, 163, 74, 0.24)"
  },
  brandLogo: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block"
  },
  brandTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: 900,
    lineHeight: 1.1
  },
  brandSub: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800
  },
  sideNav: {
    display: "grid",
    alignContent: "start",
    gap: 8
  },
  sideNavLink: (active) => ({
    minHeight: 46,
    display: "flex",
    alignItems: "center",
    padding: "0 13px",
    borderRadius: 16,
    color: active ? "#ecfeff" : "#cbd5e1",
    textDecoration: "none",
    fontWeight: 800,
    border: active ? "1px solid rgba(14, 165, 233, 0.42)" : "1px solid transparent",
    background: active ? "linear-gradient(135deg, rgba(14, 165, 233, 0.24), rgba(20, 184, 166, 0.16))" : "rgba(15, 23, 42, 0.35)"
  }),
  sidebarFooter: {
    display: "grid",
    gap: 8
  },
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
    fontWeight: 800
  },
  shell: {
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
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 18,
    padding: 22,
    borderRadius: 30,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "radial-gradient(circle at 10% 20%, rgba(14, 165, 233, 0.18), transparent 24%), linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.92))",
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
    margin: "8px 0 0",
    fontSize: "2.35rem",
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
    gridTemplateColumns: "minmax(320px, 0.9fr) minmax(520px, 1.25fr)",
    gap: 18,
    alignItems: "start"
  },
  focusGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.1fr) minmax(360px, 0.9fr)",
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
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "grid",
    placeItems: "center",
    padding: 22,
    background: "rgba(2, 6, 23, 0.72)",
    backdropFilter: "blur(10px)"
  },
  orderModal: {
    width: "min(920px, 100%)",
    maxHeight: "calc(100vh - 44px)",
    overflowY: "auto",
    borderRadius: 30,
    border: "1px solid rgba(56, 189, 248, 0.32)",
    background: "linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.96))",
    padding: 24,
    boxShadow: "0 34px 90px rgba(2, 6, 23, 0.68)"
  },
  dispatchModal: {
    width: "min(980px, 100%)",
    maxHeight: "calc(100vh - 44px)",
    overflowY: "auto",
    borderRadius: 30,
    border: "1px solid rgba(56, 189, 248, 0.32)",
    background: "linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.96))",
    padding: 24,
    boxShadow: "0 34px 90px rgba(2, 6, 23, 0.68)"
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 18
  },
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
    fontWeight: 800
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
  queueDropActive: {
    borderColor: "rgba(34, 197, 94, 0.68)",
    background: "linear-gradient(145deg, rgba(34, 197, 94, 0.1), rgba(15, 23, 42, 0.92))",
    boxShadow: "inset 0 0 0 1px rgba(34, 197, 94, 0.28), 0 22px 42px rgba(34, 197, 94, 0.12)"
  },
  cardActionRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "center"
  },
  cardSelectArea: {
    minWidth: 0,
    color: "inherit",
    textDecoration: "none"
  },
  detailButton: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(14, 165, 233, 0.14)",
    border: "1px solid rgba(56, 189, 248, 0.42)",
    color: "#bae6fd",
    fontSize: 12,
    fontWeight: 900,
    textDecoration: "none",
    whiteSpace: "nowrap"
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
  queueNotes: {
    marginTop: 10,
    padding: "9px 10px",
    borderRadius: 12,
    background: "rgba(15, 23, 42, 0.7)",
    border: "1px solid rgba(51, 65, 85, 0.62)",
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 1.45
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
  compactInput: {
    width: 82,
    boxSizing: "border-box",
    minHeight: 42,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.94)",
    color: "#f8fafc",
    fontSize: 13,
    outline: "none"
  },
  compactSelect: {
    minHeight: 42,
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.94)",
    color: "#f8fafc",
    fontSize: 13,
    outline: "none"
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
  dangerButton: {
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(248, 113, 113, 0.55)",
    background: "rgba(127, 29, 29, 0.42)",
    color: "#fecaca",
    fontWeight: 800,
    cursor: "pointer"
  },
  smallDangerButton: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(248, 113, 113, 0.55)",
    background: "rgba(127, 29, 29, 0.42)",
    color: "#fecaca",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer"
  },
  deliveredActions: {
    marginTop: 14,
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap"
  },
  routeCard: (color) => ({
    borderRadius: 20,
    padding: 18,
    border: `1px solid ${color}44`,
    background: "linear-gradient(145deg, rgba(2, 6, 23, 0.86), rgba(15, 23, 42, 0.98))",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 18px 28px ${color}12`
  }),
  routeDropActive: {
    borderColor: "#38bdf8",
    background: "linear-gradient(145deg, rgba(14, 165, 233, 0.22), rgba(15, 23, 42, 0.98))",
    boxShadow: "inset 0 0 0 1px rgba(56, 189, 248, 0.45), 0 22px 42px rgba(14, 165, 233, 0.18)"
  },
  dropHint: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px dashed rgba(56, 189, 248, 0.28)",
    background: "rgba(14, 165, 233, 0.08)",
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em"
  },
  dropHintActive: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(56, 189, 248, 0.65)",
    background: "rgba(14, 165, 233, 0.18)",
    color: "#e0f2fe",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: "0.08em"
  },
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
  sequenceForm: {
    marginTop: 12,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  routeCreateForm: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid rgba(51, 65, 85, 0.82)",
    display: "grid",
    gap: 12
  },
  resourceSummary: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14
  },
  resourceList: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 8
  },
  resourceCard: {
    minWidth: 220,
    display: "grid",
    gap: 5,
    padding: 14,
    borderRadius: 16,
    background: "rgba(2, 6, 23, 0.62)",
    border: "1px solid rgba(51, 65, 85, 0.82)",
    color: "#e2e8f0"
  },
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
    fontWeight: 700
  },
  assignForm: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
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
    cursor: "pointer"
  },
  stopList: {
    marginTop: 14,
    display: "grid",
    gap: 8
  },
  stopRow: {
    display: "grid",
    gridTemplateColumns: "22px minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(2, 6, 23, 0.62)",
    border: "1px solid rgba(51, 65, 85, 0.78)",
    textDecoration: "none",
    color: "#f8fafc",
    userSelect: "none"
  },
  dragHandle: {
    width: 22,
    minHeight: 34,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(56, 189, 248, 0.28)",
    background: "rgba(14, 165, 233, 0.1)",
    color: "#7dd3fc",
    fontWeight: 950,
    cursor: "grab",
    userSelect: "none",
    touchAction: "none"
  },
  stopSelectArea: {
    display: "grid",
    gridTemplateColumns: "32px minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
    minWidth: 0,
    color: "inherit",
    textDecoration: "none"
  },
  stopDetailButton: {
    minHeight: 30,
    padding: "0 9px",
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(14, 165, 233, 0.12)",
    border: "1px solid rgba(56, 189, 248, 0.36)",
    color: "#bae6fd",
    fontSize: 11,
    fontWeight: 900,
    textDecoration: "none",
    whiteSpace: "nowrap"
  },
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
    fontWeight: 900
  },
  stopMain: {
    display: "grid",
    gap: 3,
    minWidth: 0
  },
  stopStatus: (color) => ({
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
    whiteSpace: "nowrap"
  }),
  stopStatusForm: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    background: "rgba(2, 6, 23, 0.62)",
    border: "1px solid rgba(51, 65, 85, 0.82)"
  },
  assignmentPanel: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    background: "linear-gradient(145deg, rgba(14, 165, 233, 0.14), rgba(2, 6, 23, 0.68))",
    border: "1px solid rgba(56, 189, 248, 0.32)"
  },
  assignmentForm: {
    display: "grid",
    gap: 12
  },
  checklistGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8
  },
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
    fontWeight: 800
  },
  mapStage: {
    position: "relative",
    minHeight: 380,
    borderRadius: 24,
    overflow: "hidden",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "#0f172a"
  },
  googleMapCanvas: {
    position: "absolute",
    inset: 0,
    minHeight: 380
  },
  mapStatus: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "radial-gradient(circle at 20% 20%, rgba(14,165,233,0.18), transparent 26%), rgba(2, 6, 23, 0.86)",
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: 800,
    textAlign: "center"
  },
  mapNotice: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    display: "grid",
    gap: 6,
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(15, 23, 42, 0.9)",
    border: "1px solid rgba(251, 146, 60, 0.55)",
    color: "#fed7aa",
    fontSize: 12,
    fontWeight: 800,
    zIndex: 2
  },
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
  deliveredPhoto: {
    width: "100%",
    maxHeight: 520,
    marginTop: 10,
    borderRadius: 16,
    objectFit: "contain",
    background: "rgba(15, 23, 42, 0.92)",
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
  skipReasonList: {
    display: "grid",
    gap: 8,
    marginTop: 12
  },
  skipReasonItem: {
    display: "grid",
    gap: 3,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(2, 6, 23, 0.28)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "inherit",
    fontSize: 13,
    lineHeight: 1.35
  },
  badge: (status) => {
    const palette = status === "scheduled" ? {
      color: "#bbf7d0",
      border: "rgba(34, 197, 94, 0.35)",
      bg: "rgba(34, 197, 94, 0.12)"
    } : status === "delivered" ? {
      color: "#bae6fd",
      border: "rgba(56, 189, 248, 0.35)",
      bg: "rgba(56, 189, 248, 0.12)"
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
  action: action$h,
  default: dispatch,
  loader: loader$c
}, Symbol.toStringTag, { value: "Module" }));
function getDriverPath(url) {
  return url.pathname.startsWith("/app/") ? "/app/dispatch/driver" : "/dispatch/driver";
}
function getDispatchPath(pathname) {
  return pathname.startsWith("/app/") ? "/app/dispatch" : "/dispatch";
}
function getStatusLabel$1(status) {
  if (status === "en_route") return "Enroute";
  if (status === "delivered") return "Delivered";
  return "Dispatched";
}
function getStatusColor$1(status) {
  if (status === "delivered") return "#16a34a";
  if (status === "en_route") return "#ea580c";
  return "#0284c7";
}
function getOrderDisplayNumber$1(order) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}
function buildChecklistJson(form) {
  return JSON.stringify({
    siteSafe: form.get("siteSafe") === "on",
    loadMatchesTicket: form.get("loadMatchesTicket") === "on",
    customerConfirmedPlacement: form.get("customerConfirmedPlacement") === "on",
    photosTaken: form.get("photosTaken") === "on",
    customChecklist: String(form.get("customChecklist") || "").trim()
  });
}
async function loadDriverState() {
  try {
    await ensureSeedDispatchTrucks();
    await ensureSeedDispatchEmployees();
    await ensureSeedDispatchOrders();
    await ensureSeedDispatchRoutes();
    if (process.env.DISPATCH_AUTO_DAILY_RESET === "true") {
      await resetDispatchRoutesForNewDay();
    }
    return {
      orders: await getDispatchOrders(),
      routes: await getDispatchRoutes(),
      storageReady: true,
      storageError: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load driver route data";
    console.error("[DISPATCH DRIVER STORAGE ERROR]", message);
    return {
      orders: seedDispatchOrders,
      routes: seedDispatchRoutes,
      storageReady: false,
      storageError: message
    };
  }
}
async function loader$b({
  request
}) {
  const url = new URL(request.url);
  const driverPath = getDriverPath(url);
  if (url.searchParams.get("logout") === "1") {
    return redirect(driverPath, {
      headers: [["Set-Cookie", await userAuthCookie.serialize("", {
        maxAge: 0
      })], ["Set-Cookie", await adminQuoteCookie.serialize("", {
        maxAge: 0
      })]]
    });
  }
  const allowed = await hasAdminQuotePermissionAccess(request, "driver");
  if (!allowed) {
    return data({
      allowed: false,
      orders: [],
      routes: [],
      storageReady: false,
      storageError: null
    });
  }
  return data({
    allowed: true,
    ...await loadDriverState()
  });
}
async function action$g({
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
    return data({
      allowed: true,
      loginError: null,
      ...await loadDriverState()
    }, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("ok")
      }
    });
  }
  const allowed = await hasAdminQuotePermissionAccess(request, "driver");
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
  if (intent !== "update-stop-status") {
    return data({
      allowed: true,
      ok: false,
      message: "Unknown driver action.",
      ...await loadDriverState()
    }, {
      status: 400
    });
  }
  const orderId = String(form.get("orderId") || "").trim();
  const routeId = String(form.get("routeId") || "").trim();
  const rawStatus = String(form.get("deliveryStatus") || "").trim();
  const deliveryStatus = rawStatus === "en_route" || rawStatus === "delivered" || rawStatus === "not_started" ? rawStatus : "not_started";
  if (!orderId) {
    return data({
      allowed: true,
      ok: false,
      message: "Missing stop selection.",
      selectedRouteId: routeId || null,
      ...await loadDriverState()
    }, {
      status: 400
    });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const currentState = await loadDriverState();
  const currentOrder = currentState.orders.find((order) => order.id === orderId) || null;
  const currentRoute = currentState.routes.find((route38) => route38.id === (routeId || (currentOrder == null ? void 0 : currentOrder.assignedRouteId))) || null;
  const patch = {
    deliveryStatus,
    proofName: String(form.get("proofName") || "").trim() || null,
    proofNotes: String(form.get("proofNotes") || "").trim() || null,
    signatureName: String(form.get("signatureName") || "").trim() || null,
    signatureData: String(form.get("signatureData") || "").trim() || null,
    photoUrls: String(form.get("photoUrls") || "").trim() || null,
    inspectionStatus: String(form.get("inspectionStatus") || "").trim() || null,
    checklistJson: buildChecklistJson(form)
  };
  if (deliveryStatus === "en_route") patch.departedAt = now;
  if (deliveryStatus === "delivered") {
    patch.status = "delivered";
    patch.departedAt = patch.departedAt || now;
    patch.deliveredAt = now;
  }
  const updatedOrder = await updateDispatchOrder(orderId, patch);
  let emailNote = "";
  if (deliveryStatus === "delivered") {
    try {
      const emailResult = await sendDeliveryConfirmationEmail({
        order: updatedOrder,
        route: currentRoute
      });
      emailNote = emailResult.sent ? " Delivery confirmation email sent." : ` Delivery confirmation email skipped: ${emailResult.reason}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email error.";
      emailNote = ` Delivery confirmation email failed: ${message}`;
    }
  }
  return data({
    allowed: true,
    ok: true,
    message: `Stop marked ${getStatusLabel$1(deliveryStatus).toLowerCase()}.${emailNote}`,
    selectedRouteId: routeId || null,
    selectedOrderId: orderId,
    ...await loadDriverState()
  });
}
const dispatchDriver = UNSAFE_withComponentProps(function DispatchDriverPage() {
  var _a2;
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const location = useLocation();
  const allowed = (actionData == null ? void 0 : actionData.allowed) ?? loaderData.allowed;
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const detailHref = isEmbeddedRoute ? "/app/dispatch/driver/detail" : "/dispatch/driver/detail";
  const dispatchHref = getDispatchPath(location.pathname);
  const logoutHref = `${driverHref}?logout=1`;
  const orders = (actionData == null ? void 0 : actionData.orders) ?? loaderData.orders ?? [];
  const routes2 = (actionData == null ? void 0 : actionData.routes) ?? loaderData.routes ?? [];
  const storageReady = (actionData == null ? void 0 : actionData.storageReady) ?? loaderData.storageReady ?? false;
  const storageError = (actionData == null ? void 0 : actionData.storageError) ?? loaderData.storageError ?? null;
  const searchParams = new URLSearchParams(location.search);
  const selectedRouteId = (actionData == null ? void 0 : actionData.selectedRouteId) || searchParams.get("route") || ((_a2 = routes2[0]) == null ? void 0 : _a2.id) || "";
  const selectedRoute = routes2.find((route38) => route38.id === selectedRouteId) || routes2[0] || null;
  const routeStops = useMemo(() => selectedRoute ? orders.filter((order) => order.assignedRouteId === selectedRoute.id && order.status !== "delivered" && order.deliveryStatus !== "delivered").sort((a, b) => Number(a.stopSequence || 9999) - Number(b.stopSequence || 9999)) : [], [orders, selectedRoute]);
  const completedCount = routeStops.filter((stop) => stop.deliveryStatus === "delivered").length;
  if (!allowed) {
    return /* @__PURE__ */ jsx("div", {
      style: styles$5.page,
      children: /* @__PURE__ */ jsxs("div", {
        style: styles$5.loginCard,
        children: [/* @__PURE__ */ jsx("h1", {
          style: styles$5.title,
          children: "Driver Route"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$5.subtle,
          children: "Enter the admin password to open route stops."
        }), /* @__PURE__ */ jsxs(Form, {
          method: "post",
          style: {
            display: "grid",
            gap: 12,
            marginTop: 18
          },
          children: [/* @__PURE__ */ jsx("input", {
            type: "hidden",
            name: "intent",
            value: "login"
          }), /* @__PURE__ */ jsx("label", {
            style: styles$5.label,
            children: "Admin Password"
          }), /* @__PURE__ */ jsx("input", {
            name: "password",
            type: "password",
            style: styles$5.input
          }), (actionData == null ? void 0 : actionData.loginError) ? /* @__PURE__ */ jsx("div", {
            style: styles$5.error,
            children: actionData.loginError
          }) : null, /* @__PURE__ */ jsx("button", {
            type: "submit",
            style: styles$5.primaryButton,
            children: "Open Route"
          })]
        })]
      })
    });
  }
  return /* @__PURE__ */ jsx("div", {
    style: styles$5.page,
    children: /* @__PURE__ */ jsxs("div", {
      style: styles$5.shell,
      children: [/* @__PURE__ */ jsxs("header", {
        style: styles$5.header,
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("div", {
            style: styles$5.kicker,
            children: "Driver Mode"
          }), /* @__PURE__ */ jsx("h1", {
            style: styles$5.title,
            children: (selectedRoute == null ? void 0 : selectedRoute.truck) || "Driver Route"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$5.subtle,
            children: selectedRoute ? `${selectedRoute.driver}${selectedRoute.helper ? ` / ${selectedRoute.helper}` : ""} · ${selectedRoute.shift || "Shift not set"}` : "No active route selected"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles$5.headerActions,
          children: [/* @__PURE__ */ jsx("a", {
            href: dispatchHref,
            style: styles$5.ghostButton,
            children: "Dispatch"
          }), /* @__PURE__ */ jsx("a", {
            href: logoutHref,
            style: styles$5.ghostButton,
            children: "Log Out"
          })]
        })]
      }), !storageReady ? /* @__PURE__ */ jsxs("div", {
        style: styles$5.warning,
        children: ["Run `dispatch_schema.sql` in Supabase, then refresh.", storageError ? ` Storage error: ${storageError}` : ""]
      }) : null, (actionData == null ? void 0 : actionData.message) ? /* @__PURE__ */ jsx("div", {
        style: actionData.ok ? styles$5.success : styles$5.error,
        children: actionData.message
      }) : null, /* @__PURE__ */ jsx("section", {
        style: styles$5.routePicker,
        children: routes2.map((route38) => /* @__PURE__ */ jsxs("a", {
          href: `${driverHref}?route=${encodeURIComponent(route38.id)}`,
          style: {
            ...styles$5.routeChip,
            borderColor: route38.id === (selectedRoute == null ? void 0 : selectedRoute.id) ? route38.color : "rgba(203, 213, 225, 0.28)",
            background: route38.id === (selectedRoute == null ? void 0 : selectedRoute.id) ? `${route38.color}22` : "#ffffff"
          },
          children: [/* @__PURE__ */ jsx("span", {
            style: {
              ...styles$5.routeDot,
              background: route38.color
            }
          }), /* @__PURE__ */ jsx("span", {
            children: route38.code
          }), /* @__PURE__ */ jsx("small", {
            children: route38.truck
          })]
        }, route38.id))
      }), /* @__PURE__ */ jsxs("section", {
        style: styles$5.summaryGrid,
        children: [/* @__PURE__ */ jsxs("div", {
          style: styles$5.summaryCard,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Stops"
          }), /* @__PURE__ */ jsx("strong", {
            children: routeStops.length
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles$5.summaryCard,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Delivered"
          }), /* @__PURE__ */ jsx("strong", {
            children: completedCount
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles$5.summaryCard,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Remaining"
          }), /* @__PURE__ */ jsx("strong", {
            children: Math.max(routeStops.length - completedCount, 0)
          })]
        })]
      }), /* @__PURE__ */ jsx("main", {
        style: styles$5.stopList,
        children: routeStops.length === 0 ? /* @__PURE__ */ jsx("div", {
          style: styles$5.empty,
          children: "No stops assigned to this route yet."
        }) : routeStops.map((stop) => /* @__PURE__ */ jsxs("article", {
          style: styles$5.stopCard,
          children: [/* @__PURE__ */ jsxs("div", {
            style: styles$5.stopTop,
            children: [/* @__PURE__ */ jsx("div", {
              style: styles$5.stopNumber,
              children: stop.stopSequence || "-"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                minWidth: 0
              },
              children: [/* @__PURE__ */ jsx("h2", {
                style: styles$5.stopTitle,
                children: stop.customer
              }), /* @__PURE__ */ jsxs("p", {
                style: styles$5.stopAddress,
                children: [stop.address, ", ", stop.city]
              })]
            }), /* @__PURE__ */ jsx("span", {
              style: {
                ...styles$5.statusPill,
                color: getStatusColor$1(stop.deliveryStatus),
                borderColor: `${getStatusColor$1(stop.deliveryStatus)}55`,
                background: `${getStatusColor$1(stop.deliveryStatus)}18`
              },
              children: getStatusLabel$1(stop.deliveryStatus)
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: styles$5.sheetGrid,
            children: [/* @__PURE__ */ jsxs("section", {
              style: styles$5.sheetSection,
              children: [/* @__PURE__ */ jsx("h3", {
                style: styles$5.sheetTitle,
                children: "Driver & Truck"
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Truck",
                value: (selectedRoute == null ? void 0 : selectedRoute.truck) || "Not set"
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Driver",
                value: (selectedRoute == null ? void 0 : selectedRoute.driver) || "Not set"
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Order Number",
                value: getOrderDisplayNumber$1(stop)
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Requested Date",
                value: stop.requestedWindow || "Not set"
              })]
            }), /* @__PURE__ */ jsxs("section", {
              style: styles$5.sheetSection,
              children: [/* @__PURE__ */ jsx("h3", {
                style: styles$5.sheetTitle,
                children: "Ordered Product"
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Product Ordered",
                value: stop.material || "Not set"
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Product Type",
                value: stop.unit || "Not set"
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Quantity Ordered",
                value: `${stop.quantity || "-"} ${stop.unit || ""}`.trim()
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Truck Load",
                value: `${stop.quantity || "-"} ${stop.unit || ""}`.trim()
              })]
            }), /* @__PURE__ */ jsxs("section", {
              style: styles$5.sheetSection,
              children: [/* @__PURE__ */ jsx("h3", {
                style: styles$5.sheetTitle,
                children: "Customer Information"
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Customer Name",
                value: stop.customer || "Not set"
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Contact",
                value: stop.contact || "Not captured"
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "Address",
                value: `${stop.address}, ${stop.city}`
              }), /* @__PURE__ */ jsx(SheetLine, {
                label: "ETA",
                value: stop.eta || "Not set"
              })]
            })]
          }), stop.notes ? /* @__PURE__ */ jsx("p", {
            style: styles$5.notes,
            children: stop.notes
          }) : null, /* @__PURE__ */ jsx(StopDeliveryForm, {
            stop,
            routeId: (selectedRoute == null ? void 0 : selectedRoute.id) || "",
            driverName: (selectedRoute == null ? void 0 : selectedRoute.driver) || "",
            detailHref
          })]
        }, stop.id))
      })]
    })
  });
});
function SheetLine({
  label,
  value
}) {
  return /* @__PURE__ */ jsxs("div", {
    style: styles$5.sheetLine,
    children: [/* @__PURE__ */ jsx("span", {
      children: label
    }), /* @__PURE__ */ jsx("strong", {
      children: value
    })]
  });
}
function isImageProof$1(value) {
  return /^data:image\//i.test(value) || /^https?:\/\/.+\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i.test(value);
}
function readCompressedImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read selected photo."));
    reader.onload = () => {
      const originalDataUrl = String(reader.result || "");
      const image = new Image();
      image.onerror = () => resolve(originalDataUrl);
      image.onload = () => {
        var _a2;
        const maxDimension = 1280;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        (_a2 = canvas.getContext("2d")) == null ? void 0 : _a2.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
function StopDeliveryForm({
  stop,
  routeId,
  driverName,
  detailHref
}) {
  const [photoProof, setPhotoProof] = useState(stop.photoUrls || "");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(stop.photoUrls && isImageProof$1(stop.photoUrls) ? stop.photoUrls : "");
  const [gpsProof, setGpsProof] = useState(stop.signatureData || "");
  const [gpsStatus, setGpsStatus] = useState("");
  useEffect(() => {
    return () => {
      if (photoPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);
  function captureGps() {
    if (!navigator.geolocation) {
      setGpsStatus("GPS is not available on this device.");
      return;
    }
    setGpsStatus("Getting GPS location...");
    navigator.geolocation.getCurrentPosition((position) => {
      const {
        latitude,
        longitude,
        accuracy
      } = position.coords;
      const capturedAt = (/* @__PURE__ */ new Date()).toLocaleString();
      setGpsProof(`GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} accuracy ${Math.round(accuracy)}m captured ${capturedAt}`);
      setGpsStatus("GPS location captured.");
    }, (error) => {
      setGpsStatus(error.message || "Unable to capture GPS location.");
    }, {
      enableHighAccuracy: true,
      timeout: 12e3,
      maximumAge: 0
    });
  }
  return /* @__PURE__ */ jsxs(Form, {
    method: "post",
    style: styles$5.stopForm,
    children: [/* @__PURE__ */ jsx("input", {
      type: "hidden",
      name: "intent",
      value: "update-stop-status"
    }), /* @__PURE__ */ jsx("input", {
      type: "hidden",
      name: "routeId",
      value: routeId
    }), /* @__PURE__ */ jsx("input", {
      type: "hidden",
      name: "orderId",
      value: stop.id
    }), /* @__PURE__ */ jsx("div", {
      style: styles$5.statusButtons,
      children: [["not_started", "Dispatched"], ["en_route", "Enroute"]].map(([value, label]) => /* @__PURE__ */ jsx("button", {
        type: "submit",
        name: "deliveryStatus",
        value,
        style: styles$5.statusButton,
        children: label
      }, value))
    }), /* @__PURE__ */ jsxs("section", {
      style: styles$5.capturePanel,
      children: [/* @__PURE__ */ jsxs("div", {
        children: [/* @__PURE__ */ jsx("div", {
          style: styles$5.captureTitle,
          children: "Delivery Proof"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$5.captureHelp,
          children: "Capture the delivery photo and GPS before submitting the stop as delivered."
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles$5.captureGrid,
        children: [/* @__PURE__ */ jsxs("label", {
          style: styles$5.cameraButton,
          children: ["Take Picture", /* @__PURE__ */ jsx("input", {
            type: "file",
            accept: "image/*",
            capture: "environment",
            style: {
              display: "none"
            },
            onChange: (event) => {
              var _a2;
              const file = (_a2 = event.currentTarget.files) == null ? void 0 : _a2[0];
              if (file) {
                readCompressedImageDataUrl(file).then((dataUrl) => {
                  setPhotoPreviewUrl((currentPreviewUrl) => {
                    if (currentPreviewUrl.startsWith("blob:")) {
                      URL.revokeObjectURL(currentPreviewUrl);
                    }
                    return dataUrl;
                  });
                  setPhotoProof(dataUrl);
                }).catch((error) => {
                  setPhotoProof(error instanceof Error ? error.message : "Unable to load photo.");
                });
              }
            }
          })]
        }), /* @__PURE__ */ jsx("button", {
          type: "button",
          style: styles$5.gpsButton,
          onClick: captureGps,
          children: "Capture GPS"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles$5.proofStatusGrid,
        children: [/* @__PURE__ */ jsxs("div", {
          style: styles$5.proofStatusBox,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Photo"
          }), photoPreviewUrl ? /* @__PURE__ */ jsx("img", {
            src: photoPreviewUrl,
            alt: "Delivery proof preview",
            style: styles$5.photoPreview
          }) : /* @__PURE__ */ jsx("strong", {
            children: "Not captured"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles$5.proofStatusBox,
          children: [/* @__PURE__ */ jsx("span", {
            children: "GPS"
          }), /* @__PURE__ */ jsx("strong", {
            children: gpsProof || gpsStatus || "Not captured"
          })]
        })]
      })]
    }), /* @__PURE__ */ jsx("div", {
      style: styles$5.proofGrid,
      children: /* @__PURE__ */ jsxs("div", {
        children: [/* @__PURE__ */ jsx("label", {
          style: styles$5.label,
          children: "Driver Signature / Name"
        }), /* @__PURE__ */ jsx("input", {
          name: "signatureName",
          defaultValue: stop.signatureName || driverName,
          placeholder: "Driver name",
          style: styles$5.input
        })]
      })
    }), /* @__PURE__ */ jsxs("div", {
      children: [/* @__PURE__ */ jsx("label", {
        style: styles$5.label,
        children: "Driver Notes Upon Delivery"
      }), /* @__PURE__ */ jsx("textarea", {
        name: "proofNotes",
        defaultValue: stop.proofNotes || "",
        rows: 3,
        placeholder: "Gate code, placement note, blocked access, customer request...",
        style: styles$5.textarea
      })]
    }), /* @__PURE__ */ jsx("input", {
      type: "hidden",
      name: "proofName",
      value: driverName || stop.proofName || ""
    }), /* @__PURE__ */ jsx("input", {
      type: "hidden",
      name: "signatureData",
      value: gpsProof
    }), /* @__PURE__ */ jsx("input", {
      type: "hidden",
      name: "photoUrls",
      value: photoProof
    }), /* @__PURE__ */ jsx("input", {
      type: "hidden",
      name: "inspectionStatus",
      value: stop.inspectionStatus || ""
    }), /* @__PURE__ */ jsx("input", {
      type: "hidden",
      name: "customChecklist",
      value: stop.checklistJson || ""
    }), /* @__PURE__ */ jsxs("div", {
      style: styles$5.utilityRow,
      children: [/* @__PURE__ */ jsx("a", {
        href: `https://maps.google.com/?q=${encodeURIComponent(`${stop.address}, ${stop.city}`)}`,
        target: "_blank",
        rel: "noreferrer",
        style: styles$5.mapButton,
        children: "Open Map"
      }), /* @__PURE__ */ jsx("button", {
        type: "button",
        style: styles$5.detailButton,
        onClick: () => {
          const url = `${detailHref}?order=${encodeURIComponent(stop.id)}`;
          window.open(url, `dispatch-stop-${stop.id}`, "width=720,height=860,menubar=no,toolbar=no,location=no,status=no");
        },
        children: "Full Detail"
      })]
    }), /* @__PURE__ */ jsx("button", {
      type: "submit",
      name: "deliveryStatus",
      value: "delivered",
      style: styles$5.deliveredButton,
      children: "Submit Delivery"
    })]
  });
}
const styles$5 = {
  page: {
    minHeight: "100vh",
    background: "#f1f5f9",
    color: "#0f172a",
    padding: "16px 14px 34px",
    fontFamily: '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  shell: {
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 14
  },
  loginCard: {
    maxWidth: 460,
    margin: "12vh auto 0",
    padding: 20,
    borderRadius: 10,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.12)"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 10,
    background: "#ffffff",
    border: "1px solid #e2e8f0"
  },
  headerActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  kicker: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em"
  },
  title: {
    margin: "4px 0 0",
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 900,
    letterSpacing: 0
  },
  subtle: {
    margin: "6px 0 0",
    color: "#64748b",
    lineHeight: 1.45
  },
  ghostButton: {
    minHeight: 40,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 13
  },
  routePicker: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10
  },
  routeChip: {
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr) auto",
    gap: 8,
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    color: "#0f172a",
    textDecoration: "none",
    fontWeight: 900
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10
  },
  summaryCard: {
    display: "grid",
    gap: 4,
    padding: 14,
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid #e2e8f0"
  },
  stopList: {
    display: "grid",
    gap: 12
  },
  stopCard: {
    padding: 16,
    borderRadius: 14,
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    boxShadow: "0 14px 28px rgba(15, 23, 42, 0.08)"
  },
  stopTop: {
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center"
  },
  stopNumber: {
    width: 36,
    height: 36,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 900
  },
  stopTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: 0
  },
  stopAddress: {
    margin: "3px 0 0",
    color: "#475569",
    lineHeight: 1.35
  },
  statusPill: {
    minHeight: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 10px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap"
  },
  detailButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid #bae6fd",
    background: "#e0f2fe",
    color: "#075985",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    padding: "0 12px",
    whiteSpace: "nowrap"
  },
  mapButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid #bbf7d0",
    background: "#dcfce7",
    color: "#166534",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    padding: "0 14px",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none"
  },
  sheetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 14
  },
  sheetSection: {
    borderRadius: 10,
    border: "1px solid #dbe4ef",
    background: "#fbfdff",
    padding: 12
  },
  sheetTitle: {
    margin: "0 0 10px",
    paddingBottom: 8,
    borderBottom: "2px solid #0f172a",
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.08em",
    textTransform: "uppercase"
  },
  sheetLine: {
    display: "grid",
    gridTemplateColumns: "minmax(100px, 0.8fr) minmax(0, 1.2fr)",
    gap: 10,
    alignItems: "baseline",
    padding: "7px 0",
    borderBottom: "1px solid #e2e8f0",
    color: "#475569",
    fontSize: 12
  },
  notes: {
    margin: "12px 0 0",
    padding: 12,
    borderRadius: 8,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#334155",
    lineHeight: 1.45
  },
  stopForm: {
    display: "grid",
    gap: 12,
    marginTop: 12
  },
  statusButtons: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
    gap: 8
  },
  statusButton: {
    minHeight: 52,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer"
  },
  proofGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10
  },
  capturePanel: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    border: "1px solid #bae6fd",
    background: "linear-gradient(145deg, #eff6ff, #f8fafc)"
  },
  captureTitle: {
    fontSize: 16,
    fontWeight: 950,
    color: "#0f172a"
  },
  captureHelp: {
    margin: "4px 0 0",
    color: "#64748b",
    lineHeight: 1.4,
    fontSize: 13
  },
  captureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10
  },
  cameraButton: {
    minHeight: 52,
    borderRadius: 10,
    border: "1px solid #0284c7",
    background: "#0ea5e9",
    color: "#ffffff",
    fontWeight: 950,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center"
  },
  gpsButton: {
    minHeight: 52,
    borderRadius: 10,
    border: "1px solid #16a34a",
    background: "#22c55e",
    color: "#052e16",
    fontWeight: 950,
    cursor: "pointer"
  },
  proofStatusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10
  },
  proofStatusBox: {
    minHeight: 58,
    display: "grid",
    gap: 4,
    alignContent: "center",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#334155",
    fontSize: 12
  },
  photoPreview: {
    width: "100%",
    maxHeight: 260,
    borderRadius: 10,
    objectFit: "cover",
    border: "1px solid #cbd5e1",
    background: "#e2e8f0"
  },
  utilityRow: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    flexWrap: "wrap"
  },
  label: {
    display: "block",
    marginBottom: 6,
    color: "#475569",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
  },
  input: {
    width: "100%",
    minHeight: 42,
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    padding: "10px 11px",
    fontSize: 14
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    padding: "10px 11px",
    fontSize: 14,
    resize: "vertical"
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 8,
    border: "none",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer"
  },
  deliveredButton: {
    minHeight: 58,
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #16a34a, #22c55e)",
    color: "#052e16",
    fontWeight: 950,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(22, 163, 74, 0.24)"
  },
  success: {
    padding: 12,
    borderRadius: 8,
    background: "#dcfce7",
    border: "1px solid #86efac",
    color: "#166534",
    fontWeight: 800
  },
  warning: {
    padding: 12,
    borderRadius: 8,
    background: "#fef3c7",
    border: "1px solid #facc15",
    color: "#854d0e",
    fontWeight: 800
  },
  error: {
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    border: "1px solid #fca5a5",
    color: "#991b1b",
    fontWeight: 800
  },
  empty: {
    padding: 18,
    borderRadius: 10,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    color: "#64748b",
    fontWeight: 800,
    textAlign: "center"
  }
};
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$g,
  default: dispatchDriver,
  loader: loader$b
}, Symbol.toStringTag, { value: "Module" }));
function getDetailPath(url) {
  return url.pathname.startsWith("/app/") ? "/app/dispatch/driver/detail" : "/dispatch/driver/detail";
}
function getStatusLabel(status) {
  if (status === "en_route") return "Enroute";
  if (status === "delivered") return "Delivered";
  return "Dispatched";
}
function getStatusColor(status) {
  if (status === "delivered") return "#16a34a";
  if (status === "en_route") return "#ea580c";
  return "#0284c7";
}
function getOrderDisplayNumber(order) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}
function isImageProof(value) {
  return /^data:image\//i.test(String(value || "")) || /^https?:\/\/.+\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i.test(String(value || ""));
}
async function loadOrder(orderId) {
  await ensureSeedDispatchTrucks();
  await ensureSeedDispatchEmployees();
  await ensureSeedDispatchOrders();
  await ensureSeedDispatchRoutes();
  const orders = await getDispatchOrders();
  return orders.find((order) => order.id === orderId) || null;
}
async function loader$a({
  request
}) {
  const url = new URL(request.url);
  const detailPath = getDetailPath(url);
  if (url.searchParams.get("logout") === "1") {
    return redirect(detailPath, {
      headers: [["Set-Cookie", await userAuthCookie.serialize("", {
        maxAge: 0
      })], ["Set-Cookie", await adminQuoteCookie.serialize("", {
        maxAge: 0
      })]]
    });
  }
  const allowed = await hasAdminQuotePermissionAccess(request, "driver");
  if (!allowed) {
    return data({
      allowed: false,
      order: null
    });
  }
  const orderId = url.searchParams.get("order") || "";
  const order = orderId ? await loadOrder(orderId) : null;
  return data({
    allowed: true,
    order
  });
}
const dispatchDriverDetail = UNSAFE_withComponentProps(function DispatchDriverDetailPage() {
  const loaderData = useLoaderData();
  const order = loaderData.order;
  if (!loaderData.allowed) {
    return /* @__PURE__ */ jsx("main", {
      style: styles$4.page,
      children: /* @__PURE__ */ jsxs("section", {
        style: styles$4.card,
        children: [/* @__PURE__ */ jsx("h1", {
          style: styles$4.title,
          children: "Driver Stop Detail"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$4.muted,
          children: "Please open the driver route and log in first."
        })]
      })
    });
  }
  if (!order) {
    return /* @__PURE__ */ jsx("main", {
      style: styles$4.page,
      children: /* @__PURE__ */ jsxs("section", {
        style: styles$4.card,
        children: [/* @__PURE__ */ jsx("h1", {
          style: styles$4.title,
          children: "Stop Not Found"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$4.muted,
          children: "This stop may have been unassigned or deleted."
        })]
      })
    });
  }
  return /* @__PURE__ */ jsx("main", {
    style: styles$4.page,
    children: /* @__PURE__ */ jsxs("section", {
      style: styles$4.card,
      children: [/* @__PURE__ */ jsxs("div", {
        style: styles$4.header,
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("div", {
            style: styles$4.kicker,
            children: getOrderDisplayNumber(order)
          }), /* @__PURE__ */ jsx("h1", {
            style: styles$4.title,
            children: order.customer
          }), /* @__PURE__ */ jsx("p", {
            style: styles$4.muted,
            children: order.contact || "No contact captured"
          })]
        }), /* @__PURE__ */ jsx("span", {
          style: {
            ...styles$4.status,
            color: getStatusColor(order.deliveryStatus),
            borderColor: `${getStatusColor(order.deliveryStatus)}55`,
            background: `${getStatusColor(order.deliveryStatus)}18`
          },
          children: getStatusLabel(order.deliveryStatus)
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles$4.grid,
        children: [/* @__PURE__ */ jsx(Info, {
          label: "Address",
          value: `${order.address}, ${order.city}`
        }), /* @__PURE__ */ jsx(Info, {
          label: "Load",
          value: `${order.quantity} ${order.unit} ${order.material}`
        }), /* @__PURE__ */ jsx(Info, {
          label: "Requested",
          value: order.requestedWindow || "Not set"
        }), /* @__PURE__ */ jsx(Info, {
          label: "Time Preference",
          value: order.timePreference || "No preference"
        }), /* @__PURE__ */ jsx(Info, {
          label: "Travel Time",
          value: order.travelSummary || "Not calculated"
        }), /* @__PURE__ */ jsx(Info, {
          label: "ETA",
          value: order.eta || "Not set"
        }), /* @__PURE__ */ jsx(Info, {
          label: "Stop",
          value: order.stopSequence ? `Stop ${order.stopSequence}` : "Unassigned"
        }), /* @__PURE__ */ jsx(Info, {
          label: "Inspection",
          value: order.inspectionStatus || "Not completed"
        }), /* @__PURE__ */ jsx(Info, {
          label: "Proof Name",
          value: order.proofName || "Not captured"
        })]
      }), /* @__PURE__ */ jsxs("section", {
        style: styles$4.noteBox,
        children: [/* @__PURE__ */ jsx("div", {
          style: styles$4.label,
          children: "Notes"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$4.noteText,
          children: order.notes || "No dispatch notes yet."
        })]
      }), order.proofNotes || order.photoUrls || order.signatureName ? /* @__PURE__ */ jsxs("section", {
        style: styles$4.noteBox,
        children: [/* @__PURE__ */ jsx("div", {
          style: styles$4.label,
          children: "Driver Proof"
        }), order.signatureName ? /* @__PURE__ */ jsxs("p", {
          style: styles$4.noteText,
          children: ["Signature: ", order.signatureName]
        }) : null, order.proofNotes ? /* @__PURE__ */ jsxs("p", {
          style: styles$4.noteText,
          children: ["Proof notes: ", order.proofNotes]
        }) : null, order.photoUrls ? isImageProof(order.photoUrls) ? /* @__PURE__ */ jsx("img", {
          src: order.photoUrls,
          alt: "Delivered material proof",
          style: styles$4.photoPreview
        }) : /* @__PURE__ */ jsxs("p", {
          style: styles$4.noteText,
          children: ["Photos: ", order.photoUrls]
        }) : null]
      }) : null]
    })
  });
});
function Info({
  label,
  value
}) {
  return /* @__PURE__ */ jsxs("div", {
    style: styles$4.infoCard,
    children: [/* @__PURE__ */ jsx("div", {
      style: styles$4.label,
      children: label
    }), /* @__PURE__ */ jsx("div", {
      style: styles$4.value,
      children: value
    })]
  });
}
const styles$4 = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    padding: 16,
    fontFamily: '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  card: {
    maxWidth: 760,
    margin: "0 auto",
    padding: 18,
    borderRadius: 12,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 16
  },
  kicker: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em"
  },
  title: {
    margin: "4px 0 0",
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 900
  },
  muted: {
    margin: "6px 0 0",
    color: "#64748b",
    lineHeight: 1.4
  },
  status: {
    minHeight: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10
  },
  infoCard: {
    padding: 12,
    borderRadius: 10,
    background: "#f8fafc",
    border: "1px solid #e2e8f0"
  },
  label: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  value: {
    marginTop: 5,
    color: "#0f172a",
    fontWeight: 850,
    lineHeight: 1.35
  },
  noteBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    background: "#f1f5f9",
    border: "1px solid #e2e8f0"
  },
  noteText: {
    margin: "6px 0 0",
    color: "#334155",
    lineHeight: 1.45,
    whiteSpace: "pre-wrap"
  },
  photoPreview: {
    width: "100%",
    maxHeight: 460,
    marginTop: 8,
    borderRadius: 10,
    objectFit: "contain",
    background: "#e2e8f0",
    border: "1px solid #cbd5e1"
  }
};
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: dispatchDriverDetail,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
function formatMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}
const styles$3 = {
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
    ...styles$3.navLink,
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
async function loader$9({
  request
}) {
  const url = new URL(request.url);
  const isEmbeddedRoute = url.pathname.startsWith("/app/");
  const dashboardPath = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  if (url.searchParams.get("logout") === "1") {
    return redirect(dashboardPath, {
      headers: [["Set-Cookie", await userAuthCookie.serialize("", {
        maxAge: 0
      })], ["Set-Cookie", await adminQuoteCookie.serialize("", {
        maxAge: 0
      })]]
    });
  }
  const allowed = await hasAdminQuotePermissionAccess(request, "quoteTool");
  const recentQuotes = allowed ? await getRecentCustomQuotes(8) : [];
  return data({
    allowed,
    recentQuotes
  });
}
async function action$f({
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
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  if (!allowed) {
    return /* @__PURE__ */ jsx("div", {
      style: styles$3.page,
      children: /* @__PURE__ */ jsx("div", {
        style: styles$3.shell,
        children: /* @__PURE__ */ jsxs("div", {
          style: styles$3.card,
          children: [/* @__PURE__ */ jsx("h1", {
            style: styles$3.title,
            children: "Mobile Dashboard"
          }), /* @__PURE__ */ jsx("p", {
            style: styles$3.subtitle,
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
                ...styles$3.smallButton,
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
    style: styles$3.page,
    children: [/* @__PURE__ */ jsxs("div", {
      style: styles$3.shell,
      children: [/* @__PURE__ */ jsxs("div", {
        style: {
          ...styles$3.card,
          position: "sticky",
          top: 10,
          zIndex: 18
        },
        children: [/* @__PURE__ */ jsx("h1", {
          style: styles$3.title,
          children: "Local Contractor Quote"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$3.subtitle,
          children: "Quick mobile entry point for building quotes, reviewing history, and jumping into the right pricing mode fast."
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles$3.card,
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles$3.sectionTitle,
          children: "Start A Quote"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$3.sectionSub,
          children: "Choose the quote mode you want before opening the full builder."
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            display: "grid",
            gap: 12,
            marginTop: 14
          },
          children: [/* @__PURE__ */ jsxs("a", {
            href: `${quoteToolBase}?audience=customer`,
            style: styles$3.button,
            children: [/* @__PURE__ */ jsx("span", {
              style: styles$3.buttonTitle,
              children: "Customer Quote"
            }), /* @__PURE__ */ jsx("span", {
              style: styles$3.buttonSub,
              children: "Standard customer pricing and normal quote flow."
            })]
          }), /* @__PURE__ */ jsxs("a", {
            href: `${quoteToolBase}?audience=contractor&tier=tier1`,
            style: styles$3.button,
            children: [/* @__PURE__ */ jsx("span", {
              style: styles$3.buttonTitle,
              children: "Contractor Quote"
            }), /* @__PURE__ */ jsx("span", {
              style: styles$3.buttonSub,
              children: "Open the builder with contractor pricing ready to go."
            })]
          }), /* @__PURE__ */ jsxs("a", {
            href: `${quoteToolBase}?audience=custom`,
            style: styles$3.button,
            children: [/* @__PURE__ */ jsx("span", {
              style: styles$3.buttonTitle,
              children: "Custom Quote"
            }), /* @__PURE__ */ jsx("span", {
              style: styles$3.buttonSub,
              children: "Editable pricing, shipping math, and manual adjustments."
            })]
          })]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles$3.card,
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles$3.sectionTitle,
          children: "Quick Actions"
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            display: "grid",
            gap: 12,
            marginTop: 14
          },
          children: [/* @__PURE__ */ jsx("a", {
            href: quoteToolBase,
            style: styles$3.smallButton,
            children: "Open Quote Tool"
          }), /* @__PURE__ */ jsx("a", {
            href: reviewHref,
            style: styles$3.smallButton,
            children: "Review Quotes"
          }), /* @__PURE__ */ jsx("a", {
            href: dispatchHref,
            style: styles$3.smallButton,
            children: "Dispatch"
          }), /* @__PURE__ */ jsx("a", {
            href: driverHref,
            style: styles$3.smallButton,
            children: "Driver Route"
          }), /* @__PURE__ */ jsx("a", {
            href: `${dashboardHref}?logout=1`,
            style: styles$3.smallButton,
            children: "Log Out"
          })]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles$3.card,
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles$3.sectionTitle,
          children: "Recent Quotes"
        }), /* @__PURE__ */ jsx("p", {
          style: styles$3.sectionSub,
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
              ...styles$3.button,
              minHeight: "unset",
              overflowWrap: "anywhere"
            },
            children: [/* @__PURE__ */ jsx("span", {
              style: styles$3.buttonTitle,
              children: quote.customer_name || quote.customer_email || "Unnamed quote"
            }), /* @__PURE__ */ jsxs("span", {
              style: styles$3.buttonSub,
              children: [formatMoney(quote.quote_total_cents), " · ", quote.city, ", ", quote.province]
            }), /* @__PURE__ */ jsx("span", {
              style: {
                ...styles$3.buttonSub,
                color: "#94a3b8"
              },
              children: new Date(quote.created_at).toLocaleString()
            })]
          }, quote.id))
        })]
      })]
    }), /* @__PURE__ */ jsxs("div", {
      style: styles$3.bottomNav,
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
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$f,
  default: mobileDashboard,
  loader: loader$9
}, Symbol.toStringTag, { value: "Module" }));
async function loader$8({
  request
}) {
  const url = new URL(request.url);
  if (url.searchParams.get("logout") === "1") {
    return redirect("/login", {
      headers: [["Set-Cookie", await userAuthCookie.serialize("", {
        maxAge: 0
      })], ["Set-Cookie", await adminQuoteCookie.serialize("", {
        maxAge: 0
      })]]
    });
  }
  const user = await getCurrentUser(request);
  const next = url.searchParams.get("next") || "/custom-quote";
  if (user) return redirect(next);
  return data({
    next
  });
}
async function action$e({
  request
}) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const next = String(form.get("next") || "/custom-quote");
  try {
    const session = await signInContractorUser(email, password);
    return redirect(session.profile.mustChangePassword ? `/change-password?next=${encodeURIComponent(next)}` : next, {
      headers: {
        "Set-Cookie": session.cookie
      }
    });
  } catch (error) {
    return data({
      next,
      error: error instanceof Error ? error.message : "Unable to sign in."
    }, {
      status: 400
    });
  }
}
const login = UNSAFE_withComponentProps(function LoginPage() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  return /* @__PURE__ */ jsx("main", {
    style: styles$2.page,
    children: /* @__PURE__ */ jsxs("section", {
      style: styles$2.card,
      children: [/* @__PURE__ */ jsx("img", {
        src: "/green-hills-logo.png",
        alt: "Green Hills Supply",
        style: styles$2.logo
      }), /* @__PURE__ */ jsx("p", {
        style: styles$2.kicker,
        children: "Contractor Workspace"
      }), /* @__PURE__ */ jsx("h1", {
        style: styles$2.title,
        children: "Sign in"
      }), /* @__PURE__ */ jsx("p", {
        style: styles$2.subtitle,
        children: "Use your Supabase user account to open the quote, dispatch, and driver tools."
      }), /* @__PURE__ */ jsxs(Form, {
        method: "post",
        style: styles$2.form,
        children: [/* @__PURE__ */ jsx("input", {
          type: "hidden",
          name: "next",
          value: (actionData == null ? void 0 : actionData.next) || loaderData.next
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("label", {
            style: styles$2.label,
            children: "Email"
          }), /* @__PURE__ */ jsx("input", {
            name: "email",
            type: "email",
            autoComplete: "email",
            required: true,
            style: styles$2.input
          })]
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("label", {
            style: styles$2.label,
            children: "Password"
          }), /* @__PURE__ */ jsx("input", {
            name: "password",
            type: "password",
            autoComplete: "current-password",
            required: true,
            style: styles$2.input
          })]
        }), (actionData == null ? void 0 : actionData.error) ? /* @__PURE__ */ jsx("div", {
          style: styles$2.error,
          children: actionData.error
        }) : null, /* @__PURE__ */ jsx("button", {
          type: "submit",
          style: styles$2.button,
          disabled: isSubmitting,
          children: isSubmitting ? "Signing in..." : "Sign In"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: styles$2.links,
        children: [/* @__PURE__ */ jsx(Link, {
          to: "/custom-quote",
          style: styles$2.link,
          children: "Quote Tool"
        }), /* @__PURE__ */ jsx(Link, {
          to: "/dispatch",
          style: styles$2.link,
          children: "Dispatch"
        })]
      })]
    })
  });
});
const styles$2 = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "radial-gradient(circle at top left, rgba(132, 204, 22, 0.2), transparent 28%), radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.2), transparent 30%), linear-gradient(180deg, #0f172a, #020617)",
    color: "#f8fafc",
    fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  card: {
    width: "min(440px, 100%)",
    padding: 28,
    borderRadius: 28,
    border: "1px solid rgba(132, 204, 22, 0.28)",
    background: "rgba(15, 23, 42, 0.92)",
    boxShadow: "0 34px 90px rgba(2, 6, 23, 0.5)"
  },
  logo: {
    width: 132,
    height: "auto",
    display: "block",
    marginBottom: 18
  },
  kicker: {
    margin: 0,
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase"
  },
  title: {
    margin: "8px 0 0",
    fontSize: 36,
    lineHeight: 1
  },
  subtitle: {
    margin: "10px 0 0",
    color: "#cbd5e1",
    lineHeight: 1.5
  },
  form: {
    display: "grid",
    gap: 14,
    marginTop: 22
  },
  label: {
    display: "block",
    marginBottom: 6,
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  input: {
    width: "100%",
    minHeight: 48,
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "#020617",
    color: "#f8fafc",
    padding: "0 14px",
    fontSize: 16
  },
  error: {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(248, 113, 113, 0.4)",
    background: "rgba(127, 29, 29, 0.35)",
    color: "#fecaca",
    fontWeight: 800
  },
  button: {
    minHeight: 52,
    border: "none",
    borderRadius: 16,
    background: "linear-gradient(135deg, #84cc16, #22c55e)",
    color: "#052e16",
    fontWeight: 950,
    cursor: "pointer"
  },
  links: {
    display: "flex",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap"
  },
  link: {
    color: "#93c5fd",
    fontWeight: 800,
    textDecoration: "none"
  }
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$e,
  default: login,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
async function loader$7({
  request
}) {
  const url = new URL(request.url);
  const user = await getCurrentUser(request);
  if (!user) {
    return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return data({
    user,
    next: url.searchParams.get("next") || "/custom-quote"
  });
}
async function action$d({
  request
}) {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  const next = String(form.get("next") || "/custom-quote");
  if (password.length < 8) {
    return data({
      next,
      error: "Password must be at least 8 characters."
    }, {
      status: 400
    });
  }
  if (password !== confirmPassword) {
    return data({
      next,
      error: "Passwords do not match."
    }, {
      status: 400
    });
  }
  try {
    const cookie = await changeCurrentUserPassword(request, password);
    return redirect(next, {
      headers: {
        "Set-Cookie": cookie
      }
    });
  } catch (error) {
    return data({
      next,
      error: error instanceof Error ? error.message : "Unable to change password."
    }, {
      status: 400
    });
  }
}
const changePassword = UNSAFE_withComponentProps(function ChangePasswordPage() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  return /* @__PURE__ */ jsx("main", {
    style: styles$1.page,
    children: /* @__PURE__ */ jsxs("section", {
      style: styles$1.card,
      children: [/* @__PURE__ */ jsx("img", {
        src: "/green-hills-logo.png",
        alt: "Green Hills Supply",
        style: styles$1.logo
      }), /* @__PURE__ */ jsx("p", {
        style: styles$1.kicker,
        children: "Account Security"
      }), /* @__PURE__ */ jsx("h1", {
        style: styles$1.title,
        children: "Change Password"
      }), /* @__PURE__ */ jsx("p", {
        style: styles$1.subtitle,
        children: loaderData.user.mustChangePassword ? "This is your first login with a temporary password, so choose a new password to continue." : "Update your password whenever you need to."
      }), /* @__PURE__ */ jsxs(Form, {
        method: "post",
        style: styles$1.form,
        children: [/* @__PURE__ */ jsx("input", {
          type: "hidden",
          name: "next",
          value: (actionData == null ? void 0 : actionData.next) || loaderData.next
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("label", {
            style: styles$1.label,
            children: "New Password"
          }), /* @__PURE__ */ jsx("input", {
            name: "password",
            type: "password",
            autoComplete: "new-password",
            required: true,
            style: styles$1.input
          })]
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("label", {
            style: styles$1.label,
            children: "Confirm Password"
          }), /* @__PURE__ */ jsx("input", {
            name: "confirmPassword",
            type: "password",
            autoComplete: "new-password",
            required: true,
            style: styles$1.input
          })]
        }), (actionData == null ? void 0 : actionData.error) ? /* @__PURE__ */ jsx("div", {
          style: styles$1.error,
          children: actionData.error
        }) : null, /* @__PURE__ */ jsx("button", {
          type: "submit",
          style: styles$1.button,
          disabled: isSubmitting,
          children: isSubmitting ? "Saving..." : "Save Password"
        })]
      }), !loaderData.user.mustChangePassword ? /* @__PURE__ */ jsx(Link, {
        to: loaderData.next,
        style: styles$1.link,
        children: "Back to app"
      }) : null]
    })
  });
});
const styles$1 = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "radial-gradient(circle at top left, rgba(132, 204, 22, 0.2), transparent 28%), radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.2), transparent 30%), linear-gradient(180deg, #0f172a, #020617)",
    color: "#f8fafc",
    fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  card: {
    width: "min(440px, 100%)",
    padding: 28,
    borderRadius: 28,
    border: "1px solid rgba(132, 204, 22, 0.28)",
    background: "rgba(15, 23, 42, 0.92)",
    boxShadow: "0 34px 90px rgba(2, 6, 23, 0.5)"
  },
  logo: {
    width: 132,
    height: "auto",
    display: "block",
    marginBottom: 18
  },
  kicker: {
    margin: 0,
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase"
  },
  title: {
    margin: "8px 0 0",
    fontSize: 36,
    lineHeight: 1
  },
  subtitle: {
    margin: "10px 0 0",
    color: "#cbd5e1",
    lineHeight: 1.5
  },
  form: {
    display: "grid",
    gap: 14,
    marginTop: 22
  },
  label: {
    display: "block",
    marginBottom: 6,
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  input: {
    width: "100%",
    minHeight: 48,
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "#020617",
    color: "#f8fafc",
    padding: "0 14px",
    fontSize: 16
  },
  error: {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(248, 113, 113, 0.4)",
    background: "rgba(127, 29, 29, 0.35)",
    color: "#fecaca",
    fontWeight: 800
  },
  button: {
    minHeight: 52,
    border: "none",
    borderRadius: 16,
    background: "linear-gradient(135deg, #84cc16, #22c55e)",
    color: "#052e16",
    fontWeight: 950,
    cursor: "pointer"
  },
  link: {
    display: "inline-flex",
    marginTop: 16,
    color: "#93c5fd",
    fontWeight: 850,
    textDecoration: "none"
  }
};
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$d,
  default: changePassword,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
async function loader$6({
  request
}) {
  const currentUser = await requireUserPermission(request, "manageUsers");
  const [users, auditEvents] = await Promise.all([listAppUsers(), currentUser.permissions.includes("auditLog") ? listAuditEvents(150) : []]);
  return data({
    currentUser,
    users,
    auditEvents,
    allPermissions,
    permissionLabels
  });
}
async function action$c({
  request
}) {
  const currentUser = await requireUserPermission(request, "manageUsers");
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const permissions = form.getAll("permissions").map(String);
  const loadSettingsData = async () => ({
    ...Object.fromEntries(await Promise.all([listAppUsers().then((users) => ["users", users]), (currentUser.permissions.includes("auditLog") ? listAuditEvents(150) : Promise.resolve([])).then((auditEvents) => ["auditEvents", auditEvents])]))
  });
  try {
    if (intent === "create-user") {
      const createdUser = await createAppUser({
        email: String(form.get("email") || "").trim(),
        password: String(form.get("password") || ""),
        name: String(form.get("name") || "").trim(),
        role: String(form.get("role") || "user").trim(),
        permissions
      });
      await logAuditEvent({
        actor: currentUser,
        action: "create_user",
        targetType: "user",
        targetId: createdUser.id,
        targetLabel: createdUser.email,
        details: {
          name: createdUser.name,
          role: createdUser.role,
          permissions: createdUser.permissions,
          isActive: createdUser.isActive,
          temporaryPasswordRequired: true
        }
      });
      return data({
        ok: true,
        message: "User created.",
        ...await loadSettingsData()
      });
    }
    if (intent === "update-user") {
      const updatedUser = await updateAppUserProfile({
        id: String(form.get("userId") || ""),
        name: String(form.get("name") || "").trim(),
        role: String(form.get("role") || "user").trim(),
        permissions,
        isActive: form.get("isActive") === "on"
      });
      await logAuditEvent({
        actor: currentUser,
        action: "update_user",
        targetType: "user",
        targetId: updatedUser.id,
        targetLabel: updatedUser.email,
        details: {
          name: updatedUser.name,
          role: updatedUser.role,
          permissions: updatedUser.permissions,
          isActive: updatedUser.isActive
        }
      });
      return data({
        ok: true,
        message: "User updated.",
        ...await loadSettingsData()
      });
    }
    return data({
      ok: false,
      message: "Unknown settings action."
    }, {
      status: 400
    });
  } catch (error) {
    return data({
      ok: false,
      message: error instanceof Error ? error.message : "Unable to save user settings.",
      ...await loadSettingsData()
    }, {
      status: 400
    });
  }
}
const settings = UNSAFE_withComponentProps(function SettingsPage() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const users = (actionData == null ? void 0 : actionData.users) || loaderData.users;
  const auditEvents = (actionData == null ? void 0 : actionData.auditEvents) || loaderData.auditEvents;
  const isSubmitting = navigation.state === "submitting";
  const canAccess = (permission) => {
    var _a2;
    return (_a2 = loaderData.currentUser.permissions) == null ? void 0 : _a2.includes(permission);
  };
  return /* @__PURE__ */ jsx("main", {
    style: styles.page,
    children: /* @__PURE__ */ jsxs("div", {
      style: styles.shell,
      children: [/* @__PURE__ */ jsxs("header", {
        style: styles.header,
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("p", {
            style: styles.kicker,
            children: "Admin Settings"
          }), /* @__PURE__ */ jsx("h1", {
            style: styles.title,
            children: "Users, Roles & Privileges"
          }), /* @__PURE__ */ jsx("p", {
            style: styles.subtitle,
            children: "Control which parts of the contractor app each user can see and what they can do."
          })]
        }), /* @__PURE__ */ jsxs("nav", {
          style: styles.nav,
          children: [canAccess("quoteTool") ? /* @__PURE__ */ jsx(Link, {
            to: "/custom-quote",
            style: styles.navButton,
            children: "Quote Tool"
          }) : null, canAccess("dispatch") ? /* @__PURE__ */ jsx(Link, {
            to: "/dispatch",
            style: styles.navButton,
            children: "Dispatch"
          }) : null, /* @__PURE__ */ jsx(Link, {
            to: "/change-password",
            style: styles.navButton,
            children: "Change Password"
          }), /* @__PURE__ */ jsx(Link, {
            to: "/login?logout=1",
            style: styles.navButton,
            children: "Log Out"
          })]
        })]
      }), (actionData == null ? void 0 : actionData.message) ? /* @__PURE__ */ jsx("div", {
        style: actionData.ok ? styles.success : styles.error,
        children: actionData.message
      }) : null, /* @__PURE__ */ jsxs("section", {
        style: styles.panel,
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles.panelTitle,
          children: "Create User"
        }), /* @__PURE__ */ jsxs(Form, {
          method: "post",
          style: styles.form,
          children: [/* @__PURE__ */ jsx("input", {
            type: "hidden",
            name: "intent",
            value: "create-user"
          }), /* @__PURE__ */ jsxs("div", {
            style: styles.formGrid,
            children: [/* @__PURE__ */ jsx(Field, {
              label: "Name",
              name: "name"
            }), /* @__PURE__ */ jsx(Field, {
              label: "Email",
              name: "email",
              type: "email"
            }), /* @__PURE__ */ jsx(Field, {
              label: "Temporary Password",
              name: "password",
              type: "password"
            }), /* @__PURE__ */ jsx(RoleSelect, {
              defaultValue: "user"
            })]
          }), /* @__PURE__ */ jsx(PermissionGrid, {
            selected: ["quoteTool"]
          }), /* @__PURE__ */ jsx("button", {
            type: "submit",
            style: styles.primaryButton,
            disabled: isSubmitting,
            children: "Create User"
          })]
        })]
      }), /* @__PURE__ */ jsx("section", {
        style: styles.userGrid,
        children: users.map((user) => /* @__PURE__ */ jsxs("article", {
          style: styles.panel,
          children: [/* @__PURE__ */ jsxs("div", {
            style: styles.userHeader,
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("h2", {
                style: styles.panelTitle,
                children: user.name || user.email
              }), /* @__PURE__ */ jsx("p", {
                style: styles.subtitle,
                children: user.email
              })]
            }), /* @__PURE__ */ jsx("span", {
              style: user.isActive ? styles.activeBadge : styles.disabledBadge,
              children: user.isActive ? "Active" : "Disabled"
            })]
          }), /* @__PURE__ */ jsxs(Form, {
            method: "post",
            style: styles.form,
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "update-user"
            }), /* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "userId",
              value: user.id
            }), /* @__PURE__ */ jsxs("div", {
              style: styles.formGrid,
              children: [/* @__PURE__ */ jsx(Field, {
                label: "Name",
                name: "name",
                defaultValue: user.name
              }), /* @__PURE__ */ jsx(RoleSelect, {
                defaultValue: user.role
              })]
            }), /* @__PURE__ */ jsxs("label", {
              style: styles.checkboxLine,
              children: [/* @__PURE__ */ jsx("input", {
                type: "checkbox",
                name: "isActive",
                defaultChecked: user.isActive
              }), "User is active"]
            }), /* @__PURE__ */ jsx(PermissionGrid, {
              selected: user.permissions
            }), /* @__PURE__ */ jsx("button", {
              type: "submit",
              style: styles.secondaryButton,
              disabled: isSubmitting,
              children: "Save User"
            })]
          })]
        }, user.id))
      }), canAccess("auditLog") ? /* @__PURE__ */ jsxs("section", {
        style: styles.panel,
        children: [/* @__PURE__ */ jsxs("div", {
          style: styles.userHeader,
          children: [/* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("h2", {
              style: styles.panelTitle,
              children: "Audit Log"
            }), /* @__PURE__ */ jsx("p", {
              style: styles.subtitle,
              children: "Recent user and settings activity, including who performed each action."
            })]
          }), /* @__PURE__ */ jsxs("span", {
            style: styles.auditCountBadge,
            children: [auditEvents.length, " Events"]
          })]
        }), /* @__PURE__ */ jsx("div", {
          style: styles.auditList,
          children: auditEvents.length ? auditEvents.map((event) => /* @__PURE__ */ jsxs("article", {
            style: styles.auditItem,
            children: [/* @__PURE__ */ jsxs("div", {
              style: styles.auditHeader,
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("strong", {
                  style: styles.auditAction,
                  children: formatAuditAction(event.action)
                }), /* @__PURE__ */ jsxs("p", {
                  style: styles.auditMeta,
                  children: [event.actorName, event.actorEmail ? ` (${event.actorEmail})` : "", " on", " ", formatAuditDate(event.createdAt)]
                })]
              }), /* @__PURE__ */ jsxs("span", {
                style: styles.auditTarget,
                children: [event.targetType, event.targetLabel ? `: ${event.targetLabel}` : ""]
              })]
            }), Object.keys(event.details || {}).length ? /* @__PURE__ */ jsx("pre", {
              style: styles.auditDetails,
              children: JSON.stringify(event.details, null, 2)
            }) : null]
          }, event.id)) : /* @__PURE__ */ jsx("p", {
            style: styles.subtitle,
            children: "No audit events have been recorded yet."
          })
        })]
      }) : null]
    })
  });
});
function formatAuditAction(action2) {
  return action2.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function formatAuditDate(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
function Field({
  label,
  name,
  type = "text",
  defaultValue = ""
}) {
  return /* @__PURE__ */ jsxs("div", {
    children: [/* @__PURE__ */ jsx("label", {
      style: styles.label,
      children: label
    }), /* @__PURE__ */ jsx("input", {
      name,
      type,
      defaultValue,
      style: styles.input,
      required: true
    })]
  });
}
function RoleSelect({
  defaultValue
}) {
  return /* @__PURE__ */ jsxs("div", {
    children: [/* @__PURE__ */ jsx("label", {
      style: styles.label,
      children: "Role"
    }), /* @__PURE__ */ jsxs("select", {
      name: "role",
      defaultValue,
      style: styles.input,
      children: [/* @__PURE__ */ jsx("option", {
        value: "admin",
        children: "Admin"
      }), /* @__PURE__ */ jsx("option", {
        value: "dispatcher",
        children: "Dispatcher"
      }), /* @__PURE__ */ jsx("option", {
        value: "driver",
        children: "Driver"
      }), /* @__PURE__ */ jsx("option", {
        value: "sales",
        children: "Sales"
      }), /* @__PURE__ */ jsx("option", {
        value: "user",
        children: "User"
      })]
    })]
  });
}
function PermissionGrid({
  selected
}) {
  const selectedSet = new Set(selected);
  return /* @__PURE__ */ jsx("div", {
    style: styles.permissionGrid,
    children: allPermissions.map((permission) => /* @__PURE__ */ jsxs("label", {
      style: styles.permissionItem,
      children: [/* @__PURE__ */ jsx("input", {
        type: "checkbox",
        name: "permissions",
        value: permission,
        defaultChecked: selectedSet.has(permission)
      }), /* @__PURE__ */ jsx("span", {
        children: permissionLabels[permission]
      })]
    }, permission))
  });
}
const styles = {
  page: {
    minHeight: "100vh",
    padding: 18,
    background: "radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 28%), linear-gradient(180deg, #0f172a, #020617)",
    color: "#f8fafc",
    fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  shell: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "grid",
    gap: 18
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    padding: 22,
    borderRadius: 26,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.88)"
  },
  kicker: {
    margin: 0,
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase"
  },
  title: {
    margin: "8px 0 0",
    fontSize: 36,
    lineHeight: 1
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#94a3b8",
    lineHeight: 1.45
  },
  nav: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  navButton: {
    minHeight: 38,
    display: "inline-flex",
    alignItems: "center",
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid rgba(56, 189, 248, 0.35)",
    color: "#e0f2fe",
    textDecoration: "none",
    fontWeight: 850
  },
  panel: {
    padding: 20,
    borderRadius: 24,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.92)",
    boxShadow: "0 24px 64px rgba(2, 6, 23, 0.36)"
  },
  panelTitle: {
    margin: 0,
    fontSize: 22
  },
  form: {
    display: "grid",
    gap: 14,
    marginTop: 16
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12
  },
  userGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 16
  },
  userHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start"
  },
  label: {
    display: "block",
    marginBottom: 6,
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  input: {
    width: "100%",
    minHeight: 44,
    boxSizing: "border-box",
    borderRadius: 12,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "#020617",
    color: "#f8fafc",
    padding: "0 12px"
  },
  permissionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10
  },
  permissionItem: {
    minHeight: 42,
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.72)",
    color: "#e2e8f0",
    fontWeight: 800
  },
  checkboxLine: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    color: "#e2e8f0",
    fontWeight: 850
  },
  primaryButton: {
    minHeight: 48,
    border: "none",
    borderRadius: 14,
    background: "linear-gradient(135deg, #84cc16, #22c55e)",
    color: "#052e16",
    fontWeight: 950,
    cursor: "pointer"
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(56, 189, 248, 0.45)",
    background: "rgba(14, 165, 233, 0.14)",
    color: "#e0f2fe",
    fontWeight: 950,
    cursor: "pointer"
  },
  success: {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(34, 197, 94, 0.4)",
    background: "rgba(20, 83, 45, 0.42)",
    color: "#bbf7d0",
    fontWeight: 850
  },
  error: {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(248, 113, 113, 0.4)",
    background: "rgba(127, 29, 29, 0.35)",
    color: "#fecaca",
    fontWeight: 850
  },
  activeBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(34, 197, 94, 0.16)",
    color: "#86efac",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase"
  },
  disabledBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(248, 113, 113, 0.16)",
    color: "#fecaca",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase"
  },
  auditCountBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(56, 189, 248, 0.42)",
    background: "rgba(14, 165, 233, 0.14)",
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: "0.08em"
  },
  auditList: {
    display: "grid",
    gap: 12,
    marginTop: 16
  },
  auditItem: {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.62)"
  },
  auditHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start"
  },
  auditAction: {
    color: "#f8fafc",
    fontSize: 15
  },
  auditMeta: {
    margin: "5px 0 0",
    color: "#94a3b8",
    fontSize: 13
  },
  auditTarget: {
    color: "#bae6fd",
    fontSize: 12,
    fontWeight: 900,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  auditDetails: {
    margin: "12px 0 0",
    padding: 12,
    maxHeight: 180,
    overflow: "auto",
    borderRadius: 12,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "#020617",
    color: "#cbd5e1",
    fontSize: 12,
    whiteSpace: "pre-wrap"
  }
};
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$c,
  default: settings,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const loader$5 = async ({
  request
}) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const errors = loginErrorMessage(await login$1(request));
  return {
    errors,
    shop
  };
};
const action$b = async ({
  request
}) => {
  const errors = loginErrorMessage(await login$1(request));
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
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$b,
  default: route,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
async function loader$4({
  request
}) {
  await authenticate.admin(request);
  return null;
}
const auth_$ = UNSAFE_withComponentProps(function AuthCatchAll() {
  return null;
});
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: auth_$,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
async function loader$3({
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
      }), /* @__PURE__ */ jsx(Link, {
        to: `/app/dispatch/driver${qs}`,
        style: {
          color: "#e5e7eb",
          textDecoration: "none",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #334155",
          background: "#0f172a"
        },
        children: "Driver Route"
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
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  headers,
  loader: loader$3
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
async function loader$2({
  request
}) {
  const {
    admin,
    session
  } = await authenticate.admin(request);
  await registerCarrierService(admin);
  const settings2 = await getAppSettings(session.shop);
  return data({
    settings: settings2
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
  const settings2 = (actionData == null ? void 0 : actionData.settings) ?? loaderData.settings;
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
            defaultChecked: settings2.enableCalculatedRates
          }), " ", "Enable calculated shipping rates"]
        }), /* @__PURE__ */ jsxs("label", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "checkbox",
            name: "useTestFlatRate",
            defaultChecked: settings2.useTestFlatRate
          }), " ", "Use test flat rate"]
        }), /* @__PURE__ */ jsxs("label", {
          children: ["Test flat rate (cents)", /* @__PURE__ */ jsx("br", {}), /* @__PURE__ */ jsx("input", {
            type: "number",
            name: "testFlatRateCents",
            defaultValue: settings2.testFlatRateCents,
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
            defaultChecked: settings2.enableRemoteSurcharge
          }), " ", "Enable remote ZIP surcharge"]
        }), /* @__PURE__ */ jsxs("label", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "checkbox",
            name: "enableDebugLogging",
            defaultChecked: settings2.enableDebugLogging
          }), " ", "Enable debug logging"]
        }), /* @__PURE__ */ jsxs("label", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "checkbox",
            name: "showVendorSource",
            defaultChecked: settings2.showVendorSource
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
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$a,
  default: app__index,
  loader: loader$2
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
async function loader$1({
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
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$9,
  default: app_admin,
  loader: loader$1
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
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_additional
}, Symbol.toStringTag, { value: "Module" }));
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$j,
  default: customQuote,
  loader: loader$e
}, Symbol.toStringTag, { value: "Module" }));
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$i,
  default: quoteReview,
  loader: loader$d
}, Symbol.toStringTag, { value: "Module" }));
const route19 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$h,
  default: dispatch,
  loader: loader$c
}, Symbol.toStringTag, { value: "Module" }));
const route20 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$g,
  default: dispatchDriver,
  loader: loader$b
}, Symbol.toStringTag, { value: "Module" }));
const route21 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: dispatchDriverDetail,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
const route22 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$f,
  default: mobileDashboard,
  loader: loader$9
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
const route23 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const route24 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const route25 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
  if (!isEmbeddedRequest && !await hasUserPermission(request, "sendToShopify")) {
    return data({
      ok: false,
      message: "You do not have permission to send quotes to Shopify."
    }, {
      status: 403
    });
  }
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
const route32 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
const route26 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const route33 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
const route27 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const route34 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
const route28 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
function isAuthorized(request) {
  const expected = process.env.DISPATCH_POLL_SECRET || "";
  if (!expected) return false;
  const url = new URL(request.url);
  const provided = request.headers.get("x-dispatch-poll-secret") || url.searchParams.get("secret") || "";
  return provided === expected;
}
async function loader({
  request
}) {
  if (!isAuthorized(request)) {
    return data({
      ok: false,
      message: "Unauthorized"
    }, {
      status: 401
    });
  }
  try {
    const result = await pollDispatchMailbox();
    return data({
      ok: result.configured,
      ...result
    });
  } catch (error) {
    return data({
      ok: false,
      message: error instanceof Error ? error.message : "Mailbox poll failed."
    }, {
      status: 500
    });
  }
}
const route29 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const route30 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8
}, Symbol.toStringTag, { value: "Module" }));
const route31 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const route35 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const route36 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const route37 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-uCHpuNOX.js", "imports": ["/assets/jsx-runtime-isS9vmeU.js", "/assets/chunk-UVKPFVEO-xd4_T_zb.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/root-CojRx3Uz.js", "imports": ["/assets/jsx-runtime-isS9vmeU.js", "/assets/chunk-UVKPFVEO-xd4_T_zb.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index/route": { "id": "routes/_index/route", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-D21n4XI2.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/custom-quote": { "id": "routes/custom-quote", "parentId": "root", "path": "custom-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/custom-quote-zwU51ufz.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js", "/assets/google-places-Xg9p-f4E.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/quote-review": { "id": "routes/quote-review", "parentId": "root", "path": "quote-review", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/quote-review-BOzy1h_u.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/dispatch": { "id": "routes/dispatch", "parentId": "root", "path": "dispatch", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/dispatch-YHCjYuI6.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js", "/assets/google-places-Xg9p-f4E.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/dispatch-driver": { "id": "routes/dispatch-driver", "parentId": "root", "path": "dispatch/driver", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/dispatch-driver-DzY7xFR3.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/dispatch-driver-detail": { "id": "routes/dispatch-driver-detail", "parentId": "root", "path": "dispatch/driver/detail", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/dispatch-driver-detail-LzX0-s_D.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/mobile-dashboard": { "id": "routes/mobile-dashboard", "parentId": "root", "path": "mobile", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/mobile-dashboard-Bq6U-cxE.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/login": { "id": "routes/login", "parentId": "root", "path": "login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/login-dNuWaZ_O.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/change-password": { "id": "routes/change-password", "parentId": "root", "path": "change-password", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/change-password-BefiWHv-.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/settings": { "id": "routes/settings", "parentId": "root", "path": "settings", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/settings-DPv5Dd8m.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login/route": { "id": "routes/auth.login/route", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-P4A7b6RJ.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/auth._-DccGTWNU.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": true, "module": "/assets/app-BJYrgKPF.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app._index-BQB65v9h.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.admin": { "id": "routes/app.admin", "parentId": "routes/app", "path": "admin", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.admin-CIRGhYuO.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.additional-FzdK5pGq.js", "imports": ["/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.custom-quote": { "id": "routes/app.custom-quote", "parentId": "routes/app", "path": "custom-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.custom-quote-DwE9_bZr.js", "imports": ["/assets/custom-quote-zwU51ufz.js", "/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js", "/assets/google-places-Xg9p-f4E.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.quote-review": { "id": "routes/app.quote-review", "parentId": "routes/app", "path": "quote-review", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.quote-review-BsDj_Hqn.js", "imports": ["/assets/quote-review-BOzy1h_u.js", "/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.dispatch": { "id": "routes/app.dispatch", "parentId": "routes/app", "path": "dispatch", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.dispatch-BGTfzehB.js", "imports": ["/assets/dispatch-YHCjYuI6.js", "/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js", "/assets/google-places-Xg9p-f4E.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.dispatch-driver": { "id": "routes/app.dispatch-driver", "parentId": "routes/app", "path": "dispatch/driver", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.dispatch-driver-Dqxu4GZY.js", "imports": ["/assets/dispatch-driver-DzY7xFR3.js", "/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.dispatch-driver-detail": { "id": "routes/app.dispatch-driver-detail", "parentId": "routes/app", "path": "dispatch/driver/detail", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.dispatch-driver-detail-B43JAz9b.js", "imports": ["/assets/dispatch-driver-detail-LzX0-s_D.js", "/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.mobile": { "id": "routes/app.mobile", "parentId": "routes/app", "path": "mobile", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.mobile-BYgOWWOm.js", "imports": ["/assets/mobile-dashboard-Bq6U-cxE.js", "/assets/chunk-UVKPFVEO-xd4_T_zb.js", "/assets/jsx-runtime-isS9vmeU.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.shipping-estimate": { "id": "routes/api.shipping-estimate", "parentId": "root", "path": "api/shipping-estimate", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.shipping-estimate-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.carrier-service": { "id": "routes/api.carrier-service", "parentId": "root", "path": "api/carrier-service", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.carrier-service-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.sync-products": { "id": "routes/api.sync-products", "parentId": "root", "path": "api/sync-products", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.sync-products-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.create-draft-order": { "id": "routes/api.create-draft-order", "parentId": "root", "path": "api/create-draft-order", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.create-draft-order-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.delete-quote": { "id": "routes/api.delete-quote", "parentId": "root", "path": "api/delete-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.delete-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.update-quote": { "id": "routes/api.update-quote", "parentId": "root", "path": "api/update-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.update-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.dispatch-poll-mailbox": { "id": "routes/api.dispatch-poll-mailbox", "parentId": "root", "path": "api/dispatch-poll-mailbox", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.dispatch-poll-mailbox-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.shipping-estimate": { "id": "routes/app.api.shipping-estimate", "parentId": "root", "path": "app/api/shipping-estimate", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.shipping-estimate-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.carrier-service": { "id": "routes/app.api.carrier-service", "parentId": "root", "path": "app/api/carrier-service", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.carrier-service-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.create-draft-order": { "id": "routes/app.api.create-draft-order", "parentId": "root", "path": "app/api/create-draft-order", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.create-draft-order-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.delete-quote": { "id": "routes/app.api.delete-quote", "parentId": "root", "path": "app/api/delete-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.delete-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.api.update-quote": { "id": "routes/app.api.update-quote", "parentId": "root", "path": "app/api/update-quote", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/app.api.update-quote-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.products.update": { "id": "routes/webhooks.products.update", "parentId": "root", "path": "webhooks/products/update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.products.update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-0ee41277.js", "version": "0ee41277", "sri": void 0 };
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
  "routes/dispatch-driver": {
    id: "routes/dispatch-driver",
    parentId: "root",
    path: "dispatch/driver",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/dispatch-driver-detail": {
    id: "routes/dispatch-driver-detail",
    parentId: "root",
    path: "dispatch/driver/detail",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/mobile-dashboard": {
    id: "routes/mobile-dashboard",
    parentId: "root",
    path: "mobile",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/login": {
    id: "routes/login",
    parentId: "root",
    path: "login",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/change-password": {
    id: "routes/change-password",
    parentId: "root",
    path: "change-password",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/settings": {
    id: "routes/settings",
    parentId: "root",
    path: "settings",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/auth.login/route": {
    id: "routes/auth.login/route",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route14
  },
  "routes/app.admin": {
    id: "routes/app.admin",
    parentId: "routes/app",
    path: "admin",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/app.custom-quote": {
    id: "routes/app.custom-quote",
    parentId: "routes/app",
    path: "custom-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  },
  "routes/app.quote-review": {
    id: "routes/app.quote-review",
    parentId: "routes/app",
    path: "quote-review",
    index: void 0,
    caseSensitive: void 0,
    module: route18
  },
  "routes/app.dispatch": {
    id: "routes/app.dispatch",
    parentId: "routes/app",
    path: "dispatch",
    index: void 0,
    caseSensitive: void 0,
    module: route19
  },
  "routes/app.dispatch-driver": {
    id: "routes/app.dispatch-driver",
    parentId: "routes/app",
    path: "dispatch/driver",
    index: void 0,
    caseSensitive: void 0,
    module: route20
  },
  "routes/app.dispatch-driver-detail": {
    id: "routes/app.dispatch-driver-detail",
    parentId: "routes/app",
    path: "dispatch/driver/detail",
    index: void 0,
    caseSensitive: void 0,
    module: route21
  },
  "routes/app.mobile": {
    id: "routes/app.mobile",
    parentId: "routes/app",
    path: "mobile",
    index: void 0,
    caseSensitive: void 0,
    module: route22
  },
  "routes/api.shipping-estimate": {
    id: "routes/api.shipping-estimate",
    parentId: "root",
    path: "api/shipping-estimate",
    index: void 0,
    caseSensitive: void 0,
    module: route23
  },
  "routes/api.carrier-service": {
    id: "routes/api.carrier-service",
    parentId: "root",
    path: "api/carrier-service",
    index: void 0,
    caseSensitive: void 0,
    module: route24
  },
  "routes/api.sync-products": {
    id: "routes/api.sync-products",
    parentId: "root",
    path: "api/sync-products",
    index: void 0,
    caseSensitive: void 0,
    module: route25
  },
  "routes/api.create-draft-order": {
    id: "routes/api.create-draft-order",
    parentId: "root",
    path: "api/create-draft-order",
    index: void 0,
    caseSensitive: void 0,
    module: route26
  },
  "routes/api.delete-quote": {
    id: "routes/api.delete-quote",
    parentId: "root",
    path: "api/delete-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route27
  },
  "routes/api.update-quote": {
    id: "routes/api.update-quote",
    parentId: "root",
    path: "api/update-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route28
  },
  "routes/api.dispatch-poll-mailbox": {
    id: "routes/api.dispatch-poll-mailbox",
    parentId: "root",
    path: "api/dispatch-poll-mailbox",
    index: void 0,
    caseSensitive: void 0,
    module: route29
  },
  "routes/app.api.shipping-estimate": {
    id: "routes/app.api.shipping-estimate",
    parentId: "root",
    path: "app/api/shipping-estimate",
    index: void 0,
    caseSensitive: void 0,
    module: route30
  },
  "routes/app.api.carrier-service": {
    id: "routes/app.api.carrier-service",
    parentId: "root",
    path: "app/api/carrier-service",
    index: void 0,
    caseSensitive: void 0,
    module: route31
  },
  "routes/app.api.create-draft-order": {
    id: "routes/app.api.create-draft-order",
    parentId: "root",
    path: "app/api/create-draft-order",
    index: void 0,
    caseSensitive: void 0,
    module: route32
  },
  "routes/app.api.delete-quote": {
    id: "routes/app.api.delete-quote",
    parentId: "root",
    path: "app/api/delete-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route33
  },
  "routes/app.api.update-quote": {
    id: "routes/app.api.update-quote",
    parentId: "root",
    path: "app/api/update-quote",
    index: void 0,
    caseSensitive: void 0,
    module: route34
  },
  "routes/webhooks.products.update": {
    id: "routes/webhooks.products.update",
    parentId: "root",
    path: "webhooks/products/update",
    index: void 0,
    caseSensitive: void 0,
    module: route35
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route36
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route37
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
