import validator from "validator";
import bcrypt from "bcrypt"
import { issueAuthToken } from '../utils/authTokens.js';
import { ADMIN_SUBJECT } from '../../shared/authPolicy.js';
import userModel from "../models/userModel.js";

const invalidCredentials = { success: false, message: 'Invalid email or password.' };
const registrationFailure = { success: false, message: 'Unable to create your account with these details. Please sign in or contact PAMO.' };
const dummyPasswordHash = bcrypt.hashSync('pamo-login-timing-placeholder', 10);
const validCredentials = body => body && typeof body === 'object' && !Array.isArray(body)
    && Object.hasOwn(body, 'email') && typeof body.email === 'string' && body.email.length > 0 && body.email.length <= 254
    && Object.hasOwn(body, 'password') && typeof body.password === 'string' && body.password.length > 0;
const authenticated = (res, token) => {
    res.locals ||= {};
    res.locals.authenticationSucceeded = true;
    return res.json({ success: true, token });
};

// Route for user login
const loginUser = async (req, res) => {
    try {

        if (!validCredentials(req.body)) return res.json(invalidCredentials);
        const { email, password } = req.body;

        const user = await userModel.findOne({ email });

        // Keep legacy long-password hashes usable; enforce the byte limit on registration.
        const isMatch = await bcrypt.compare(password, user?.password || dummyPasswordHash);

        if (user && isMatch) {

            const token = issueAuthToken(user._id, user.role || 'customer')
            authenticated(res, token)

        }
        else {
            res.json(invalidCredentials)
        }

    } catch {
        res.json({ success: false, message: 'Unable to sign in. Please try again.' })
    }
}

// Route for user register
const registerUser = async (req, res) => {
    try {

        if (!validCredentials(req.body)) return res.json(registrationFailure);
        const { name, email, password } = req.body;

        // Validating format and strong password
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }
        if (password.length < 8) {
            return res.json({ success: false, message: "Please enter a strong password" })
        }
        if (Buffer.byteLength(password, 'utf8') > 72) {
            return res.json({ success: false, message: 'Password must be no more than 72 UTF-8 bytes. Use a shorter password.' });
        }

        const exists = await userModel.findOne({ email });
        if (exists) return res.json(registrationFailure);

        // hashing user password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const newUser = new userModel({
            name,
            email,
            password: hashedPassword
        })

        const user = await newUser.save()

        const token = issueAuthToken(user._id, 'customer')

        authenticated(res, token)

    } catch {
        res.json(registrationFailure)
    }
}

// Route for admin login
const adminLogin = async (req, res) => {
    try {

        if (!validCredentials(req.body)) return res.json(invalidCredentials);
        const { email, password } = req.body

        const configuredAdmin = typeof process.env.ADMIN_EMAIL === 'string' && process.env.ADMIN_EMAIL.trim()
            && typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD;
        if (configuredAdmin && email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            const token = issueAuthToken(ADMIN_SUBJECT, 'admin');
            authenticated(res, token)
        } else {
            const cashier = await userModel.findOne({ email, role: 'cashier' });
            const isMatch = await bcrypt.compare(password, cashier?.password || dummyPasswordHash);
            if (cashier && isMatch) {
                authenticated(res, issueAuthToken(cashier._id, 'cashier'))
            } else {
                res.json(invalidCredentials)
            }
        }

    } catch {
        res.json({ success: false, message: 'Unable to sign in. Please try again.' })
    }
}


export { loginUser, registerUser, adminLogin }
