import type { DispatchOrder, DispatchRoute } from "./dispatch.server";

type SendResult = {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getOrderDisplayNumber(order: DispatchOrder) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}

function getCustomerEmail(order: DispatchOrder) {
  const match = order.contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] || "";
}

function formatDeliveredAt(order: DispatchOrder) {
  if (!order.deliveredAt) return new Date().toLocaleString();
  return new Date(order.deliveredAt).toLocaleString();
}

function getImageProofSource(value?: string | null) {
  const proof = String(value || "").trim();
  if (/^data:image\//i.test(proof)) return proof;
  if (/^https?:\/\/.+\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i.test(proof)) return proof;
  return "";
}

function parseGpsProof(value?: string | null) {
  const proof = String(value || "").trim();
  const match = proof.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return {
      text: proof || "Not captured",
      mapsUrl: "",
    };
  }

  const latitude = match[1];
  const longitude = match[2];
  return {
    text: proof,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`,
  };
}

function getQuantityColumns(order: DispatchOrder) {
  const unit = order.unit.toLowerCase();
  return {
    tons: /tons?/.test(unit) ? order.quantity : "",
    yards: /yards?/.test(unit) ? order.quantity : "",
    bags: /bags?/.test(unit) ? order.quantity : "",
    gallons: /gallons?/.test(unit) ? order.quantity : "",
  };
}

export function buildDeliveryConfirmationEmail({
  order,
  route,
}: {
  order: DispatchOrder;
  route?: DispatchRoute | null;
}) {
  const quantity = getQuantityColumns(order);
  const orderNumber = getOrderDisplayNumber(order);
  const deliveredAt = formatDeliveredAt(order);
  const driverName = order.signatureName || route?.driver || order.proofName || "";
  const photoProof = order.photoUrls || "Not captured";
  const photoProofSource = getImageProofSource(order.photoUrls);
  const gpsProof = parseGpsProof(order.signatureData);

  const subject = `Green Hills Supply delivery confirmation ${orderNumber}`;
  const text = [
    `Green Hills Supply Delivery Confirmation`,
    ``,
    `Order: ${orderNumber}`,
    `Delivered: ${deliveredAt}`,
    ``,
    `Driver and Truck Information`,
    `Truck: ${route?.truck || ""}`,
    `Driver: ${driverName}`,
    `Route: ${route?.code || ""}`,
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
    `GPS Proof: ${gpsProof.text}${gpsProof.mapsUrl ? ` (${gpsProof.mapsUrl})` : ""}`,
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
          ${fieldCell("Truck Number", route?.truck || "")}
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
          ${fieldCellHtml("GPS Location Verification", gpsProofHtml(gpsProof.text, gpsProof.mapsUrl))}
        </tr>
        <tr>
          ${photoProofSource ? photoCell(photoProofSource) : fieldCell("Picture of Delivered Order", photoProof)}
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

function sectionTitle(title: string) {
  return `<div style="margin-top:24px;background:#2368aa;color:#9ad20f;text-align:center;font-weight:900;padding:8px 10px;">${escapeHtml(title)}</div>`;
}

function fieldCell(label: string, value: string) {
  return `<td style="width:50%;border:2px solid #ffffff;padding:8px 10px;vertical-align:top;">
    <div style="color:#9ad20f;font-size:12px;font-weight:900;">${escapeHtml(label)}</div>
    <div style="color:#ffffff;font-size:14px;line-height:1.45;margin-top:4px;">${escapeHtml(value || " ")}</div>
  </td>`;
}

function fieldCellHtml(label: string, htmlValue: string) {
  return `<td style="width:50%;border:2px solid #ffffff;padding:8px 10px;vertical-align:top;">
    <div style="color:#9ad20f;font-size:12px;font-weight:900;">${escapeHtml(label)}</div>
    <div style="color:#ffffff;font-size:14px;line-height:1.45;margin-top:4px;">${htmlValue || " "}</div>
  </td>`;
}

function gpsProofHtml(value: string, mapsUrl: string) {
  const escapedValue = escapeHtml(value || "Not captured");
  if (!mapsUrl) return escapedValue;

  return `${escapedValue}<br /><a href="${escapeHtml(mapsUrl)}" style="color:#9ad20f;font-weight:900;">Open GPS location in Google Maps</a>`;
}

function photoCell(src: string) {
  return `<td style="width:50%;border:2px solid #ffffff;padding:8px 10px;vertical-align:top;">
    <div style="color:#9ad20f;font-size:12px;font-weight:900;">Picture of Delivered Order</div>
    <img src="${escapeHtml(src)}" alt="Picture of delivered order" style="display:block;width:100%;max-width:320px;height:auto;margin-top:8px;border:1px solid #9ad20f;border-radius:6px;" />
  </td>`;
}

function tableHeader(label: string) {
  return `<th style="background:#2368aa;color:#9ad20f;border:1px solid #ffffff;padding:8px 6px;font-size:12px;line-height:1.2;text-align:center;">${escapeHtml(label)}</th>`;
}

function tableCell(value: string) {
  return `<td style="background:#ffffff;color:#000000;border:1px solid #777;padding:8px 6px;font-size:13px;text-align:center;">${escapeHtml(value || " ")}</td>`;
}

export async function sendDeliveryConfirmationEmail({
  order,
  route,
}: {
  order: DispatchOrder;
  route?: DispatchRoute | null;
}): Promise<SendResult> {
  const to = getCustomerEmail(order);
  if (!to) return { sent: false, skipped: true, reason: "No customer email found." };

  const resendApiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.DELIVERY_CONFIRMATION_FROM ||
    "Green Hills Supply <dispatch@ghstickets.com>";
  const replyTo =
    process.env.DELIVERY_CONFIRMATION_REPLY_TO ||
    process.env.DELIVERY_CONFIRMATION_FROM ||
    "info@greenhillssupply.com";

  if (!resendApiKey || !from) {
    return {
      sent: false,
      skipped: true,
      reason: "Delivery email is not configured. Set RESEND_API_KEY and verify the sender domain.",
    };
  }

  const email = buildDeliveryConfirmationEmail({ order, route });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      reply_to: replyTo,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Delivery confirmation email failed: ${body}`);
  }

  return { sent: true };
}
