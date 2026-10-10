import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import heroModel from '../models/heroSlideModel.js';
import adminAuth from '../middleware/adminAuth.js';
import heroRouter, { heroErrorHandler } from '../routes/heroRoute.js';
import { listHeroSlides, listAllHeroSlides, addHeroSlide, updateHeroSlide, removeHeroSlide, reorderHeroSlides } from '../controllers/heroController.js';
import { HERO_MAX_FILE_BYTES, parseHeroMetadata, validateHeroFile } from '../utils/heroImages.js';

process.env.JWT_SECRET = 'hero-test-only-secret';
process.env.ADMIN_EMAIL = 'hero-admin-test';
process.env.ADMIN_PASSWORD = 'hero-test-password';
const id = number => number.toString(16).padStart(24, '0');
const publicId = 'pamo/hero/00000000-0000-4000-8000-000000000001';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZsAAAAASUVORK5CYII=', 'base64');
const file = () => ({ buffer: png, size: png.length, mimetype: 'image/png' });
const slide = (number = 1, overrides = {}) => ({ _id: id(number), imageUrl: 'https://res.cloudinary.com/test/image/upload/hero.png', imagePublicId: publicId,
    altText: 'Students in campus uniforms', isActive: false, sortOrder: 0, deletionPending: false, createdAt: new Date(0), updatedAt: new Date(1), ...overrides });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const query = rows => ({ sort() { return this; }, select() { return this; }, session() { return this; }, lean: async () => rows });
const createRequest = (body = {}) => ({ body: { altText: 'Students in campus uniforms', ...body }, file: file() });

function provider(t, { uploadError, result = {}, destroyError, destroyResult = 'ok' } = {}) {
    const calls = { uploads: [], deletes: [] };
    t.mock.method(cloudinary.uploader, 'upload_stream', (options, callback) => {
        calls.uploads.push(options);
        return new Writable({ write(buffer, encoding, next) { assert.deepEqual(buffer, png); next(); }, final(next) {
            callback(uploadError, uploadError ? undefined : { secure_url: slide().imageUrl, public_id: options.public_id, resource_type: 'image', format: 'png', width: 1, height: 1, ...result }); next();
        } });
    });
    t.mock.method(cloudinary.uploader, 'destroy', async (asset, options) => { calls.deletes.push({ asset, options }); if (destroyError) throw destroyError; return { result: destroyResult }; });
    t.mock.method(console, 'error', () => {});
    return calls;
}

async function server(t) {
    const app = express(); app.use(express.json()); app.use('/api/hero', heroRouter, heroErrorHandler);
    const listener = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve())));
    await new Promise(resolve => listener.once('listening', resolve));
    return `http://127.0.0.1:${listener.address().port}/api/hero`;
}

