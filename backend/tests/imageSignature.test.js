import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImageMimeType } from '../utils/imageSignature.js';
import { PRODUCT_IMAGE_MAX_BYTES, ProductImageError, validateProductImage } from '../utils/productImages.js';
import { HERO_MAX_FILE_BYTES, HeroImageError, validateHeroFile } from '../utils/heroImages.js';

const signatures = [
    ['PNG', 'image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['JPEG', 'image/jpeg', Buffer.from([255, 216, 255])],
    ...['VP8 ', 'VP8L', 'VP8X'].map(marker => [
        `WebP ${marker}`, 'image/webp', Buffer.from(`RIFFxxxxWEBP${marker}`)
    ])
];

test('shared detector returns only existing MIME types or null without mutating bytes', () => {
    for (const [, mimetype, buffer] of signatures) {
        const original = Buffer.from(buffer);
        assert.equal(detectImageMimeType(buffer), mimetype);
        assert.deepEqual(buffer, original);
        for (let length = 0; length < buffer.length; length++) {
            assert.equal(detectImageMimeType(buffer.subarray(0, length)), null);
        }
    }
    for (const buffer of [Buffer.from('GIF89a'), Buffer.from('<svg/>'), Buffer.from('RIFFxxxxWEBPXXXX'), Buffer.alloc(32)]) {
        assert.equal(detectImageMimeType(buffer), null);
    }
});

const features = [
    {
        name: 'Product', validate: validateProductImage, ErrorType: ProductImageError,
        maxBytes: PRODUCT_IMAGE_MAX_BYTES,
        missingMessage: 'Upload a valid JPEG, PNG or WEBP product image.',
        sizeMessage: 'Product images must be 5 MiB or smaller.'
    },
    {
        name: 'Hero', validate: validateHeroFile, ErrorType: HeroImageError,
        maxBytes: HERO_MAX_FILE_BYTES,
        missingMessage: 'A hero image file is required.',
        sizeMessage: 'Hero images must be 5 MiB or smaller.'
    }
];
const mismatchMessage = 'Upload a valid JPEG, PNG or WEBP image matching its declared type.';
const expectError = (feature, file, message, status = 400) => {
    assert.throws(() => feature.validate(file), error => {
        assert(error instanceof feature.ErrorType);
        assert.equal(error.message, message);
        assert.equal(error.status, status);
        return true;
    });
};

for (const feature of features) {
    test(`${feature.name}: accepted signatures retain minimum lengths and allow trailing bytes`, () => {
        for (const [, mimetype, signature] of signatures) {
            for (const buffer of [signature, Buffer.concat([signature, Buffer.from('trailing bytes')])]) {
                assert.equal(feature.validate({ buffer, mimetype }), undefined);
            }
        }
    });

    test(`${feature.name}: every truncated signature and altered identifying byte is rejected`, () => {
        for (const [, mimetype, signature] of signatures) {
            for (let length = 1; length < signature.length; length++) {
                expectError(feature, { buffer: signature.subarray(0, length), mimetype }, mismatchMessage);
            }
            const positions = mimetype === 'image/webp'
                ? [0, 1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15]
                : [...signature.keys()];
            for (const position of positions) {
                const buffer = Buffer.from(signature);
                buffer[position] = 0;
                expectError(feature, { buffer, mimetype }, mismatchMessage);
            }
        }
    });

    test(`${feature.name}: MIME mismatches, unsupported formats and malformed files retain errors`, () => {
        for (const [, actualType, buffer] of signatures) {
            for (const mimetype of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', undefined, null, {}, []]) {
                if (mimetype !== actualType) expectError(feature, { buffer, mimetype }, mismatchMessage);
            }
        }
        for (const buffer of [Buffer.from('GIF89a'), Buffer.from('<svg/>'), Buffer.from('MZ'), Buffer.alloc(16)]) {
            expectError(feature, { buffer, mimetype: 'image/png' }, mismatchMessage);
        }
        for (const file of [undefined, null, {}, [], { buffer: Buffer.alloc(0) },
            { buffer: 'not a buffer' }, { buffer: [] }, { buffer: {} }, { buffer: new Uint8Array([255, 216, 255]) }]) {
            expectError(feature, file, feature.missingMessage);
        }
    });

    test(`${feature.name}: actual buffer size retains the exact 5 MiB boundary and error precedence`, () => {
        const buffer = Buffer.alloc(feature.maxBytes);
        signatures[0][2].copy(buffer);
        assert.equal(feature.validate({ buffer, mimetype: 'image/png', size: 1 }), undefined);
        expectError(feature, { buffer: Buffer.concat([buffer, Buffer.from([0])]), mimetype: 'image/png', size: 1 }, feature.sizeMessage, 413);
        expectError(feature, { buffer: Buffer.alloc(feature.maxBytes + 1), mimetype: 'image/svg+xml' }, feature.sizeMessage, 413);
    });
}

test('feature-specific handling of unknown signatures with null MIME remains unchanged', () => {
    const file = { buffer: Buffer.from('unsupported'), mimetype: null };
    // Product's public multipart filter rejects null MIME before this internal validator.
    assert.equal(validateProductImage(file), undefined);
    expectError(features[1], file, mismatchMessage);
});
