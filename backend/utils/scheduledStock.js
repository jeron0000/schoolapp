import mongoose from 'mongoose'
import productModel from '../models/productModel.js'
import { getInventorySizes, isValidSizeLabel } from '../../shared/inventory.js'

export class ScheduledStockError extends Error {
    constructor(message, status = 400) {
        super(message)
        this.name = 'ScheduledStockError'
        this.status = status
    }
}

const plainSchedule = schedule => {
    if (!schedule) return null
    const value = typeof schedule.toObject === 'function'
        ? schedule.toObject({ flattenMaps: true })
        : { ...schedule }
    value._id = String(value._id)
    value.adjustments = value.adjustments instanceof Map
        ? Object.fromEntries(value.adjustments)
        : { ...value.adjustments }
    return value
}

const parseExecutionDate = (value, now) => {
    if (typeof value !== 'string') {
        throw new ScheduledStockError('Choose a valid future Asia/Manila date and time.')
    }
    const date = new Date(value)
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value || date.getTime() <= now) {
        throw new ScheduledStockError('Choose a valid future Asia/Manila date and time.')
    }
    return date
}

const parseAdjustments = (product, adjustments) => {
    if (!adjustments || typeof adjustments !== 'object' || Array.isArray(adjustments)) {
        throw new ScheduledStockError('Enter stock additions to schedule.')
    }
    const productSizes = getInventorySizes(product)
    const additions = {}
    for (const [size, quantity] of Object.entries(adjustments)) {
        if (!isValidSizeLabel(size) || !productSizes.includes(size) || !Number.isSafeInteger(quantity)) {
            throw new ScheduledStockError('Scheduled additions must be whole numbers for this product’s sizes.')
        }
        if (quantity < 0) {
            throw new ScheduledStockError('Scheduled stock updates can only add inventory.')
        }
        if (quantity > 0) additions[size] = quantity
    }
    if (!Object.keys(additions).length) {
        throw new ScheduledStockError('Enter at least one positive stock addition.')
    }
    return additions
}

export const presentScheduledStockUpdate = schedule => plainSchedule(schedule)

export const createScheduledStockUpdate = async ({ productId, adjustments, executeAt, now = Date.now() }) => {
    if (typeof productId !== 'string' || !mongoose.isObjectIdOrHexString(productId)) {
        throw new ScheduledStockError('Invalid product.')
    }
    await resolveDueScheduledStockUpdate(productId, new Date(now))
    const product = await productModel.findById(productId).lean()
    if (!product) throw new ScheduledStockError('Product not found.', 404)

    const additions = parseAdjustments(product, adjustments)
    const scheduledTime = parseExecutionDate(executeAt, now)
    const schedule = {
        _id: new mongoose.Types.ObjectId(),
        adjustments: additions,
        executeAt: scheduledTime,
        status: 'pending',
        attempts: 0,
        createdAt: new Date(now),
        executedAt: null,
        cancelledAt: null,
        failedAt: null,
        lastError: null
    }
    const updated = await productModel.findOneAndUpdate(
        {
            _id: productId,
            $or: [
                { scheduledStockUpdate: { $exists: false } },
                { 'scheduledStockUpdate.status': { $nin: ['pending', 'failed'] } }
            ]
        },
        { $set: { scheduledStockUpdate: schedule } },
        { returnDocument: 'after', runValidators: true }
    )
    if (!updated) {
        throw new ScheduledStockError(
            'This product already has a pending stock update. Cancel it before scheduling another.',
            409
        )
    }
    return { product: updated, schedule: plainSchedule(updated.scheduledStockUpdate) }
}

export const cancelScheduledStockUpdate = async (productId, now = Date.now()) => {
    if (typeof productId !== 'string' || !mongoose.isObjectIdOrHexString(productId)) {
        throw new ScheduledStockError('Invalid product.')
    }
    await resolveDueScheduledStockUpdate(productId, new Date(now))
    const product = await productModel.findOneAndUpdate(
        {
            _id: productId,
            'scheduledStockUpdate.status': { $in: ['pending', 'failed'] }
        },
        {
            $set: {
                'scheduledStockUpdate.status': 'cancelled',
                'scheduledStockUpdate.cancelledAt': new Date(now),
                'scheduledStockUpdate.lastError': null
            }
        },
        { returnDocument: 'after', runValidators: true }
    )
    if (!product) {
        const existing = await productModel.exists({ _id: productId })
        if (!existing) throw new ScheduledStockError('Product not found.', 404)
        throw new ScheduledStockError('There is no pending stock update to cancel.', 409)
    }
    return { product, schedule: plainSchedule(product.scheduledStockUpdate) }
}