test('Hero model stores only image metadata, lifecycle safety and timestamps', async () => {
    const record = new heroModel({ imageUrl: slide().imageUrl, imagePublicId: publicId, altText: ' Campus uniforms ', sortOrder: 0 });
    await record.validate(); assert.equal(record.altText, 'Campus uniforms'); assert.equal(record.isActive, false); assert.equal(record.deletionPending, false);
    assert(heroModel.schema.options.timestamps); assert.equal(heroModel.schema.path('imagePublicId').options.unique, true);
    for (const order of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert(new heroModel({ ...slide(), sortOrder: order }).validateSync());
    for (const alt of ['', 'x'.repeat(251), 'bad\ntext']) assert(new heroModel({ ...slide(), altText: alt }).validateSync());
    assert(new heroModel({ ...slide(), imagePublicId: 'unrelated/product' }).validateSync());
    for (const field of ['headline', 'cta', 'campaign', 'duration', 'theme']) assert.equal(heroModel.schema.path(field), undefined);
});

test('metadata rejects malformed values, immutable fields and empty updates', () => {
    assert.deepEqual(parseHeroMetadata({ altText: ' Uniforms ', isActive: 'true', sortOrder: '3' }, true), { altText: 'Uniforms', isActive: true, sortOrder: 3 });
    assert.deepEqual(parseHeroMetadata({ altText: 'Uniforms' }, true), { altText: 'Uniforms', isActive: false });
    assert.deepEqual(parseHeroMetadata({ isActive: false, sortOrder: 0 }), { isActive: false, sortOrder: 0 });
    for (const body of [null, [], {}, { altText: '' }, { altText: 42 }, { altText: 'x'.repeat(251) }, { altText: 'bad\ntext' },
        { isActive: 'true' }, { isActive: 1 }, { isActive: null }, { sortOrder: '1' }, { sortOrder: -1 }, { sortOrder: .5 }, { sortOrder: Infinity },
        { sortOrder: Number.MAX_SAFE_INTEGER + 1 }, { imageUrl: 'https://attacker.test' }, { imagePublicId: publicId }, { deletionPending: false }]) assert.throws(() => parseHeroMetadata(body));
    for (const value of ['yes', '', 'TRUE']) assert.throws(() => parseHeroMetadata({ altText: 'Uniforms', isActive: value }, true));
    for (const value of ['-1', '1.5', '1e2', 'NaN', '9007199254740992']) assert.throws(() => parseHeroMetadata({ altText: 'Uniforms', sortOrder: value }, true));
});

test('upload validation checks bytes, declared MIME, required presence and size', () => {
    validateHeroFile(file());
    for (const invalid of [undefined, { ...file(), buffer: Buffer.alloc(0) }, { ...file(), buffer: Buffer.from('MZ executable') },
        { ...file(), mimetype: 'image/jpeg' }, { ...file(), mimetype: 'image/svg+xml' }, { ...file(), buffer: Buffer.alloc(HERO_MAX_FILE_BYTES + 1), size: 1 }]) assert.throws(() => validateHeroFile(invalid));
    validateHeroFile({ mimetype: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 224]) });
    validateHeroFile({ mimetype: 'image/webp', buffer: Buffer.from('RIFFxxxxWEBPVP8 ') });
});

test('public/Admin lists are read-only, projected, deterministic and support empty results', async t => {
    const records = [slide(2, { isActive: true, sortOrder: 1 }), slide(1, { isActive: true, sortOrder: 1 }), slide(3), slide(4, { isActive: true, deletionPending: true })];
    t.mock.method(heroModel, 'find', (filter, projection) => {
        if (filter.isActive) assert.deepEqual(filter, { isActive: true, deletionPending: false });
        const rows = filter.isActive ? records.filter(row => row.isActive && !row.deletionPending) : records;
        assert.equal(projection.imagePublicId, undefined);
        return { sort(order) { assert.deepEqual(order, { sortOrder: 1, _id: 1 }); return query([...rows].sort((a, b) => a.sortOrder - b.sortOrder || a._id.localeCompare(b._id))); } };
    });
    for (const method of ['create', 'updateOne', 'findOneAndUpdate', 'deleteOne', 'bulkWrite']) t.mock.method(heroModel, method, () => assert.fail('GET must not write'));
    const active = response(); await listHeroSlides({}, active); assert.equal(active.body.success, true); assert.deepEqual(active.body.slides.map(row => row._id), [id(1), id(2)]);
    assert.deepEqual(Object.keys(active.body.slides[0]).sort(), ['_id', 'altText', 'imageUrl', 'sortOrder']);
    const all = response(); await listAllHeroSlides({}, all); assert.equal(all.body.slides.length, 4); assert(all.body.slides.some(row => !row.isActive));
    assert(all.body.slides.every(row => !Object.hasOwn(row, 'imagePublicId')));
    t.mock.method(heroModel, 'find', () => query([]));
    for (const handler of [listHeroSlides, listAllHeroSlides]) { const res = response(); await handler({}, res); assert.deepEqual(res.body, { success: true, slides: [] }); }
});

