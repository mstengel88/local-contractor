import { data } from "react-router";
import {
  getCustomQuoteById,
  updateCustomQuote,
} from "../lib/custom-quotes.server";
import { hasAdminQuoteAccess } from "../lib/admin-quote-auth.server";
import { authenticate } from "../shopify.server";

function normalizeQuantity(value: FormDataEntryValue | null) {
  const quantity = Number(value || 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function buildSourceBreakdown(
  lineItems: Array<{
    title: string;
    sku: string;
    vendor?: string;
    quantity: number;
  }>,
) {
  const grouped = new Map<
    string,
    { vendor: string; quantity: number; items: string[] }
  >();

  for (const line of lineItems) {
    const vendor = line.vendor || "Unknown";
    const existing = grouped.get(vendor) || {
      vendor,
      quantity: 0,
      items: [],
    };

    existing.quantity += line.quantity;
    existing.items.push(`${line.title} (${line.sku})`);
    grouped.set(vendor, existing);
  }

  return Array.from(grouped.values());
}

export async function action({ request }: { request: Request }) {
  const url = new URL(request.url);
  const isEmbeddedRequest = url.pathname.startsWith("/app/");

  if (isEmbeddedRequest) {
    await authenticate.admin(request);
  } else {
    const allowed = await hasAdminQuoteAccess(request);
    if (!allowed) {
      return data({ ok: false, message: "Please log in." }, { status: 401 });
    }
  }

  const form = await request.formData();
  const quoteId = String(form.get("quoteId") || "").trim();

  if (!quoteId) {
    return data({ ok: false, message: "Missing quote id." }, { status: 400 });
  }

  const existing = await getCustomQuoteById(quoteId);
  if (!existing) {
    return data({ ok: false, message: "Quote not found." }, { status: 404 });
  }

  const oldLineItems = existing.line_items || [];
  const oldProductsSubtotalCents = oldLineItems.reduce(
    (sum, line) =>
      sum + Math.round(Number(line.price || 0) * Number(line.quantity || 0) * 100),
    0,
  );
  const nonProductCents = Math.max(
    0,
    Number(existing.quote_total_cents || 0) - oldProductsSubtotalCents,
  );

  const lineItems = oldLineItems
    .map((line, index) => ({
      ...line,
      quantity: normalizeQuantity(form.get(`lineQuantity::${index}`)),
    }))
    .filter((line) => line.quantity > 0);

  if (lineItems.length === 0) {
    return data(
      { ok: false, message: "At least one line item must have quantity greater than 0." },
      { status: 400 },
    );
  }

  const productsSubtotalCents = lineItems.reduce(
    (sum, line) =>
      sum + Math.round(Number(line.price || 0) * Number(line.quantity || 0) * 100),
    0,
  );

  const updatedQuote = await updateCustomQuote(quoteId, {
    customerName: String(form.get("customerName") || "").trim(),
    customerEmail: String(form.get("customerEmail") || "").trim(),
    customerPhone: String(form.get("customerPhone") || "").trim(),
    address1: String(form.get("address1") || "").trim(),
    address2: String(form.get("address2") || "").trim(),
    city: String(form.get("city") || "").trim(),
    province: String(form.get("province") || "").trim(),
    postalCode: String(form.get("postalCode") || "").trim(),
    country: String(form.get("country") || "US").trim() || "US",
    quoteTotalCents: productsSubtotalCents + nonProductCents,
    sourceBreakdown: buildSourceBreakdown(lineItems),
    lineItems,
  });

  return data({
    ok: true,
    message: "Quote updated.",
    quote: updatedQuote,
  });
}
