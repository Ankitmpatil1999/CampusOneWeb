/**
 * Razorpay Checkout (client 2026-10-09, Q17): the gateway's own payment window, opened for an order
 * the server created (ADM-010). The family pays by UPI, card, net banking or wallet there; the page
 * only passes Razorpay's signed answer to the server, which verifies it and checks the payment with
 * Razorpay before the fee is paid (ADM-011). Card and bank details never touch CampusOne.
 */
const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

/** What Checkout hands back after a successful payment. */
export interface CheckoutAnswer {
  readonly razorpay_payment_id: string;
  readonly razorpay_order_id: string;
  readonly razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (r: { error?: { description?: string } }) => void): void;
}
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

let loading: Promise<RazorpayCtor> | null = null;

/** Loads Checkout once, when a family first pays. */
function load(): Promise<RazorpayCtor> {
  const ready = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => {
      const r = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
      if (r) resolve(r);
      else reject(new Error('The payment window did not load'));
    };
    s.onerror = () => {
      loading = null;
      reject(new Error('The payment window could not be reached'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Opens Checkout for the order: the signed answer once paid, or null when the family closed the
 * window. `onFailed` hears each failed try (Checkout lets the family try again in the same window).
 */
export async function openCheckout(input: {
  keyId: string;
  orderId: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onFailed?: (reason: string) => void;
}): Promise<CheckoutAnswer | null> {
  const Razorpay = await load();
  return new Promise<CheckoutAnswer | null>((resolve) => {
    let settled = false;
    const finish = (v: CheckoutAnswer | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const rzp = new Razorpay({
      key: input.keyId,
      order_id: input.orderId,
      name: input.name,
      description: input.description,
      ...(input.prefill ? { prefill: input.prefill } : {}),
      theme: { color: '#0b5d6b' },
      handler: (answer: CheckoutAnswer) => finish(answer),
      modal: { ondismiss: () => finish(null), confirm_close: true },
    });
    rzp.on('payment.failed', (r) =>
      input.onFailed?.(r.error?.description ?? 'The payment did not go through'),
    );
    rzp.open();
  });
}
