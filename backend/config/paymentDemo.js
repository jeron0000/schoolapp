import mongoose from 'mongoose'

const validDemoDatabase = name => typeof name === 'string' && /^pamo_demo_[a-z0-9_]{1,40}$/.test(name)

export const getApplicationDatabaseName = (env = process.env) => {
    if (env.PAMO_PAYMENT_MODE !== 'demo') return 'e-commerce'
    if (!validDemoDatabase(env.PAMO_DEMO_DATABASE)) {
        throw new Error('Demo payments require a dedicated PAMO_DEMO_DATABASE named pamo_demo_*.')
    }
    return env.PAMO_DEMO_DATABASE
}

export const demoPaymentsEnabled = (env = process.env, connection = mongoose.connection) => (
    env.PAMO_PAYMENT_MODE === 'demo'
    && validDemoDatabase(env.PAMO_DEMO_DATABASE)
    && connection.readyState === 1
    && connection.name === env.PAMO_DEMO_DATABASE
)

export const requireDemoPayments = () => {
    if (!demoPaymentsEnabled()) {
        throw Object.assign(new Error('Demo payments are disabled outside the isolated demonstration database.'), { status: 403 })
    }
}
