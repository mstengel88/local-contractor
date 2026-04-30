import tls from "node:tls";
import {
  createDispatchOrder,
  getDispatchOrderByMailboxMessageId,
  getDispatchOrdersByOrderNumber,
  getDispatchUnitForMaterial,
  parseDispatchEmail,
  updateDispatchOrderDetails,
} from "./dispatch.server";

type ImapConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  limit: number;
  backfillLimit: number;
  markSeen: boolean;
  subjectPrefix: string;
};

type ImapEmail = {
  uid: string;
  messageId: string;
  subject: string;
  raw: string;
};

type SkipReason = {
  uid: string;
  subject: string;
  reason: string;
};

let lastAutoPollAt = 0;
const DEFAULT_ORDER_SUBJECT_PREFIX = "You've Got A New Order: #";
const MAILBOX_IMPORT_VERSION = "phone-fallback-v2";

function getMailboxConfig(): ImapConfig | null {
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
    backfillLimit: Number(process.env.DISPATCH_MAILBOX_BACKFILL_LIMIT || 250),
    markSeen: process.env.DISPATCH_MAILBOX_MARK_SEEN === "true",
    subjectPrefix:
      process.env.DISPATCH_MAILBOX_SUBJECT_PREFIX ||
      DEFAULT_ORDER_SUBJECT_PREFIX,
  };
}

function escapeImapString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function readHeader(raw: string, header: string) {
  const match = raw.match(new RegExp(`^${header}:\\s*(.+(?:\\r?\\n[\\t ].+)*)`, "im"));
  return (match?.[1] || "").replace(/\r?\n[\t ]+/g, " ").trim();
}

function getMessageBody(raw: string) {
  const split = raw.split(/\r?\n\r?\n/);
  return split.length > 1 ? split.slice(1).join("\n\n") : raw;
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

function decodeTransferBody(body: string, encoding: string) {
  const normalizedEncoding = encoding.toLowerCase();

  if (normalizedEncoding.includes("base64")) {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return body;
    }
  }

  if (normalizedEncoding.includes("quoted-printable")) {
    return decodeQuotedPrintable(body);
  }

  return body;
}

function readBoundary(contentType: string) {
  return (
    contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.[1] ||
    contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.[2] ||
    ""
  );
}

function decodeMimeMessage(raw: string): string {
  const contentType = readHeader(raw, "Content-Type");
  const transferEncoding = readHeader(raw, "Content-Transfer-Encoding");
  const body = getMessageBody(raw);
  const boundary = readBoundary(contentType);

  if (boundary) {
    return body
      .split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?\\r?\\n?`, "g"))
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("--"))
      .map((part) => decodeMimeMessage(part))
      .filter(Boolean)
      .join("\n\n");
  }

  if (/text\/(?:plain|html)/i.test(contentType) || !contentType) {
    return decodeTransferBody(body, transferEncoding);
  }

  return "";
}

class SimpleImapClient {
  private socket: tls.TLSSocket;
  private buffer = "";
  private tagCounter = 1;

  constructor(config: ImapConfig) {
    this.socket = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host,
    });
  }

  async connect() {
    await this.readUntil((text) => /^\* OK/im.test(text));
  }

  async command(command: string) {
    const tag = `A${String(this.tagCounter++).padStart(4, "0")}`;
    this.socket.write(`${tag} ${command}\r\n`);
    return this.readUntil((text) => new RegExp(`^${tag} (OK|NO|BAD)`, "im").test(text));
  }

  close() {
    this.socket.end();
  }

  private readUntil(done: (text: string) => boolean) {
    return new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        this.buffer += chunk.toString("utf8");
        if (!done(this.buffer)) return;

        const output = this.buffer;
        this.buffer = "";
        cleanup();
        resolve(output);
      };
      const onError = (error: Error) => {
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

function parseSearchResponse(response: string) {
  const line = response.match(/^\* SEARCH\s+(.+)$/im)?.[1] || "";
  return line
    .split(/\s+/)
    .map((uid) => uid.trim())
    .filter(Boolean);
}

function parseFetchResponse(uid: string, response: string): ImapEmail | null {
  const literalMatch = response.match(/\{(\d+)\}\r?\n([\s\S]*)\r?\n\)/);
  const raw = literalMatch?.[2]?.trim();
  if (!raw) return null;

  const subject = readHeader(raw, "Subject");
  const messageId = readHeader(raw, "Message-ID") || `${uid}:${subject}`;
  const body = decodeMimeMessage(raw) || getMessageBody(raw);

  return {
    uid,
    messageId,
    subject,
    raw: `Subject: ${subject}\n${body}`,
  };
}

function summarizeSkipReasons(skipReasons: SkipReason[]) {
  const counts = skipReasons.reduce<Record<string, number>>((summary, item) => {
    const summaryReason = item.reason.replace(/\s*\[order[\s\S]*$/, "");
    summary[summaryReason] = (summary[summaryReason] || 0) + 1;
    return summary;
  }, {});

  return Object.entries(counts).map(([reason, count]) => `${count} ${reason}`);
}

function suffixOrderNumber(orderNumber: string, index: number, total: number) {
  if (!orderNumber || total <= 1) return orderNumber;
  return `${orderNumber}${String.fromCharCode(97 + index)}`;
}

function suffixMailboxMessageId(messageId: string, index: number, total: number) {
  if (!messageId || total <= 1) return messageId;
  return `${messageId}#${String.fromCharCode(97 + index)}`;
}

function extractPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return "";
}

