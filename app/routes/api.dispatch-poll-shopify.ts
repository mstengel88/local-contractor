import { data } from "react-router";
import { importDispatchShopifyOrders } from "../lib/dispatch-shopify-orders.server";

function isAuthorized(request: Request) {
  const expected = process.env.DISPATCH_POLL_SECRET || "";
  if (!expected) return false;

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-dispatch-poll-secret") ||
    url.searchParams.get("secret") ||
    "";

  return provided === expected;
}

export async function loader({ request }: { request: Request }) {
  if (!isAuthorized(request)) {
    return data({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await importDispatchShopifyOrders();
    return data({ ok: result.configured, ...result });
  } catch (error) {
    return data(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Shopify order import failed.",
      },
      { status: 500 },
    );
  }
}
