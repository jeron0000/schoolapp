// Payment remains owned by the payment/cashier workflow, never by order actions.
export const getAllowedOrderStatuses = (order) => {
    switch (order.status) {
        case 'Order Placed':
            return ['Approved', 'Cancelled'];
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