test('list database failures return a sanitized failure, not a successful empty list', async t => {
    t.mock.method(heroModel, 'find', () => { throw new Error('private database credentials'); });
    for (const handler of [listHeroSlides, listAllHeroSlides]) { const res = response(); await handler({}, res); assert.equal(res.code, 500); assert.equal(res.body.success, false); assert(!res.body.message.includes('credentials')); }
});

test('create preserves canonical Cloudinary URL/ID, appends order and returns minimal management data', async t => {
    const calls = provider(t); t.mock.method(heroModel, 'findOne', () => query({ sortOrder: 8 }));
    t.mock.method(heroModel, 'create', async data => { assert.equal(data.sortOrder, 9); assert.equal(data.isActive, true); assert.equal(data.imageUrl, slide().imageUrl);
        assert.equal(data.imagePublicId, calls.uploads[0].public_id); await new heroModel(data).validate(); return slide(1, data); });
    const res = response(); await addHeroSlide(createRequest({ isActive: 'true' }), res);
    assert.equal(res.code, 201); assert.equal(res.body.success, true); assert.equal(res.body.slide.imagePublicId, undefined);
    assert.equal(calls.uploads.length, 1); assert.equal(calls.uploads[0].resource_type, 'image'); assert.equal(calls.uploads[0].overwrite, false);
    assert.deepEqual(calls.uploads[0].allowed_formats, ['jpg', 'png', 'webp']); assert.match(calls.uploads[0].public_id, /^pamo\/hero\/[a-f\d-]{36}$/); assert.equal(calls.deletes.length, 0);
});

test('invalid create input fails before cloud or persistence', async t => {
    t.mock.method(cloudinary.uploader, 'upload_stream', () => assert.fail('Invalid request must not upload'));
    t.mock.method(heroModel, 'create', () => assert.fail('Invalid request must not persist'));
    t.mock.method(heroModel, 'findOne', () => assert.fail('Invalid request must not read order'));
    for (const req of [{ ...createRequest(), file: undefined }, createRequest({ altText: '' }), createRequest({ isActive: 'bad' }), createRequest({ sortOrder: '-1' })]) {
        const res = response(); await addHeroSlide(req, res); assert.equal(res.code, 400);
    }
});

test('explicit ordering avoids an append query and new images default inactive', async t => {
    provider(t); t.mock.method(heroModel, 'findOne', () => assert.fail('Explicit order needs no append query'));
    t.mock.method(heroModel, 'create', async data => { assert.equal(data.isActive, false); assert.equal(data.sortOrder, 0); return slide(1, data); });
    const res = response(); await addHeroSlide(createRequest({ sortOrder: '0' }), res); assert.equal(res.code, 201); assert.equal(res.body.slide.isActive, false);
});

test('append errors or exhausted order fail before uploading', async t => {
    t.mock.method(cloudinary.uploader, 'upload_stream', () => assert.fail('No upload without a valid append order'));
    t.mock.method(heroModel, 'findOne', () => query({ sortOrder: Number.MAX_SAFE_INTEGER }));
    const full = response(); await addHeroSlide(createRequest(), full); assert.equal(full.code, 409);
    t.mock.method(heroModel, 'findOne', () => { throw new Error('private DB error'); });
    const failed = response(); await addHeroSlide(createRequest(), failed); assert.equal(failed.code, 500);
});

test('a response failure must not compensate a successfully persisted asset', async t => {
    const calls = provider(t); t.mock.method(heroModel, 'create', async data => slide(1, data));
    const res = response(); let sent = false;
    res.json = body => { if (!sent) { sent = true; throw new Error('Response unavailable'); } res.body = body; return res; };
    await addHeroSlide(createRequest({ sortOrder: '0' }), res); assert.equal(calls.deletes.length, 0); assert.match(res.body.message, /saved.*Refresh/);
});

