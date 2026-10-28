import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import userModel from '../models/userModel.js';
import categoryModel from '../models/categoryModel.js';
import {
    getUserProfile,
    registerUser,
    updateUserProfile
} from '../controllers/userController.js';

process.env.JWT_SECRET = 'student-profile-synthetic-key-not-production';

const userId = '0123456789abcdef01234567';
const validRegistration = {
    name: 'Synthetic Student',
    email: 'student@school.test',
    password: 'synthetic-password',
    academicProgram: 'BSIT'
};
const response = () => ({
    code: 200,
    locals: {},
    status(code) {
        this.code = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

const mockCategoryLookup = (t, lookup) => t.mock.method(
    categoryModel,
    'findOne',
    query => ({
        select() {
            return this;
        },
        async lean() {
            const category = await lookup(query);
            if (!category) return null;
            return { active: true, ...category };
        }
    })
);

const assertRejectedRegistration = async (t, body) => {
    mockCategoryLookup(t, async () => null);
    const find = t.mock.method(userModel, 'findOne', () => {
        assert.fail('Invalid registration must not query accounts');
    });
    const save = t.mock.method(userModel.prototype, 'save', () => {
        assert.fail('Invalid registration must not create accounts');
    });
    const res = response();

    await registerUser({ body }, res);

    assert.equal(res.body.success, false);
    assert.match(res.body.message, /valid academic program/i);
    assert.equal(find.mock.callCount(), 0);
    assert.equal(save.mock.callCount(), 0);
};

test('registration rejects a missing academic program before account creation', async t => {
    const missingProgram = {
        name: validRegistration.name,
        email: validRegistration.email,
        password: validRegistration.password
    };
    await assertRejectedRegistration(t, missingProgram);
});

test('registration rejects an empty academic program before account creation', async t => {
    await assertRejectedRegistration(t, { ...validRegistration, academicProgram: '' });
});

test('registration rejects an invalid academic program before account creation', async t => {
    await assertRejectedRegistration(t, { ...validRegistration, academicProgram: 'UNKNOWN' });
});

test('registration rejects built-in merchandise categories as academic programs', async t => {
    await assertRejectedRegistration(t, { ...validRegistration, academicProgram: 'TOP' });
});

test('registration stores a valid academic program', async t => {
    mockCategoryLookup(t, async () => null);
    t.mock.method(userModel, 'findOne', async () => null);
    t.mock.method(bcrypt, 'genSalt', async () => bcrypt.genSaltSync(4));
    const save = t.mock.method(userModel.prototype, 'save', async function () {
        assert.equal(this.academicProgram, 'BSIT');
        return { _id: userId };
    });

    const valid = response();
    await registerUser({ body: validRegistration }, valid);
    assert.equal(valid.body.success, true);
    assert.equal(save.mock.callCount(), 1);
});

test('an archived managed program overrides the legacy registration fallback', async t => {
    mockCategoryLookup(t, async query => {
        assert.deepEqual(query, { code: 'BSIT', scope: 'program' });
        return { active: false };
    });
    const find = t.mock.method(userModel, 'findOne', () => {
        assert.fail('Archived programs must be rejected before querying accounts');
    });
    const save = t.mock.method(userModel.prototype, 'save', () => {
        assert.fail('Archived programs must not be stored');
    });
    const res = response();

    await registerUser({ body: validRegistration }, res);

    assert.equal(res.body.success, false);
    assert.match(res.body.message, /valid academic program/i);
    assert.equal(find.mock.callCount(), 0);
    assert.equal(save.mock.callCount(), 0);
});

test('registration accepts an active dynamic program category', async t => {
    const exists = mockCategoryLookup(t, async query => {
        assert.deepEqual(query, {
            code: 'new-program',
            scope: 'program'
        });
        return { _id: 'abcdefabcdefabcdefabcdef' };
    });
    t.mock.method(userModel, 'findOne', async () => null);
    t.mock.method(bcrypt, 'genSalt', async () => bcrypt.genSaltSync(4));
    const save = t.mock.method(userModel.prototype, 'save', async function () {
        assert.equal(this.academicProgram, 'new-program');
        return { _id: userId };
    });

    const res = response();
    await registerUser({
        body: { ...validRegistration, academicProgram: 'new-program' }
    }, res);

    assert.equal(res.body.success, true);
    assert.equal(exists.mock.callCount(), 1);
    assert.equal(save.mock.callCount(), 1);
    assert.equal(userModel.schema.path('academicProgram').options.enum, undefined);
});

test('existing accounts without programs remain supported by student profiles', async t => {
    t.mock.method(userModel, 'findOne', async query => {
        assert.deepEqual(query, {
            _id: userId,
            $or: [{ role: 'customer' }, { role: { $exists: false } }]
        });
        return {
            name: 'Synthetic Student',
            email: 'student@school.test',
            password: 'must-not-be-returned',
            role: 'customer'
        };
    });
    const res = response();
    await getUserProfile({ body: { userId } }, res);
    assert.deepEqual(res.body, {
        success: true,
        profile: {
            name: 'Synthetic Student',
            email: 'student@school.test',
            academicProgram: null
        }
    });
    assert.doesNotMatch(JSON.stringify(res.body), /password|role/i);
});

test('profile updates validate programs before an atomic account-scoped update', async t => {
    const exists = mockCategoryLookup(t, async () => null);
    const update = t.mock.method(userModel, 'findOneAndUpdate', async (query, change, options) => {
        assert.deepEqual(query, {
            _id: userId,
            $or: [{ role: 'customer' }, { role: { $exists: false } }]
        });
        assert.deepEqual(change, { $set: { academicProgram: 'BSHM' } });
        assert.deepEqual(options, { returnDocument: 'after', runValidators: true });
        return {
            name: 'Synthetic Student',
            email: 'student@school.test',
            academicProgram: 'BSHM'
        };
    });

    const valid = response();
    await updateUserProfile({ body: { userId, academicProgram: 'BSHM' } }, valid);
    assert.equal(valid.body.success, true);
    assert.equal(valid.body.profile.academicProgram, 'BSHM');

    const invalid = response();
    await updateUserProfile({ body: { userId, academicProgram: 'UNKNOWN' } }, invalid);
    assert.equal(invalid.code, 400);
    assert.equal(invalid.body.success, false);
    assert.equal(update.mock.callCount(), 1);
    assert.equal(exists.mock.callCount(), 2);
});

test('profile updates accept active dynamic programs', async t => {
    mockCategoryLookup(t, async query => {
        assert.deepEqual(query, {
            code: 'new-program',
            scope: 'program'
        });
        return { _id: 'abcdefabcdefabcdefabcdef' };
    });
    const update = t.mock.method(userModel, 'findOneAndUpdate', async (_query, change) => ({
        name: 'Synthetic Student',
        email: 'student@school.test',
        academicProgram: change.$set.academicProgram
    }));

    const res = response();
    await updateUserProfile({
        body: { userId, academicProgram: 'new-program' }
    }, res);

    assert.equal(res.body.success, true);
    assert.equal(res.body.profile.academicProgram, 'new-program');
    assert.equal(update.mock.callCount(), 1);
});
