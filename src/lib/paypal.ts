// PayPal Orders v2 via the official server SDK, against the sandbox environment.
// https://developer.paypal.com/docs/api/orders/v2/

import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  ItemCategory,
  OrdersController,
  PaypalExperienceUserAction,
  PaypalWalletContextShippingPreference,
  type OrderRequest,
} from "@paypal/paypal-server-sdk";
import { getProduct } from "./catalog";

export class PayPalError extends Error {}

let controller: OrdersController | null = null;

function orders() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new PayPalError("The server is missing its PayPal sandbox credentials.");
  controller ??= new OrdersController(
    new Client({
      clientCredentialsAuthCredentials: { oAuthClientId: clientId, oAuthClientSecret: clientSecret },
      environment: process.env.PAYPAL_ENV === "live" ? Environment.Production : Environment.Sandbox,
      timeout: 15_000,
    }),
  );
  return controller;
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
export async function createOrder(lines: CartLine[], description: string): Promise<string> {
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
  // Idempotency key: a retried request can't create a second order.
  const { result } = await orders().createOrder({ body, prefer: "return=minimal", paypalRequestId: crypto.randomUUID() });
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