test('upload/provider validation failure creates no record and compensates safely', async t => {
    t.mock.method(heroModel, 'findOne', () => query(null)); t.mock.method(heroModel, 'create', () => assert.fail('No persistence after upload failure'));
    const calls = provider(t, { uploadError: new Error('private provider credentials') }); const res = response(); await addHeroSlide(createRequest(), res);
    assert.equal(res.code, 502); assert.equal(res.body.success, false); assert(!res.body.message.includes('credentials')); assert.equal(calls.deletes.length, 1);
    for (const result of [{ secure_url: 'http://insecure.test/a' }, { public_id: 'unrelated/product' }, { resource_type: 'raw' }, { format: 'svg' }, { width: 0 }]) {
        const checks = provider(t, { result }); const invalid = response(); await addHeroSlide(createRequest(), invalid); assert.equal(invalid.code, 502); assert.equal(checks.deletes.length, 1);
        assert.equal(checks.deletes[0].asset, checks.uploads[0].public_id);
    }
});

test('DB failure after upload attempts compensation and reports cleanup failures explicitly', async t => {
    t.mock.method(heroModel, 'findOne', () => query(null)); t.mock.method(heroModel, 'create', async () => { throw new Error('private database detail'); });
    for (const destroyError of [undefined, new Error('private cloud detail')]) {
        const calls = provider(t, { destroyError }); const res = response(); await addHeroSlide(createRequest(), res);
        assert.equal(res.code, destroyError ? 502 : 500); assert.equal(res.body.success, false); assert.equal(calls.deletes.length, 1);
        assert(!res.body.message.includes('private')); if (destroyError) assert.match(res.body.message, /cleanup/i);
    }
});

test('metadata edits preserve asset identity and activation drives public visibility', async t => {
    const stored = slide();
    t.mock.method(heroModel, 'findOneAndUpdate', async (filter, update, options) => {
        assert.deepEqual(filter, { _id: id(1), deletionPending: false }); assert.deepEqual(options, { returnDocument: 'after', runValidators: true });
        Object.assign(stored, update.$set); return { ...stored };
    });
    t.mock.method(heroModel, 'find', filter => query(filter.isActive && !stored.isActive ? [] : [{ ...stored }]));
    for (const isActive of [true, false, true]) {
        const res = response(); await updateHeroSlide({ params: { id: id(1) }, body: { isActive, altText: 'Updated uniforms', sortOrder: 3 } }, res);
        assert.equal(res.body.success, true); assert.equal(stored.imagePublicId, publicId); const visible = response(); await listHeroSlides({}, visible); assert.equal(visible.body.slides.length, isActive ? 1 : 0);
    }
});

test('invalid IDs/metadata fail early and missing or deleting records cannot be updated', async t => {
    t.mock.method(heroModel, 'findOneAndUpdate', () => assert.fail('Invalid request must not write'));
    for (const req of [{ params: { id: 'bad' }, body: { isActive: true } }, { params: { id: id(1) }, body: { isActive: 'true' } }, { params: { id: id(1) }, body: {} }]) {
        const res = response(); await updateHeroSlide(req, res); assert.equal(res.code, 400);
    }
    t.mock.method(heroModel, 'findOneAndUpdate', async () => null);
    for (const exists of [null, { _id: id(1) }]) { t.mock.method(heroModel, 'exists', async () => exists); const res = response(); await updateHeroSlide({ params: { id: id(1) }, body: { isActive: true } }, res); assert.equal(res.code, exists ? 409 : 404); }
});

test('delete marks the image unavailable before remote cleanup, then removes the record', async t => {
    const events = []; t.mock.method(heroModel, 'findByIdAndUpdate', async (key, update) => { assert.equal(key, id(1)); assert.deepEqual(update.$set, { isActive: false, deletionPending: true }); events.push('pending'); return slide(1, update.$set); });
    const calls = provider(t); t.mock.method(cloudinary.uploader, 'destroy', async (asset, options) => { events.push('cloud'); calls.deletes.push({ asset, options }); return { result: 'ok' }; });
    t.mock.method(heroModel, 'deleteOne', async filter => { assert.deepEqual(filter, { _id: id(1), imagePublicId: publicId, deletionPending: true }); events.push('database'); return { deletedCount: 1 }; });
    const res = response(); await removeHeroSlide({ params: { id: id(1) } }, res); assert.equal(res.body.success, true); assert.deepEqual(events, ['pending', 'cloud', 'database']); assert.equal(calls.deletes[0].asset, publicId);
});

