import { createHmac, timingSafeEqual } from "node:crypto";

export type DispatchTrackingTokenPayload = {
  routeId: string;
  orderId?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  truck?: string | null;
  exp: number;
};

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 60 * 60 * 14;

function getTrackingSecret() {
  const secret =
    process.env.DISPATCH_TRACKING_SESSION_SECRET ||
    process.env.USER_AUTH_COOKIE_SECRET ||
    process.env.QUOTE_ACCESS_COOKIE_SECRET ||
    process.env.DISPATCH_DRIVER_TRACKING_TOKEN ||
    "";

  if (!secret) {
    throw new Error("DISPATCH_TRACKING_SESSION_SECRET is required for background GPS tracking sessions.");
  }

  return secret;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getTrackingSecret())
    .update(`${TOKEN_VERSION}.${encodedPayload}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createDispatchTrackingToken(
  payload: Omit<DispatchTrackingTokenPayload, "exp">,
  ttlSeconds = DEFAULT_TTL_SECONDS,
) {
  const fullPayload: DispatchTrackingTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  return `${TOKEN_VERSION}.${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyDispatchTrackingToken(token?: string | null) {
  const value = String(token || "").trim();
  const [version, encodedPayload, signature] = value.split(".");
  if (version !== TOKEN_VERSION || !encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return null;
    if (!payload.routeId || typeof payload.routeId !== "string") return null;
    if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload as DispatchTrackingTokenPayload;
  } catch {
    return null;
  }
}
