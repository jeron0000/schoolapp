import { getCancellationMode } from '../../shared/orderCancellation.js';
import { isDemoOrder } from '../../shared/demoPayment.js';

// Payment remains owned by the payment/cashier workflow, never by order actions.
export const getAllowedOrderStatuses = (order) => {
    if (isDemoOrder(order) && order.demoPayment.status === 'pending') return [];
    if (order.cancellationRequest?.status === 'pending') return [];
    switch (order.status) {
        case 'Order Placed':
            return getCancellationMode(order) === 'immediate' ? ['Approved', 'Cancelled'] : ['Approved'];
        case 'Approved':
        case 'Packing': // Existing orders can continue without a data migration.
            return order.payment === true ? ['Ready To Claim'] : ['Sent to Cashier'];
        case 'Sent to Cashier':
        case 'Shipped':
            return order.payment === true ? ['Ready To Claim'] : [];
        case 'Ready To Claim':
            return order.payment === true ? ['Claimed'] : [];
        default:
            return [];
    }
};