test('delete failures remain explicit and keep inactive pending records retryable', async t => {
    const stored = slide(); t.mock.method(heroModel, 'findByIdAndUpdate', async (key, update) => { Object.assign(stored, update.$set); return { ...stored }; });
    t.mock.method(heroModel, 'deleteOne', async () => { throw new Error('private DB failure'); });
    let calls = provider(t, { destroyError: new Error('private provider failure') }); let res = response(); await removeHeroSlide({ params: { id: id(1) } }, res);
    assert.equal(res.code, 502); assert.equal(stored.isActive, false); assert.equal(stored.deletionPending, true); assert.equal(calls.deletes.length, 1);
    calls = provider(t, { destroyResult: 'not found' }); res = response(); await removeHeroSlide({ params: { id: id(1) } }, res); assert.equal(res.code, 500); assert.match(res.body.message, /inactive|record/i); assert.equal(calls.deletes.length, 1);
    t.mock.method(heroModel, 'deleteOne', async () => ({ deletedCount: 1 })); res = response(); await removeHeroSlide({ params: { id: id(1) } }, res); assert.equal(res.body.success, true);
    provider(t, { destroyResult: 'failed' }); res = response(); await removeHeroSlide({ params: { id: id(1) } }, res); assert.equal(res.code, 502);
});

test('delete invalid/not-found/DB-lock failures never call the provider', async t => {
    t.mock.method(cloudinary.uploader, 'destroy', () => assert.fail('Unexpected provider deletion'));
    t.mock.method(heroModel, 'findByIdAndUpdate', async () => null);
    const invalid = response(); await removeHeroSlide({ params: { id: 'bad' } }, invalid); assert.equal(invalid.code, 400);
    const missing = response(); await removeHeroSlide({ params: { id: id(1) } }, missing); assert.equal(missing.code, 404);
    t.mock.method(heroModel, 'findByIdAndUpdate', async () => { throw new Error('private DB failure'); });
    const failed = response(); await removeHeroSlide({ params: { id: id(1) } }, failed); assert.equal(failed.code, 500);
});

test('a pending deletion cannot be reactivated while remote cleanup is in flight', async t => {
    const stored = slide(1, { isActive: true }); let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    t.mock.method(heroModel, 'findByIdAndUpdate', async (key, update) => { Object.assign(stored, update.$set); return { ...stored }; });
    t.mock.method(cloudinary.uploader, 'destroy', () => new Promise(resolve => { release = () => resolve({ result: 'ok' }); entered(); }));
    t.mock.method(heroModel, 'findOneAndUpdate', async (filter, update) => { if (stored.deletionPending !== filter.deletionPending) return null; Object.assign(stored, update.$set); return stored; });
    t.mock.method(heroModel, 'exists', async () => ({ _id: stored._id })); t.mock.method(heroModel, 'deleteOne', async () => ({ deletedCount: 1 }));
    const deleted = response(), pending = removeHeroSlide({ params: { id: id(1) } }, deleted); await started;
    const edit = response(); await updateHeroSlide({ params: { id: id(1) }, body: { isActive: true } }, edit); assert.equal(edit.code, 409); assert.equal(stored.isActive, false);
    release(); await pending; assert.equal(deleted.body.success, true);
});

