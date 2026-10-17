import test from 'node:test';
import { execFileSync } from 'node:child_process';

// Each fixture gets a fresh process and the real, disconnected Mongoose instance.
// No application environment is loaded and automatic collection/index creation is disabled.
const fixture = `
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
mongoose.set('bufferCommands', false);
mongoose.connect = () => assert.fail('Database connections are forbidden');
mongoose.connection.openUri = () => assert.fail('Database connections are forbidden');
const modelUrl = new URL('./models/userModel.js', import.meta.url);
`;

function run(body) {
    try {
        execFileSync(process.execPath, ['--input-type=module', '-e', fixture + body], {
            cwd: new URL('../', import.meta.url), stdio: 'pipe', timeout: 10000
        });
    } catch (error) {
        throw new Error(error.stderr?.toString() || 'Disconnected model fixture failed.');
    }
}

test('first evaluation preserves user model, schema, defaults, indexes and validation', () => {
    run(`
const { default: User } = await import(modelUrl.href);
assert.equal(User, mongoose.models.user);
assert.equal(User.modelName, 'user');
assert.equal(User.collection.collectionName, 'users');
assert.equal(User.db, mongoose.connection);
assert.equal(User.schema.options.minimize, false);
assert.deepEqual(Object.keys(User.schema.paths).sort(), ['__v', '_id', 'cartData', 'cartVersions', 'email', 'name', 'password', 'role']);
for (const field of ['name', 'email', 'password']) {
  assert.equal(User.schema.path(field).instance, 'String');
  assert.equal(User.schema.path(field).isRequired, true);
}
assert.equal(User.schema.path('cartData').instance, 'Mixed');
assert.equal(User.schema.path('cartVersions').instance, 'Mixed');
assert.deepEqual(User.schema.path('role').enumValues, ['customer', 'cashier']);
assert.deepEqual(User.schema.indexes(), [[{ email: 1 }, { unique: true }]]);
const user = new User({ name: 'Synthetic student', email: 'student@example.test', password: 'synthetic-hash' });
assert.equal(user.validateSync(), undefined);
assert.equal(user.role, 'customer');
assert.deepEqual(user.cartData, {});
assert.equal(user.cartVersions, undefined);
assert.deepEqual(Object.keys(new User({}).validateSync().errors).sort(), ['email', 'name', 'password']);
assert(new User({ name: 'Synthetic', email: 'student@example.test', password: 'synthetic-hash', role: 'admin' }).validateSync().errors.role);
assert.equal(mongoose.connection.readyState, 0);
`);
});

test('fresh evaluations and normal cached consumers reuse the same registered model and schema', () => {
    run(`
let registrations = 0;
const model = mongoose.model.bind(mongoose);
mongoose.model = (...args) => { registrations++; return model(...args); };
const { default: first } = await import(modelUrl.href + '?first');
const schema = first.schema;
for (const suffix of ['?second', '?third', '']) {
  const { default: reused } = await import(modelUrl.href + suffix);
  assert.equal(reused, first);
  assert.equal(reused.schema, schema);
}
assert.equal((await import(modelUrl.href)).default, first);
await import('./controllers/userController.js');
await import('./middleware/cashierAuth.js');
await import('./utils/cart.js');
await import('./utils/checkoutCart.js');
assert.equal(mongoose.models.user, first);
assert.equal(registrations, 3, 'Only user, product and order models should be registered');
assert.equal(mongoose.connection.readyState, 0);
`);
});

test('an already registered user model is returned without replacement or schema mutation', () => {
    run(`
const schema = new mongoose.Schema({ fixtureMarker: String });
const existing = mongoose.model('user', schema);
mongoose.model = () => assert.fail('An existing model must not be registered again');
const { default: reused } = await import(modelUrl.href);
assert.equal(reused, existing);
assert.equal(reused.schema, schema);
assert.equal(reused.db, mongoose.connection);
assert.equal(mongoose.connection.readyState, 0);
`);
});
