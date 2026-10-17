import { randomUUID } from 'node:crypto';

const suites = {
    inventory: ['PAMO_INVENTORY_INTEGRATION', 'pamo_inv_test_'],
    hero: ['PAMO_HERO_INTEGRATION', 'pamo_hero_test_'],
    dashboard: ['PAMO_DASHBOARD_INTEGRATION', 'pamo_dash_test_'],
    cashierDashboard: ['PAMO_CASHIER_DASHBOARD_INTEGRATION', 'pamo_cash_test_'],
    cart: ['PAMO_CART_INTEGRATION', 'pamo_cart_test_'],
    checkoutCart: ['PAMO_COD_CART_INTEGRATION', 'pamo_cod_cart_test_'],
    recovery: ['PAMO_RECOVERY_INTEGRATION', 'pamo_recovery_test_']
};

export const testDatabaseConfig = (suite, env = process.env) => {
    const settings = typeof suite === 'string' && Object.hasOwn(suites, suite) && suites[suite];
    if (!settings || env[settings[0]] !== '1') {
        throw new Error('MongoDB integration is disabled for this suite.');
    }
    if (env.PAMO_TEST_DB_APPROVED !== '1') {
        throw new Error('MongoDB integration requires approval of a dedicated disposable test server (PAMO_TEST_DB_APPROVED=1).');
    }

    const uri = env.PAMO_TEST_MONGODB_URI;
    const match = typeof uri === 'string' && uri.match(
        /^mongodb:\/\/(127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})\/pamo_integration_test\?([^#\s]+)$/
    );
    if (!match || Number(match[2]) > 65535 || uri === env.MONGODB_URI) {
        throw new Error('Set PAMO_TEST_MONGODB_URI to a credential-free numeric-loopback URI with an explicit port and pamo_integration_test database identity. Application URIs are forbidden.');
    }
    const params = new URLSearchParams(match[3]);
    const replicaSet = params.get('replicaSet');
    if ([...params.keys()].length !== 2 || params.getAll('replicaSet').length !== 1
        || params.getAll('directConnection').length !== 1 || params.get('directConnection') !== 'true'
        || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(replicaSet || '')) {
        throw new Error('The test URI must specify only replicaSet=<test-set-name> and directConnection=true.');
    }
    return { uri, replicaSet, prefix: settings[1] };
};

// Application modules keep their default Mongoose connection. This helper owns
// only the disconnected instance supplied by a test worker, never app startup.
export const connectTestDatabase = async (t, mongoose, suite, env = process.env) => {
    const config = testDatabaseConfig(suite, env);
    const connection = mongoose.connection;
    if (connection.readyState !== 0 || mongoose.connections.some(item => item.readyState !== 0)) {
        throw new Error('Integration requires a disconnected test worker; existing connections are forbidden.');
    }
    const database = config.prefix + randomUUID().replaceAll('-', '');
    let cleanupPromise;
    const cleanup = () => {
        cleanupPromise ||= (async () => {
            try {
                if (connection.readyState === 1) {
                    if (mongoose.connection !== connection || connection.name !== database) {
                        throw new Error('Refusing cleanup: the active database is not this fixture database.');
                    }
                    await connection.dropDatabase();
                }
            } finally {
                await connection.close();
            }
        })();
        return cleanupPromise;
    };
    t.after(cleanup);

    try {
        await mongoose.connect(config.uri, {
            dbName: database, replicaSet: config.replicaSet, directConnection: true,
            serverSelectionTimeoutMS: 5000
        });
    } catch {
        throw new Error('Isolated MongoDB test connection failed. Verify the approved loopback replica set.');
    }
    if (mongoose.connection !== connection || connection.readyState !== 1 || connection.name !== database) {
        throw new Error('Refusing integration: the connection does not match this fixture database.');
    }
    return { database, cleanup };
};
