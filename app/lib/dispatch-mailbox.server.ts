import tls from "node:tls";
import {
  createDispatchOrder,
  getDispatchOrderByMailboxMessageId,
  getDispatchUnitForMaterial,
  parseDispatchEmail,
} from "./dispatch.server";

type ImapConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  limit: number;
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
  const body = getMessageBody(raw);

  return {
    uid,
    messageId,
    subject,
    raw: `Subject: ${subject}\n${body}`,
  };
}

function summarizeSkipReasons(skipReasons: SkipReason[]) {
  const counts = skipReasons.reduce<Record<string, number>>((summary, item) => {
    summary[item.reason] = (summary[item.reason] || 0) + 1;
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

async function fetchUnreadEmails(config: ImapConfig) {
  const client = new SimpleImapClient(config);
  const emails: ImapEmail[] = [];

  await client.connect();
  await client.command(`LOGIN ${escapeImapString(config.user)} ${escapeImapString(config.password)}`);
  await client.command(`SELECT ${escapeImapString(config.mailbox)}`);
  const searchResponse = await client.command(
    `UID SEARCH UNSEEN SUBJECT ${escapeImapString(config.subjectPrefix)}`,
  );
  const uids = parseSearchResponse(searchResponse).slice(-config.limit);

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

  const emails = await fetchUnreadEmails(config);
  let imported = 0;
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

    const existing =
      (await getDispatchOrderByMailboxMessageId(email.messageId)) ||
      (await getDispatchOrderByMailboxMessageId(`${email.messageId}#a`));
    if (existing) {
      skipReasons.push({
        uid: email.uid,
        subject: email.subject || "(No subject)",
        reason: "skipped because it was already imported",
      });
      continue;
    }

    const parsed = parseDispatchEmail(email.raw);
    const products = parsed.products?.length
      ? parsed.products
      : [{ material: parsed.material, quantity: parsed.quantity }];

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

    const validProducts = products.filter((product) => product.material);

    for (const [index, product] of validProducts.entries()) {
      await createDispatchOrder({
        source: "email",
        orderNumber: suffixOrderNumber(parsed.orderNumber, index, validProducts.length),
        customer: parsed.customer,
        contact: parsed.contact,
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

  return {
    configured: true,
    imported,
    skipped: skipReasons.length,
    skipReasons,
    skipSummary,
    message: `Mailbox poll complete: ${imported} imported, ${skipReasons.length} skipped${
      skipSummary.length ? ` (${skipSummary.join("; ")})` : ""
    }.`,
  };
}

export async function maybeAutoPollDispatchMailbox() {
  if (process.env.DISPATCH_MAILBOX_AUTO_POLL !== "true") return null;

  const intervalSeconds = Number(process.env.DISPATCH_MAILBOX_POLL_SECONDS || 300);
  const now = Date.now();
  if (now - lastAutoPollAt < intervalSeconds * 1000) return null;

  lastAutoPollAt = now;
  return pollDispatchMailbox();
}
