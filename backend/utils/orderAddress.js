import validator from 'validator';

const ADDRESS_FIELDS = {
    firstName: ['first name', 100],
    lastName: ['last name', 100],
    email: ['email address', 254],
    phone: ['mobile number', 30],
    street: ['street address', 200],
    city: ['city', 100],
    state: ['state or province', 100],
    zipcode: ['zipcode', 20],
    country: ['country', 100]
};

const invalidAddress = message => Object.assign(new Error(message), {
    code: 'INVALID_ORDER_ADDRESS',
    status: 400
});

export const validateOrderAddress = address => {
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
        throw invalidAddress('Enter a valid checkout address.');
    }

    const normalized = {};
    for (const [field, [label, limit]] of Object.entries(ADDRESS_FIELDS)) {
        const value = address[field];
        if (typeof value !== 'string') throw invalidAddress(`Enter your ${label}.`);
        const trimmed = value.trim();
        if (!trimmed) throw invalidAddress(`Enter your ${label}.`);
        if (trimmed.length > limit || /[\u0000-\u001f\u007f\u2028\u2029]/.test(trimmed)) {
            throw invalidAddress(`Enter a valid ${label}.`);
        }
        normalized[field] = trimmed;
    }

    if (!validator.isEmail(normalized.email)) {
        throw invalidAddress('Enter a valid email address.');
    }

    return normalized;
};
