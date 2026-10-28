import mongoose from "mongoose";
import { getApplicationDatabaseName } from './paymentDemo.js';

let connecting;

const connectDB = async () => {
    const dbName = getApplicationDatabaseName();
    if (mongoose.connection.readyState === 1) {
        if (process.env.PAMO_PAYMENT_MODE === 'demo' && mongoose.connection.name !== dbName) {
            throw new Error('The connected database does not match the demonstration database.');
        }
        return mongoose.connection;
    }
    if (!connecting) {
        connecting = Promise.resolve().then(() => mongoose.connect(process.env.MONGODB_URI, {
            dbName,
            serverSelectionTimeoutMS: 10000
        })).catch(error => {
            connecting = undefined;
            throw error;
        });
    }
    const pendingConnection = connecting;
    try {
        await pendingConnection;
        if (process.env.PAMO_PAYMENT_MODE === 'demo' && mongoose.connection.name !== dbName) {
            throw new Error('The connected database does not match the demonstration database.');
        }
        return mongoose.connection;
    } finally {
        if (connecting === pendingConnection) connecting = undefined;
    }
};

export default connectDB;