test('reorder validates the complete unique ID list and applies one transaction', async t => {
    let transactions = 0, writes = 0; const session = {};
    t.mock.method(mongoose.connection, 'transaction', async callback => { transactions++; return callback(session); });
    t.mock.method(heroModel, 'find', () => ({ session(value) { assert.equal(value, session); return query([slide(1), slide(2)]); } }));
    t.mock.method(heroModel, 'bulkWrite', async (operations, options) => { writes++; assert.equal(options.session, session); assert.deepEqual(operations.map(op => [op.updateOne.filter._id, op.updateOne.update.$set.sortOrder]), [[id(2), 0], [id(1), 1]]); return { matchedCount: 2 }; });
    const res = response(); await reorderHeroSlides({ body: { orderedIds: [id(2), id(1)] } }, res); assert.equal(res.body.success, true); assert.equal(transactions, 1); assert.equal(writes, 1);
    for (const body of [{ orderedIds: [id(1), id(1)] }, { orderedIds: ['bad'] }, { orderedIds: [id(10).toUpperCase(), id(10)] }, { orderedIds: 'bad' }, { orderedIds: [], extra: true }]) { const invalid = response(); await reorderHeroSlides({ body }, invalid); assert.equal(invalid.code, 400); }
    const stale = response(); await reorderHeroSlides({ body: { orderedIds: [id(1)] } }, stale); assert.equal(stale.code, 409);
    const missing = response(); await reorderHeroSlides({ body: { orderedIds: [id(1), id(3)] } }, missing); assert.equal(missing.code, 404); assert.equal(writes, 1);
});

test('failed reorder never claims success or falls back to independent writes', async t => {
    t.mock.method(mongoose.connection, 'transaction', async callback => callback({})); t.mock.method(heroModel, 'find', () => query([slide(1)]));
    t.mock.method(heroModel, 'bulkWrite', async () => { throw new Error('private transaction failure'); }); t.mock.method(heroModel, 'updateOne', () => assert.fail('No non-transactional fallback'));
    const res = response(); await reorderHeroSlides({ body: { orderedIds: [id(1)] } }, res); assert.equal(res.code, 500); assert.equal(res.body.success, false);
});

test('real HTTP routes retain Admin middleware and reject customer/Cashier/forged roles before upload', async t => {
    t.mock.method(console, 'log', () => {}); t.mock.method(heroModel, 'find', () => query([])); t.mock.method(cloudinary.uploader, 'upload_stream', () => assert.fail('Unauthorized upload'));
    for (const route of heroRouter.stack.filter(layer => layer.route).map(layer => layer.route)) if (route.path !== '/list') assert.equal(route.stack[0].handle, adminAuth);
    const base = await server(t); const tokens = [undefined, 'invalid', jwt.sign({ id: id(1) }, process.env.JWT_SECRET), jwt.sign({ id: id(1), role: 'cashier' }, process.env.JWT_SECRET), jwt.sign({ id: id(1), role: 'admin' }, process.env.JWT_SECRET)];
    for (const token of tokens) for (const [method, endpoint] of [['GET', '/admin/list'], ['POST', '/add'], ['PATCH', '/reorder'], ['PATCH', '/' + id(1)], ['DELETE', '/' + id(1)]]) {
        const res = await fetch(base + endpoint, { method, headers: token ? { token } : {} }); assert.equal((await res.json()).success, false);
    }
    const admin = jwt.sign(process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD, process.env.JWT_SECRET);
    const allowed = await fetch(base + '/admin/list', { headers: { token: admin } }); assert.deepEqual(await allowed.json(), { success: true, slides: [] });
    const publicList = await fetch(base + '/list'); assert.deepEqual(await publicList.json(), { success: true, slides: [] });
});

