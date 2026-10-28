import { cancellationPaymentState, REFUND_STATUSES } from '../../shared/refund.js';
import { isDemoOrder } from '../../shared/demoPayment.js';

export const cancellationRefund = order => {
    if (isDemoOrder(order)) return undefined;
    const state = cancellationPaymentState(order);
    if (state === 'review') {
        throw Object.assign(new Error('Payment records need staff review before this order can be cancelled. Contact PAMO.'), { status: 409 });
    }
    if (state === 'unpaid') return undefined;
    if (order.refund) {
        // A prior or unsupported refund record must never be overwritten by cancellation.
        throw Object.assign(new Error('Refund records need staff review before cancellation. Contact PAMO.'), { status: 409 });
    }
    return { status: REFUND_STATUSES.required, requiredAt: Date.now() };
};
