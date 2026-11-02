import type { Overlays } from '../../../Shared/Overlays';
import { openCheckout } from '../../../Utils/razorpay-checkout';
import { inr } from './fee-format';
import type { Money } from './fees.api';

/** An order with the school's gateway (ADM-037, FEE-052; as ADM-010 and FEE-050). */
export interface GatewayOrder {
  readonly orderId: string;
  readonly amount: Money;
  readonly mode: 'test' | 'live';
  /** The test gateway: what a successful checkout would return. */
  readonly test?: { readonly paymentId: string; readonly signature: string };
  /** Live (Razorpay): the gateway's checkout with this public key. */
  readonly checkout?: { readonly keyId: string; readonly name: string };
}

/** The checkout's answer, for the server to verify. */
export interface GatewayAnswer {
  readonly gatewayPaymentId: string;
  readonly signature: string;
}

/**
 * Pay now at the desk (client 2026-10-22): Razorpay's checkout for the order the server created —
 * the family pays by card, UPI or net banking on this screen, and no link is made. With the test
 * gateway (no gateway connected yet) its answer once the user confirms: no money moves. Null: the
 * window was closed, or the test declined, without paying.
 */
export async function deskCheckout(
  overlays: Overlays,
  order: { readonly amount: Money; readonly gatewayOrder: GatewayOrder },
  description: string,
): Promise<GatewayAnswer | null> {
  const g = order.gatewayOrder;
  if (g.checkout) {
    const a = await openCheckout({
      keyId: g.checkout.keyId,
      orderId: g.orderId,
      name: g.checkout.name,
      description,
    });
    return a ? { gatewayPaymentId: a.razorpay_payment_id, signature: a.razorpay_signature } : null;
  }
  if (!g.test) throw new Error('The payment gateway sent no checkout');
  const ok = await overlays.confirm({
    title: 'Complete the test payment?',
    text: `The school's payment gateway isn't connected yet, so no money moves: ${inr(order.amount)} is marked paid as a test.`,
    ok: 'Complete the test payment',
    icon: 'sparkles',
  });
  return ok ? { gatewayPaymentId: g.test.paymentId, signature: g.test.signature } : null;
}
