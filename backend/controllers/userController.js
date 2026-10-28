import bcrypt from 'bcrypt'
import validator from 'validator'
import userModel from '../models/userModel.js'
import { issueAuthToken } from '../utils/authTokens.js'
import { ADMIN_SUBJECT } from '../../shared/authPolicy.js'
import {
    academicPrograms,
    isBuiltInMerchandiseCategory
} from '../../shared/productTaxonomy.js'
import { CATEGORY_CODE_PATTERN } from '../models/categoryModel.js'
import { resolveActiveClassification } from '../utils/classificationValidation.js'

const invalidCredentials = { success: false, message: 'Invalid email or password.' }
const registrationFailure = { success: false, message: 'Unable to create your account with these details. Please sign in or contact PAMO.' }
const signInFailure = { success: false, message: 'Unable to sign in. Please try again.' }
const profileFailure = { success: false, message: 'Unable to load your profile. Please try again.' }
const dummyPasswordHash = bcrypt.hashSync('pamo-login-timing-placeholder', 10)

const validAcademicProgram = async academicProgram => {
    if (typeof academicProgram !== 'string' || !academicProgram) return false
    if (isBuiltInMerchandiseCategory(academicProgram)) return false
    if (!CATEGORY_CODE_PATTERN.test(academicProgram)) return false
    const category = await resolveActiveClassification({
        value: academicProgram,
        scope: 'program',
        legacyCodes: academicPrograms
    })
    return Boolean(category)
}
const customerAccountQuery = userId => ({
    _id: userId,
    $or: [{ role: 'customer' }, { role: { $exists: false } }]
})

const publicProfile = user => ({
    name: user.name,
    email: user.email,
    academicProgram: typeof user.academicProgram === 'string' && user.academicProgram
        ? user.academicProgram
        : null
})

const validCredentials = body => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false
    if (!Object.hasOwn(body, 'email') || typeof body.email !== 'string') return false
    if (body.email.length === 0 || body.email.length > 254) return false
    if (!Object.hasOwn(body, 'password') || typeof body.password !== 'string') return false
    return body.password.length > 0
}

const authenticated = (res, token) => {
    res.locals ||= {}
    res.locals.authenticationSucceeded = true
    return res.json({ success: true, token })
}

// Route for user login
const loginUser = async (req, res) => {
    try {
        if (!validCredentials(req.body)) return res.json(invalidCredentials)

        const { email, password } = req.body
        const user = await userModel.findOne({ email })

        // Keep legacy long-password hashes usable; enforce the byte limit on registration.
        const passwordMatches = await bcrypt.compare(password, user?.password || dummyPasswordHash)
        if (!user || !passwordMatches) return res.json(invalidCredentials)

        const token = issueAuthToken(user._id, user.role || 'customer')
        return authenticated(res, token)
    } catch {
        return res.json(signInFailure)
    }
}

// Route for user register
const registerUser = async (req, res) => {
    try {
        if (!validCredentials(req.body)) return res.json(registrationFailure)

        const { name, email, password, academicProgram } = req.body
        if (!await validAcademicProgram(academicProgram)) {
            return res.json({ success: false, message: 'Please select a valid academic program' })
        }
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: 'Please enter a valid email' })
        }
        if (password.length < 8) {
            return res.json({ success: false, message: 'Please enter a strong password' })
        }
        if (Buffer.byteLength(password, 'utf8') > 72) {
            return res.json({ success: false, message: 'Password must be no more than 72 UTF-8 bytes. Use a shorter password.' })
        }

        const existingUser = await userModel.findOne({ email })
        if (existingUser) return res.json(registrationFailure)

        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)
        const newUser = new userModel({
            name,
            email,
            password: hashedPassword,
            academicProgram
        })
        const user = await newUser.save()
        const token = issueAuthToken(user._id, 'customer')

        return authenticated(res, token)
    } catch {
        return res.json(registrationFailure)
    }
}

const getUserProfile = async (req, res) => {
    try {
        const user = await userModel.findOne(customerAccountQuery(req.body.userId))
        if (!user) return res.status(404).json(profileFailure)
        return res.json({ success: true, profile: publicProfile(user) })
    } catch {
        return res.status(503).json(profileFailure)
    }
}

const updateUserProfile = async (req, res) => {
    const { academicProgram, userId } = req.body
    try {
        if (!await validAcademicProgram(academicProgram)) {
            return res.status(400).json({ success: false, message: 'Please select a valid academic program' })
        }

        const user = await userModel.findOneAndUpdate(
            customerAccountQuery(userId),
            { $set: { academicProgram } },
            { returnDocument: 'after', runValidators: true }
        )
        if (!user) return res.status(404).json(profileFailure)
        return res.json({ success: true, profile: publicProfile(user) })
    } catch {
        return res.status(503).json({ success: false, message: 'Unable to update your profile. Please try again.' })
    }
}

// Route for admin and cashier login
const adminLogin = async (req, res) => {
    try {
        if (!validCredentials(req.body)) return res.json(invalidCredentials)

        const { email, password } = req.body
        const adminEmail = process.env.ADMIN_EMAIL
        const adminPassword = process.env.ADMIN_PASSWORD
        const adminIsConfigured = typeof adminEmail === 'string'
            && Boolean(adminEmail.trim())
            && typeof adminPassword === 'string'
            && Boolean(adminPassword)

        if (adminIsConfigured && email === adminEmail && password === adminPassword) {
            return authenticated(res, issueAuthToken(ADMIN_SUBJECT, 'admin'))
        }

        const cashier = await userModel.findOne({ email, role: 'cashier' })
        const passwordMatches = await bcrypt.compare(password, cashier?.password || dummyPasswordHash)
        if (!cashier || !passwordMatches) return res.json(invalidCredentials)

        return authenticated(res, issueAuthToken(cashier._id, 'cashier'))
    } catch {
        return res.json(signInFailure)
    }
}

export { adminLogin, getUserProfile, loginUser, registerUser, updateUserProfile }