function formatPhone(phone: string) {
  const digits = extractPhone(phone);
  return digits ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : "";
}

function findPhoneInMailboxText(value: string) {
  const candidates = String(value || "").match(/(?:\+?1[\s().-]*)?(?:\d[\D]*){10}/g) || [];

  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    const phone =
      digits.length > 11
        ? extractPhone(digits.slice(-10))
        : extractPhone(digits);
    if (phone) return phone;
  }

  return "";
}

function mergeContactWithPhone(existingContact: string, parsedContact: string) {
  const existing = String(existingContact || "").trim();
  const parsed = String(parsedContact || "").trim();
  const phone = extractPhone(parsed);

  if (!phone || extractPhone(existing)) return existing;
  if (!existing) return parsed || formatPhone(phone);
  return `${existing} / ${formatPhone(phone)}`;
}

function uniqueOrders<T extends { id: string }>(orders: Array<T | null | undefined>) {
  const seen = new Set<string>();
  return orders.filter((order): order is T => {
    if (!order || seen.has(order.id)) return false;
    seen.add(order.id);
    return true;
  });
}

function compactDebugText(value: string) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[\u00ad\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function mailboxDebugExcerpt(raw: string) {
  const text = compactDebugText(raw);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) =>
    /billing\s+address|shipping\s+address|@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line),
  );
  const excerpt = (start >= 0 ? lines.slice(start, start + 10) : lines.slice(-12))
    .join(" | ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .slice(0, 260);

  return excerpt || "(no readable body excerpt)";
}

function extractMailboxPhone(raw: string) {
  const text = compactDebugText(raw);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const debugExcerptPhone = findPhoneInMailboxText(mailboxDebugExcerpt(raw));
  if (debugExcerptPhone) return debugExcerptPhone;

  for (const [index, line] of lines.entries()) {
    if (!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line)) continue;
    const nearbyBlock = lines.slice(Math.max(0, index - 6), index + 3).join(" ");
    const phone = findPhoneInMailboxText(nearbyBlock);
    if (phone) return phone;
  }

  const addressStart = lines.findIndex((line) => /^(billing|shipping)\s+address\b/i.test(line));
  if (addressStart >= 0) {
    const phone = findPhoneInMailboxText(lines.slice(addressStart, addressStart + 18).join(" "));
    if (phone) return phone;
  }

  return findPhoneInMailboxText(text);
}

async function fetchOrderEmails(config: ImapConfig) {
  const client = new SimpleImapClient(config);
  const emails: ImapEmail[] = [];

  await client.connect();
  await client.command(`LOGIN ${escapeImapString(config.user)} ${escapeImapString(config.password)}`);
  await client.command(`SELECT ${escapeImapString(config.mailbox)}`);
  const searchResponse = await client.command(
    `UID SEARCH SUBJECT ${escapeImapString(config.subjectPrefix)}`,
  );
  const uids = parseSearchResponse(searchResponse).slice(
    -Math.max(config.limit, config.backfillLimit),
  );

  for (const uid of uids) {
    const fetchCommand = config.markSeen
      ? `UID FETCH ${uid} BODY[]`
      : `UID FETCH ${uid} BODY.PEEK[]`;
    const fetchResponse = await client.command(fetchCommand);
    const email = parseFetchResponse(uid, fetchResponse);
    if (email) emails.push(email);
  }

  await client.command("LOGOUT").catch(() => "");
  client.close();

  return emails;
}

