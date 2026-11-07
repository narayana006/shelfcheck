// PayPal Orders v2 via the official server SDK, against the sandbox environment.
// https://developer.paypal.com/docs/api/orders/v2/

import { createHash } from "node:crypto";
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  ItemCategory,
  OrdersController,
  PaymentsController,
  PaypalExperienceUserAction,
  PaypalWalletContextShippingPreference,
  type OrderRequest,
} from "@paypal/paypal-server-sdk";
import { getProduct } from "./catalog";

export class PayPalError extends Error {}

let client: Client | null = null;
let controller: OrdersController | null = null;
let paymentsController: PaymentsController | null = null;

function sdk() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new PayPalError("The server is missing its PayPal sandbox credentials.");
  client ??= new Client({
    clientCredentialsAuthCredentials: { oAuthClientId: clientId, oAuthClientSecret: clientSecret },
    environment: process.env.PAYPAL_ENV === "live" ? Environment.Production : Environment.Sandbox,
    timeout: 15_000,
  });
  return client;
}

function orders() {
  controller ??= new OrdersController(sdk());
  return controller;
}

function payments() {
  paymentsController ??= new PaymentsController(sdk());
  return paymentsController;
}

export interface CartLine {
  productId: string;
  quantity: number;
}

const money = (n: number) => n.toFixed(2);

/** Price a cart from the server catalog. Client-sent prices are never trusted. */
export function priceCart(lines: CartLine[]) {
  const items = lines.map((l) => {
    const p = getProduct(l.productId);
    if (!p) throw new PayPalError(`Unknown product ${l.productId}`);
    return { product: p, quantity: Math.max(1, Math.min(5, Math.round(l.quantity))) };
  });
  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  return { items, total: Math.round(total * 100) / 100 };
}

/** Create a PayPal order for a cart; the buyer approves it in PayPal Checkout. */
export async function createOrder(lines: CartLine[], description: string, runId: string): Promise<string> {
  const { items, total } = priceCart(lines);
  const body: OrderRequest = {
    intent: CheckoutPaymentIntent.Capture,
    paymentSource: {
      paypal: {
        experienceContext: {
          brandName: "ShelfCheck",
          userAction: PaypalExperienceUserAction.PayNow,
          shippingPreference: PaypalWalletContextShippingPreference.GetFromFile,
        },
      },
    },
    purchaseUnits: [
      {
        description: description.slice(0, 127),
        softDescriptor: "SHELFCHECK",
        amount: {
          currencyCode: "USD",
          value: money(total),
          breakdown: {
            itemTotal: { currencyCode: "USD", value: money(total) },
            shipping: { currencyCode: "USD", value: "0.00" },
          },
        },
        items: items.map(({ product, quantity }) => ({
          name: `${product.brand} ${product.name}`.slice(0, 127),
          sku: product.id,
          unitAmount: { currencyCode: "USD", value: money(product.price) },
          quantity: String(quantity),
          category: ItemCategory.PhysicalGoods,
        })),
      },
    ],
  };
  // Idempotency key derived from the run and the exact cart: a retried create for the same
  // run and cart returns the same order instead of creating a second one.
  const cartKey = items.map((i) => `${i.product.id}x${i.quantity}`).join(",");
  const requestId = createHash("sha256").update(`${runId}|${cartKey}`).digest("hex").slice(0, 36);
  const { result } = await orders().createOrder({ body, prefer: "return=minimal", paypalRequestId: requestId });
  if (!result.id) throw new PayPalError("PayPal didn't return an order id.");
  return result.id;
}

export interface CaptureResult {
  orderId: string;
  status: string;
  captureId?: string;
  amount?: string;
  payer?: string;
}

/** Capture an approved order. */
export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const { result } = await orders().captureOrder({
    id: orderId,
    prefer: "return=representation",
    paypalRequestId: `capture-${orderId}`,
  });
  const capture = result.purchaseUnits?.[0]?.payments?.captures?.[0];
  if (String(result.status) !== "COMPLETED" || String(capture?.status) !== "COMPLETED") {
    throw new PayPalError(`Payment not completed (order ${result.status}, capture ${capture?.status ?? "missing"}).`);
  }
  return {
    orderId,
    status: String(result.status),
    captureId: capture?.id,
    amount: capture?.amount ? `${capture.amount.value} ${capture.amount.currencyCode}` : undefined,
    payer: result.payer?.name?.givenName,
  };
}

export interface RefundResult {
  refundId: string;
  status: string;
  amount: string;
  product: string;
}

/**
 * "Reaction guarantee": refund one product from a completed order. The order is read back from
 * PayPal, so only an item that was actually bought can be refunded, at the price actually paid.
 * The idempotency key makes a second tap for the same item return the same refund.
 */
export async function refundItem(orderId: string, productId: string): Promise<RefundResult> {
  const { result: order } = await orders().getOrder({ id: orderId });
  if (String(order.status) !== "COMPLETED") throw new PayPalError("Only completed orders can be refunded.");
  const unit = order.purchaseUnits?.[0];
  const item = unit?.items?.find((i) => i.sku === productId);
  const capture = unit?.payments?.captures?.[0];
  if (!item || !capture?.id) throw new PayPalError("That product isn't in this order.");
  const value = (Number(item.unitAmount.value) * Number(item.quantity)).toFixed(2);
  const { result } = await payments().refundCapturedPayment({
    captureId: capture.id,
    paypalRequestId: `reaction-${orderId}-${productId}`,
    prefer: "return=representation",
    body: {
      amount: { currencyCode: "USD", value },
      noteToPayer: `ShelfCheck reaction guarantee: ${item.name}`.slice(0, 255),
    },
  });
  return { refundId: String(result.id), status: String(result.status), amount: `${value} USD`, product: item.name };
}
