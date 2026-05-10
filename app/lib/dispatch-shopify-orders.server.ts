import shopify from "../shopify.server";
import {
  createDispatchOrder,
  detectTimePreference,
  getDispatchOrderByMailboxMessageId,
  getDispatchUnitForMaterial,
} from "./dispatch.server";

type ShopifyAttribute = {
  key?: string | null;
  value?: string | null;
};

type ShopifyAddress = {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  phone?: string | null;
};

type ShopifyOrderLineItem = {
  id?: string | null;
  title?: string | null;
  name?: string | null;
  quantity?: number | string | null;
  sku?: string | null;
  vendor?: string | null;
  customAttributes?: ShopifyAttribute[] | null;
  variant?: {
    id?: string | null;
    title?: string | null;
    sku?: string | null;
    product?: {
      title?: string | null;
      vendor?: string | null;
    } | null;
  } | null;
};

type ShopifyOrder = {
  id: string;
  name?: string | null;
  legacyResourceId?: string | null;
  createdAt?: string | null;
  displayFulfillmentStatus?: string | null;
  displayFinancialStatus?: string | null;
  note?: string | null;
  tags?: string[] | null;
  email?: string | null;
  phone?: string | null;
  customAttributes?: ShopifyAttribute[] | null;
  customer?: {
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  shippingAddress?: ShopifyAddress | null;
  billingAddress?: ShopifyAddress | null;
  lineItems?: {
    nodes?: ShopifyOrderLineItem[];
  } | null;
};

export type DispatchShopifyImportStatus = {
  configured: boolean;
  imported: number;
  skipped: number;
  message: string;
  skipReasons: string[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanOrderNumber(value?: string | null) {
  return String(value || "")
    .replace(/^#/, "")
    .trim();
}

function suffixOrderNumber(orderNumber: string, index: number, total: number) {
  if (!orderNumber || total <= 1) return orderNumber;
  return `${orderNumber}${String.fromCharCode(97 + index)}`;
}

function getAddressLine(address?: ShopifyAddress | null) {
  return normalizeWhitespace(
    [address?.address1, address?.address2].filter(Boolean).join(" "),
  );
}

function getCityLine(address?: ShopifyAddress | null) {
  return normalizeWhitespace(
    [address?.city, address?.provinceCode, address?.zip].filter(Boolean).join(" "),
  );
}

function getCustomerName(order: ShopifyOrder) {
  return (
    order.shippingAddress?.name ||
    order.customer?.displayName ||
    [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ") ||
    order.email ||
    order.phone ||
    "Shopify Customer"
  ).trim();
}

function getContact(order: ShopifyOrder) {
  const email = order.email || order.customer?.email || "";
  const phone =
    order.shippingAddress?.phone ||
    order.billingAddress?.phone ||
    order.customer?.phone ||
    order.phone ||
    "";

  return [email, phone].filter(Boolean).join(" / ");
}

function getAttributeText(attributes?: ShopifyAttribute[] | null) {
  return (attributes || [])
    .map((attribute) =>
      [attribute.key, attribute.value].filter(Boolean).join(": "),
    )
    .filter(Boolean)
    .join("\n");
}

function getLineMaterial(lineItem: ShopifyOrderLineItem) {
  const productTitle = String(lineItem.variant?.product?.title || "").trim();
  const title = String(lineItem.title || "").trim();
  const name = String(lineItem.name || "").trim();
  const variantTitle = String(lineItem.variant?.title || "").trim();

  const base = productTitle || title || name || "Shopify Product";
  if (!variantTitle || /^default title$/i.test(variantTitle)) return base;
  if (base.toLowerCase().includes(variantTitle.toLowerCase())) return base;
  return `${base} - ${variantTitle}`;
}

function shouldSkipLineItem(material: string) {
  return /\b(delivery|shipping|tax|fee|discount)\b/i.test(material);
}

function getLineNotes(order: ShopifyOrder, lineItem: ShopifyOrderLineItem) {
  const parts = [
    `Imported from Shopify order ${order.name || order.legacyResourceId || order.id}.`,
    order.note,
    order.tags?.length ? `Tags: ${order.tags.join(", ")}` : "",
    lineItem.sku || lineItem.variant?.sku ? `SKU: ${lineItem.sku || lineItem.variant?.sku}` : "",
    lineItem.vendor || lineItem.variant?.product?.vendor
      ? `Vendor: ${lineItem.vendor || lineItem.variant?.product?.vendor}`
      : "",
    getAttributeText(order.customAttributes),
    getAttributeText(lineItem.customAttributes),
  ];

  return parts.filter(Boolean).join("\n");
}

function parseRequestedDateFromText(text: string) {
  const labeledPatterns = [
    /(?:delivery|pickup|requested|preference|window|date)[^:\n]*:\s*([0-1]?\d[/-][0-3]?\d[/-](?:20)?\d{2})/i,
    /(?:delivery|pickup|requested|preference|window|date)[^:\n]*:\s*(\d{4}-\d{2}-\d{2})/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeDate(match[1]);
  }

  const looseDate = text.match(/\b([0-1]?\d[/-][0-3]?\d[/-](?:20)?\d{2})\b/);
  if (looseDate?.[1]) return normalizeDate(looseDate[1]);

  const isoDate = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoDate?.[1]) return normalizeDate(isoDate[1]);

  return "";
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-");
    return `${month}/${day}/${year}`;
  }

  const match = trimmed.match(/^([0-1]?\d)[/-]([0-3]?\d)[/-]((?:20)?\d{2})$/);
  if (!match) return trimmed;

  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${month}/${day}/${year}`;
}

function getRequestedWindow(order: ShopifyOrder, lineItem: ShopifyOrderLineItem) {
  const text = [
    order.note,
    order.tags?.join(" "),
    getAttributeText(order.customAttributes),
    getAttributeText(lineItem.customAttributes),
  ]
    .filter(Boolean)
    .join("\n");

  return parseRequestedDateFromText(text) || "Needs scheduling";
}

function getOrderText(order: ShopifyOrder, lineItem: ShopifyOrderLineItem) {
  return [
    order.note,
    order.tags?.join(" "),
    getAttributeText(order.customAttributes),
    getAttributeText(lineItem.customAttributes),
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchShopifyOrders(shop: string, limit: number, query: string) {
  const { admin } = await shopify.unauthenticated.admin(shop);
  const response = await admin.graphql(
    `#graphql
      query DispatchShopifyOrders($first: Int!, $query: String!) {
        orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            legacyResourceId
            createdAt
            displayFulfillmentStatus
            displayFinancialStatus
            note
            tags
            email
            phone
            customAttributes {
              key
              value
            }
            customer {
              displayName
              email
              phone
              firstName
              lastName
            }
            shippingAddress {
              name
              address1
              address2
              city
              provinceCode
              zip
              phone
            }
            billingAddress {
              phone
            }
            lineItems(first: 50) {
              nodes {
                id
                title
                name
                quantity
                sku
                vendor
                customAttributes {
                  key
                  value
                }
                variant {
                  id
                  title
                  sku
                  product {
                    title
                    vendor
                  }
                }
              }
            }
          }
        }
      }
    `,
    { variables: { first: limit, query } },
  );

  const json = await response.json();
  const errors = json?.errors || [];
  if (errors.length) {
    throw new Error(
      errors
        .map((error: { message?: string }) => error.message || "Shopify order query failed.")
        .join("; "),
    );
  }

  return (json?.data?.orders?.nodes || []) as ShopifyOrder[];
}

export async function importDispatchShopifyOrders(): Promise<DispatchShopifyImportStatus> {
  const shop = process.env.SHOPIFY_STORE_DOMAIN || "";
  const limit = Math.max(
    1,
    Math.min(100, Number(process.env.DISPATCH_SHOPIFY_IMPORT_LIMIT || 25) || 25),
  );
  const query =
    process.env.DISPATCH_SHOPIFY_ORDER_QUERY ||
    "status:open fulfillment_status:unfulfilled";

  if (!shop) {
    return {
      configured: false,
      imported: 0,
      skipped: 0,
      message: "Shopify import is not configured. Set SHOPIFY_STORE_DOMAIN.",
      skipReasons: [],
    };
  }

  const orders = await fetchShopifyOrders(shop, limit, query);
  let imported = 0;
  let skipped = 0;
  const skipReasons: string[] = [];

  for (const order of orders) {
    const lineItems = order.lineItems?.nodes || [];
    const validLineItems = lineItems.filter((lineItem) => {
      const material = getLineMaterial(lineItem);
      return !shouldSkipLineItem(material) && Number(lineItem.quantity || 0) > 0;
    });

    if (!validLineItems.length) {
      skipped += 1;
      skipReasons.push(`${order.name || order.id}: no shippable material lines found.`);
      continue;
    }

    const address = getAddressLine(order.shippingAddress);
    if (!address) {
      skipped += validLineItems.length;
      skipReasons.push(`${order.name || order.id}: missing shipping address.`);
      continue;
    }

    const baseOrderNumber = cleanOrderNumber(order.name || order.legacyResourceId);

    for (const [index, lineItem] of validLineItems.entries()) {
      const lineKey =
        lineItem.id ||
        `${order.id}:${lineItem.sku || lineItem.title || index}`;
      const importKey = `shopify:${order.id}#${lineKey}`;
      const existing = await getDispatchOrderByMailboxMessageId(importKey);
      if (existing) {
        skipped += 1;
        continue;
      }

      const material = getLineMaterial(lineItem);
      const notes = getLineNotes(order, lineItem);
      const orderText = getOrderText(order, lineItem);

      await createDispatchOrder({
        source: "email",
        orderNumber: suffixOrderNumber(
          baseOrderNumber,
          index,
          validLineItems.length,
        ),
        customer: getCustomerName(order),
        contact: getContact(order),
        address,
        city: getCityLine(order.shippingAddress),
        material,
        quantity: String(lineItem.quantity || ""),
        unit: (await getDispatchUnitForMaterial(material)) || "Unit",
        requestedWindow: getRequestedWindow(order, lineItem),
        timePreference: detectTimePreference(orderText || notes),
        truckPreference: "",
        notes,
        emailSubject: `Shopify order ${order.name || baseOrderNumber || order.id}`,
        rawEmail: JSON.stringify(order, null, 2),
        mailboxMessageId: importKey,
      });

      imported += 1;
    }
  }

  return {
    configured: true,
    imported,
    skipped,
    skipReasons,
    message: `Shopify import complete: ${imported} imported, ${skipped} skipped from ${orders.length} order${orders.length === 1 ? "" : "s"}.`,
  };
}