export async function pollDispatchMailbox() {
  const config = getMailboxConfig();
  if (!config) {
    return {
      configured: false,
      imported: 0,
      skipped: 0,
      skipReasons: [],
      skipSummary: [],
      message: "Mailbox polling is not configured yet.",
    };
  }

  const emails = await fetchOrderEmails(config);
  let imported = 0;
  let updated = 0;
  const skipReasons: SkipReason[] = [];

  for (const email of emails) {
    if (!email.subject.startsWith(config.subjectPrefix)) {
      skipReasons.push({
        uid: email.uid,
        subject: email.subject || "(No subject)",
        reason: `ignored because subject does not start with "${config.subjectPrefix}"`,
      });
      continue;
    }

    const parsed = parseDispatchEmail(email.raw);
    const mailboxPhone = extractMailboxPhone(email.raw);
    const parsedContact =
      extractPhone(parsed.contact) || !mailboxPhone
        ? parsed.contact
        : [parsed.contact, formatPhone(mailboxPhone)].filter(Boolean).join(" / ");
    const products = parsed.products?.length
      ? parsed.products
      : [{ material: parsed.material, quantity: parsed.quantity }];
    const validProducts = products.filter((product) => product.material);
    const messageIdOrders = (
      await Promise.all(
        (validProducts.length ? validProducts : [{ material: "", quantity: "" }]).map((_, index, list) =>
          getDispatchOrderByMailboxMessageId(
            suffixMailboxMessageId(email.messageId, index, list.length),
          ),
        ),
      )
    );
    const legacyExisting =
      messageIdOrders.some(Boolean)
        ? null
        : (await getDispatchOrderByMailboxMessageId(email.messageId)) ||
          (await getDispatchOrderByMailboxMessageId(`${email.messageId}#a`));
    const orderNumberExisting =
      messageIdOrders.some(Boolean) || legacyExisting || !parsed.orderNumber
        ? []
        : await getDispatchOrdersByOrderNumber(parsed.orderNumber);
    const importedOrders = uniqueOrders([
      ...messageIdOrders,
      legacyExisting,
      ...orderNumberExisting,
    ]);

    if (importedOrders.length) {
      let updatedForEmail = 0;
      const parsedPhone = extractPhone(parsedContact);
      for (const order of importedOrders) {
        const nextContact = mergeContactWithPhone(order.contact, parsedContact);
        if (nextContact && nextContact !== order.contact) {
          await updateDispatchOrderDetails(order.id, { contact: nextContact });
          updated += 1;
          updatedForEmail += 1;
        }
      }

      skipReasons.push({
        uid: email.uid,
        subject: email.subject || "(No subject)",
        reason: updatedForEmail
          ? `skipped because it was already imported; updated phone on ${updatedForEmail} existing order${updatedForEmail === 1 ? "" : "s"}`
          : parsedPhone
            ? "skipped because it was already imported and the existing order already has a phone number"
            : `skipped because it was already imported but no phone number was found in the email [order ${parsed.orderNumber || "unknown"} ${parsed.customer || "unknown customer"}; excerpt: ${mailboxDebugExcerpt(email.raw)}]`,
      });
      continue;
    }

    if (!parsed.address || products.every((product) => !product.material)) {
      const missing = [
        !parsed.address ? "address" : "",
        products.every((product) => !product.material) ? "material" : "",
      ].filter(Boolean);
      skipReasons.push({
        uid: email.uid,
        subject: email.subject || "(No subject)",
        reason: `skipped because it is missing ${missing.join(" and ")}`,
      });
      continue;
    }

    for (const [index, product] of validProducts.entries()) {
      await createDispatchOrder({
        source: "email",
        orderNumber: suffixOrderNumber(parsed.orderNumber, index, validProducts.length),
        customer: parsed.customer,
        contact: parsedContact,
        address: parsed.address,
        city: parsed.city,
        material: product.material,
        quantity: product.quantity,
        unit: (await getDispatchUnitForMaterial(product.material)) || parsed.unit,
        requestedWindow: parsed.requestedWindow,
        timePreference: parsed.timePreference,
        truckPreference: parsed.truckPreference,
        notes: parsed.notes || "Imported from mailbox.",
        emailSubject: parsed.subject || email.subject,
        rawEmail: email.raw,
        mailboxMessageId: suffixMailboxMessageId(
          email.messageId,
          index,
          validProducts.length,
        ),
      });
      imported += 1;
    }
  }

  const skipSummary = summarizeSkipReasons(skipReasons);
  const phoneDebugSamples = skipReasons
    .filter((item) => /no phone number was found/.test(item.reason) && /\[order /.test(item.reason))
    .slice(0, 3)
    .map((item) => item.reason.match(/\[order ([\s\S]+)\]$/)?.[1])
    .filter(Boolean);

  return {
    configured: true,
    imported,
    updated,
    skipped: skipReasons.length,
    skipReasons,
    skipSummary,
    message: `Mailbox poll ${MAILBOX_IMPORT_VERSION} complete: ${imported} imported, ${updated} updated, ${skipReasons.length} skipped${
      skipSummary.length ? ` (${skipSummary.join("; ")})` : ""
    }.${
      phoneDebugSamples.length
        ? ` Phone debug samples: ${phoneDebugSamples.join(" || ")}`
        : ""
    }`,
  };
}

export async function maybeAutoPollDispatchMailbox() {
  if (process.env.DISPATCH_MAILBOX_AUTO_POLL !== "true") return null;
  if (process.env.DISPATCH_MAILBOX_AUTO_POLL_ON_LOAD !== "true") return null;

  const intervalSeconds = Number(process.env.DISPATCH_MAILBOX_POLL_SECONDS || 300);
  const now = Date.now();
  if (now - lastAutoPollAt < intervalSeconds * 1000) return null;

  lastAutoPollAt = now;
  return pollDispatchMailbox();
}