test('real multipart requests reject malformed, missing, forged MIME and oversized files; valid Admin upload succeeds', async t => {
    t.mock.method(heroModel, 'findOne', () => query(null)); t.mock.method(heroModel, 'create', async data => slide(1, data)); const calls = provider(t);
    const base = await server(t), token = jwt.sign(process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD, process.env.JWT_SECRET);
    const send = async (buffer, mime = 'image/png', field = 'image', fields = {}) => { const form = new FormData(); form.set('altText', 'Uniforms'); for (const [key, value] of Object.entries(fields)) form.set(key, value); if (buffer !== undefined) form.set(field, new Blob([buffer], { type: mime }), 'hero.png'); return fetch(base + '/add', { method: 'POST', headers: { token }, body: form }); };
    for (const [buffer, mime, field, expected] of [[undefined, 'image/png', 'image', 400], [png, 'application/octet-stream', 'image', 400], [Buffer.from('MZ'), 'image/png', 'image', 400], [png, 'image/png', 'wrong', 400], [Buffer.alloc(HERO_MAX_FILE_BYTES + 1), 'image/png', 'image', 413]]) {
        const res = await send(buffer, mime, field); assert.equal(res.status, expected); assert.equal((await res.json()).success, false);
    }
    const valid = await send(png, 'image/png', 'image', { isActive: 'true', sortOrder: '4' }); assert.equal(valid.status, 201); assert.equal((await valid.json()).slide.sortOrder, 4); assert.equal(calls.uploads.length, 1);
    const malformed = await fetch(base + '/add', { method: 'POST', headers: { token, 'Content-Type': 'multipart/form-data' }, body: 'broken' }); assert.equal(malformed.status, 400);
    const invalidJson = await fetch(base + '/' + id(1), { method: 'PATCH', headers: { token, 'Content-Type': 'application/json' }, body: '{bad' }); assert.equal(invalidJson.status, 400); assert.equal((await invalidJson.json()).success, false);
    const largeJson = await fetch(base + '/' + id(1), { method: 'PATCH', headers: { token, 'Content-Type': 'application/json' }, body: JSON.stringify({ altText: 'x'.repeat(150000) }) }); assert.equal(largeJson.status, 413); assert.equal((await largeJson.json()).success, false);
});

test('unexpected multipart server errors are not mislabeled as invalid client input', () => {
    const res = response(); heroErrorHandler(new Error('private server allocation failure'), { is: () => true }, res, () => assert.fail('Must respond'));
    assert.equal(res.code, 500); assert(!res.body.message.includes('private'));
});

test('Hero MongoDB lifecycle on a fresh isolated database with mocked Cloudinary', { skip: process.env.PAMO_HERO_INTEGRATION !== '1', timeout: 60000 }, async t => {
    const { default: dotenv } = await import('dotenv'); dotenv.config({ quiet: true }); const database = 'pamo_hero_test_' + randomUUID().replaceAll('-', '').slice(0, 20);
    t.after(async () => { try { if (mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, database); assert.match(database, /^pamo_hero_test_[a-f0-9]{20}$/); await mongoose.connection.dropDatabase(); } } finally { await mongoose.disconnect(); } });
    await mongoose.connect(process.env.MONGODB_URI + '/e-commerce', { dbName: database, serverSelectionTimeoutMS: 10000 }); await heroModel.init(); provider(t);
    const first = response(), second = response(); await addHeroSlide(createRequest({ isActive: 'true' }), first); await addHeroSlide(createRequest(), second); assert.equal(first.code, 201); assert.equal(second.code, 201);
    let list = response(); await listHeroSlides({}, list); assert.equal(list.body.slides.length, 1); assert.equal((await heroModel.findById(first.body.slide._id)).imagePublicId.length > 0, true);
    const reordered = response(); await reorderHeroSlides({ body: { orderedIds: [String(second.body.slide._id), String(first.body.slide._id)] } }, reordered); assert.equal(reordered.body.success, true);
    const activated = response(); await updateHeroSlide({ params: { id: String(second.body.slide._id) }, body: { isActive: true } }, activated);
    list = response(); await listHeroSlides({}, list); assert.deepEqual(list.body.slides.map(row => String(row._id)), [String(second.body.slide._id), String(first.body.slide._id)]);
    const removed = response(); await removeHeroSlide({ params: { id: String(first.body.slide._id) } }, removed); assert.equal(removed.body.success, true); assert.equal(await heroModel.findById(first.body.slide._id), null);
});
