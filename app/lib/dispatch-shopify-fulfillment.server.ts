import shopify from "../shopify.server";
import type { DispatchOrder, DispatchRoute } from "./dispatch.server";

type ShopifyFulfillmentOrderLineItem = {
  id: string;
  remainingQuantity?: number | null;
  totalQuantity?: number | null;
  lineItem?: {
    id?: string | null;
  } | null;
};

type ShopifyFulfillmentOrder = {
  id: string;
  status?: string | null;
  requestStatus?: string | null;
  lineItems?: {
    nodes?: ShopifyFulfillmentOrderLineItem[];
  } | null;
};

type ShopifyFulfillment = {
  id: string;
  status?: string | null;
  fulfillmentLineItems?: {
    nodes?: Array<{
      quantity?: number | null;
      lineItem?: {
        id?: string | null;
      } | null;
    }>;
  } | null;
};

type ShopifyDispatchRefs = {
  orderId: string;
  lineItemId?: string | null;
};

export type ShopifyDispatchResult = {
  ok: boolean;
  skipped?: boolean;
  message: string;
  fulfillmentId?: string | null;
};

function parseShopifyRefs(order: DispatchOrder): ShopifyDispatchRefs | null {
  const mailboxMatch = String(order.mailboxMessageId || "").match(
    /^shopify:(gid:\/\/shopify\/Order\/[^#]+)#(.+)$/,
  );
  if (mailboxMatch) {
    return {
      orderId: mailboxMatch[1],
      lineItemId: mailboxMatch[2] || null,
    };
  }

  try {
    const raw = JSON.parse(String(order.rawEmail || "{}"));
    if (raw?.id && String(raw.id).startsWith("gid://shopify/Order/")) {
      const material = String(order.material || "").toLowerCase();
      const lineItem = (raw?.lineItems?.nodes || []).find((line: any) => {
        const title = [line?.variant?.product?.title, line?.title, line?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return title.includes(material) || material.includes(title);
      });

      return {
        orderId: String(raw.id),
        lineItemId: lineItem?.id || null,
      };
    }
  } catch {
    // Non-Shopify/manual dispatch orders do not need Shopify updates.
  }

  return null;
}

function formatUserErrors(errors: Array<{ message?: string; field?: string[] | null }>) {
  return errors
    .map((error) =>
      [error.field?.join("."), error.message].filter(Boolean).join(": "),
    )
    .filter(Boolean)
    .join("; ");
}

function getQuantity(order: DispatchOrder) {
  const quantity = Number(String(order.quantity || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(quantity) && quantity > 0 ? Math.ceil(quantity) : 1;
}

async function graphql<T>(query: string, variables: Record<string, unknown>) {
  const shop = process.env.SHOPIFY_STORE_DOMAIN || "";
  if (!shop) {
    throw new Error("SHOPIFY_STORE_DOMAIN is not set.");
  }

  const { admin } = await shopify.unauthenticated.admin(shop);
  const response = await admin.graphql(query, { variables });
  const json = await response.json();
  const errors = json?.errors || [];
  if (errors.length) {
    throw new Error(
      errors.map((error: { message?: string }) => error.message || "Shopify GraphQL error.").join("; "),
    );
  }

  return json?.data as T;
}

async function getShopifyFulfillmentState(orderId: string) {
  const data = await graphql<{
    order?: {
      id: string;
      name?: string | null;
      fulfillmentOrders?: {
        nodes?: ShopifyFulfillmentOrder[];
      } | null;
      fulfillments?: ShopifyFulfillment[] | null;
    } | null;
  }>(
    `#graphql
      query DispatchShopifyFulfillmentState($orderId: ID!) {
        order(id: $orderId) {
          id
          name
          fulfillmentOrders(first: 20) {
            nodes {
              id
              status
              requestStatus
              lineItems(first: 100) {
                nodes {
                  id
                  remainingQuantity
                  totalQuantity
                  lineItem {
                    id
                  }
                }
              }
            }
          }
          fulfillments(first: 20) {
            id
            status
            fulfillmentLineItems(first: 100) {
              nodes {
                quantity
                lineItem {
                  id
                }
              }
            }
          }
        }
      }
    `,
    { orderId },
  );

  if (!data?.order) {
    throw new Error(`Shopify order ${orderId} was not found.`);
  }

  return data.order;
}

function findFulfillmentLine(
  fulfillmentOrders: ShopifyFulfillmentOrder[],
  lineItemId?: string | null,
) {
  for (const fulfillmentOrder of fulfillmentOrders) {
    const lineItems = fulfillmentOrder.lineItems?.nodes || [];
    for (const lineItem of lineItems) {
      if (lineItemId && lineItem.lineItem?.id !== lineItemId) continue;
      const remainingQuantity = Number(lineItem.remainingQuantity || 0);
      if (remainingQuantity <= 0) continue;
      return {
        fulfillmentOrder,
        lineItem,
        remainingQuantity,
      };
    }
  }

  return null;
}

function findExistingFulfillment(
  fulfillments: ShopifyFulfillment[],
  lineItemId?: string | null,
) {
  if (!lineItemId) return fulfillments[0] || null;

  return (
    fulfillments.find((fulfillment) =>
      (fulfillment.fulfillmentLineItems?.nodes || []).some(
        (lineItem) => lineItem.lineItem?.id === lineItemId,
      ),
    ) || null
  );
}

export async function fulfillDispatchOrderInShopify(
  order: DispatchOrder,
  route?: DispatchRoute | null,
): Promise<ShopifyDispatchResult> {
  const refs = parseShopifyRefs(order);
  if (!refs) {
    return {
      ok: true,
      skipped: true,
      message: "Not a Shopify-imported order.",
    };
  }

  try {
    const fulfillmentState = await getShopifyFulfillmentState(refs.orderId);
    const fulfillmentOrders = fulfillmentState.fulfillmentOrders?.nodes || [];
    const existingFulfillment = findExistingFulfillment(
      fulfillmentState.fulfillments || [],
      refs.lineItemId,
    );
    if (existingFulfillment) {
      return {
        ok: true,
        skipped: true,
        message: "Already fulfilled in Shopify.",
        fulfillmentId: existingFulfillment.id,
      };
    }

    const match = findFulfillmentLine(fulfillmentOrders, refs.lineItemId);
    if (!match) {
      return {
        ok: true,
        skipped: true,
        message: "No remaining Shopify fulfillment quantity found.",
      };
    }

    const requestedQuantity = getQuantity(order);
    const quantity = Math.min(requestedQuantity, match.remainingQuantity);
    const data = await graphql<{
      fulfillmentCreate?: {
        fulfillment?: {
          id?: string | null;
          status?: string | null;
        } | null;
        userErrors?: Array<{ field?: string[] | null; message?: string }>;
      };
    }>(
      `#graphql
        mutation DispatchFulfillmentCreate($fulfillment: FulfillmentInput!, $message: String) {
          fulfillmentCreate(fulfillment: $fulfillment, message: $message) {
            fulfillment {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        fulfillment: {
          notifyCustomer: false,
          lineItemsByFulfillmentOrder: [
            {
              fulfillmentOrderId: match.fulfillmentOrder.id,
              fulfillmentOrderLineItems: [
                {
                  id: match.lineItem.id,
                  quantity,
                },
              ],
            },
          ],
        },
        message: `Assigned to ${route?.code || "dispatch route"} in Green Hills Dispatch.`,
      },
    );

    const userErrors = data?.fulfillmentCreate?.userErrors || [];
    if (userErrors.length) {
      throw new Error(formatUserErrors(userErrors));
    }

    const fulfillmentId = data?.fulfillmentCreate?.fulfillment?.id || null;
    return {
      ok: true,
      message: "Marked fulfilled in Shopify.",
      fulfillmentId,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Shopify fulfillment failed.",
    };
  }
}

export async function markDispatchOrderDeliveredInShopify(
  order: DispatchOrder,
  route?: DispatchRoute | null,
): Promise<ShopifyDispatchResult> {
  const refs = parseShopifyRefs(order);
  if (!refs) {
    return {
      ok: true,
      skipped: true,
      message: "Not a Shopify-imported order.",
    };
  }

  try {
    const fulfillmentResult = await fulfillDispatchOrderInShopify(order, route);
    const fulfillmentState = await getShopifyFulfillmentState(refs.orderId);
    const fulfillment =
      (fulfillmentResult.fulfillmentId
        ? (fulfillmentState.fulfillments || []).find(
            (entry) => entry.id === fulfillmentResult.fulfillmentId,
          )
        : null) ||
      findExistingFulfillment(fulfillmentState.fulfillments || [], refs.lineItemId);

    if (!fulfillment?.id) {
      throw new Error("No Shopify fulfillment was available to mark delivered.");
    }

    const data = await graphql<{
      fulfillmentEventCreate?: {
        fulfillmentEvent?: {
          status?: string | null;
        } | null;
        userErrors?: Array<{ field?: string[] | null; message?: string }>;
      };
    }>(
      `#graphql
        mutation DispatchFulfillmentEventCreate($fulfillmentEvent: FulfillmentEventInput!) {
          fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) {
            fulfillmentEvent {
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        fulfillmentEvent: {
          fulfillmentId: fulfillment.id,
          status: "DELIVERED",
          happenedAt: order.deliveredAt || new Date().toISOString(),
          message: `Delivered by Green Hills Supply${route?.code ? ` on ${route.code}` : ""}.`,
        },
      },
    );

    const userErrors = data?.fulfillmentEventCreate?.userErrors || [];
    if (userErrors.length) {
      throw new Error(formatUserErrors(userErrors));
    }

    return {
      ok: true,
      message: "Marked delivered in Shopify.",
      fulfillmentId: fulfillment.id,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Shopify delivery update failed.",
    };
  }
}
