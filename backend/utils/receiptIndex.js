const readiness = new WeakMap();
const watchedConnections = new WeakSet();

const unavailable = () => new Error('Receipt uniqueness is not ready.');

export const ensureReceiptIndex = async model => {
    const connection = model.db;
    const collection = model.collection;
    if (connection?.readyState !== 1 || !connection.db || !connection.client || !collection?.collection) {
        if (connection) readiness.delete(connection);
        throw unavailable();
    }

    if (!watchedConnections.has(connection)) {
        const invalidate = () => readiness.delete(connection);
        for (const event of ['connecting', 'connected', 'disconnecting', 'disconnected', 'close']) {
            connection.on(event, invalidate);
        }
        watchedConnections.add(connection);
    }

    let state = readiness.get(connection);
    if (!state?.isCurrent()) {
        const database = connection.db;
        const client = connection.client;
        const databaseName = connection.name;
        const nativeCollection = collection.collection;
        state = {
            isCurrent: () => readiness.get(connection) === state
                && connection.readyState === 1
                && model.db === connection
                && model.collection === collection
                && connection.db === database
                && connection.client === client
                && connection.name === databaseName
                && collection.collection === nativeCollection,
            assertReady: () => {
                if (!state.isCurrent()) throw unavailable();
            }
        };
        readiness.set(connection, state);
        state.promise = Promise.resolve().then(() => {
            state.assertReady();
            // Preserve uniqueness with autoIndex disabled, excluding historical missing receipts.
            return collection.createIndex({ receiptNumber: 1 }, {
                name: 'cashier_receipt_unique', unique: true,
                partialFilterExpression: { receiptNumber: { $type: 'string' } }
            });
        }).catch(error => {
            // An obsolete failure must not clear a newer connection's initialization.
            if (readiness.get(connection) === state) readiness.delete(connection);
            throw error;
        });
    }

    await state.promise;
    state.assertReady();
    return state.assertReady;
};
