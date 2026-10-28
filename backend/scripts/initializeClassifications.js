import mongoose from 'mongoose'
import 'dotenv/config'
import connectDB from '../config/mongodb.js'
import { initializeDefaultClassifications } from '../utils/classificationDefaults.js'

const run = async () => {
    try {
        await connectDB()
        const result = await initializeDefaultClassifications()
        console.log(`Classification initialization completed with ${result.changed} change(s).`)
    } finally {
        await mongoose.disconnect()
    }
}

run().catch(() => {
    console.error('Classification initialization failed. Review category conflicts and database indexes.')
    process.exitCode = 1
})
