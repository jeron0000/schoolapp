import { EventEmitter } from 'node:events';

// Replace model references without opening a connection or triggering Mongoose initialization.
export const mockReceiptConnection = (t, model, createIndex = async () => 'cashier_receipt_unique') => {
    const descriptors = Object.getOwnPropertyDescriptors(model);
    const connection = Object.assign(new EventEmitter(), {
        readyState: 1,
        name: 'pamo_test_receipts',
        db: {},
        client: {}
    });
    const collection = { conn: connection, collection: {}, createIndex };

    Object.defineProperties(model, {
        db: { configurable: true, writable: true, value: connection },
        collection: { configurable: true, writable: true, value: collection }
    });
    t.after(() => {
        for (const key of ['db', 'collection']) {
            if (descriptors[key]) Object.defineProperty(model, key, descriptors[key]);
            else delete model[key];
        }
    });
    return { connection, collection };
};