const scheduleAdjustments = schedule => {
    if (schedule.adjustments instanceof Map) return Object.fromEntries(schedule.adjustments)
    return { ...schedule.adjustments }
}

export const executeScheduledStockUpdate = async (
    productId,
    schedule,
    now = new Date(),
    { session } = {}
) => {
    const additions = scheduleAdjustments(schedule)
    const sizes = Object.keys(additions)
    const conditions = sizes.map(size => ({
        $expr: {
            $lte: [
                { $add: [{ $ifNull: [`$inventory.${size}`, 0] }, additions[size]] },
                Number.MAX_SAFE_INTEGER
            ]
        }
    }))
    const increments = Object.fromEntries(
        sizes.map(size => [`inventory.${size}`, additions[size]])
    )
    const completed = await productModel.findOneAndUpdate(
        {
            _id: productId,
            sizes: { $all: sizes },
            'scheduledStockUpdate._id': schedule._id,
            'scheduledStockUpdate.status': { $in: ['pending', 'failed'] },
            'scheduledStockUpdate.executeAt': { $lte: now },
            $and: conditions
        },
        {
            $inc: {
                ...increments,
                'scheduledStockUpdate.attempts': 1
            },
            $set: {
                'scheduledStockUpdate.status': 'completed',
                'scheduledStockUpdate.executedAt': now,
                'scheduledStockUpdate.failedAt': null,
                'scheduledStockUpdate.lastError': null
            }
        },
        { returnDocument: 'after', runValidators: true, session }
    )
    if (completed) return { status: 'completed', product: completed }

    const current = await productModel.findById(productId, null, { session }).lean()
    if (!current || String(current.scheduledStockUpdate?._id) !== String(schedule._id)) {
        return { status: 'skipped' }
    }
    if (!['pending', 'failed'].includes(current.scheduledStockUpdate.status)) {
        return { status: 'skipped' }
    }

    const message = 'Scheduled stock could not be applied because product sizes or quantities changed.'
    await productModel.updateOne(
        {
            _id: productId,
            'scheduledStockUpdate._id': schedule._id,
            'scheduledStockUpdate.status': { $in: ['pending', 'failed'] }
        },
        {
            $inc: { 'scheduledStockUpdate.attempts': 1 },
            $set: {
                'scheduledStockUpdate.status': 'failed',
                'scheduledStockUpdate.failedAt': now,
                'scheduledStockUpdate.lastError': message
            }
        },
        { session }
    )
    return { status: 'failed', message }
}

export const resolveDueScheduledStockUpdate = async (
    productId,
    now = new Date(),
    { session } = {}
) => {
    const product = await productModel.findOne(
        {
            _id: productId,
            'scheduledStockUpdate.status': { $in: ['pending', 'failed'] },
            'scheduledStockUpdate.executeAt': { $lte: now }
        },
        { scheduledStockUpdate: 1 },
        { session }
    ).lean()
    if (!product?.scheduledStockUpdate) return { status: 'not-due' }

    return executeScheduledStockUpdate(
        productId,
        product.scheduledStockUpdate,
        now,
        { session }
    )
}

export const executeDueScheduledStockUpdates = async (now = new Date()) => {
    const dueProducts = await productModel.find({
        'scheduledStockUpdate.status': { $in: ['pending', 'failed'] },
        'scheduledStockUpdate.executeAt': { $lte: now }
    }).select('_id scheduledStockUpdate').lean()

    const results = []
    for (const product of dueProducts) {
        try {
            results.push(await executeScheduledStockUpdate(
                product._id,
                product.scheduledStockUpdate,
                now
            ))
        } catch (error) {
            results.push({ status: 'retryable', message: error.message })
        }
    }
    return {
        checked: dueProducts.length,
        completed: results.filter(result => result.status === 'completed').length,
        failed: results.filter(result => ['failed', 'retryable'].includes(result.status)).length
    }
}
