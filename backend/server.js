import express from 'express'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'
import dashboardRouter from './routes/dashboardRoute.js'
import heroRouter, { heroErrorHandler } from './routes/heroRoute.js'
import announcementRouter from './routes/announcementRoute.js'
import categoryRouter from './routes/categoryRoute.js'
import { apiErrorHandler } from './middleware/apiErrorHandler.js'
import { configureLocalApiSecurity, LOCAL_API_HOST } from './config/localApiSecurity.js'


// app config
const app = express()
const port = process.env.PORT || 4000

// middlewares
configureLocalApiSecurity(app)
app.use(express.json())
// Vercel imports this app without calling startServer. Resolve infrastructure
// before API handlers use models; concurrent requests share MongoDB readiness.
app.use('/api', async (_req, res, next) => {
    try {
        await connectCloudinary()
        await connectDB()
        next()
    } catch {
        res.status(503).json({ success: false, message: 'Service is temporarily unavailable. Please try again.' })
    }
})

// api endpoints
app.use('/api/user',userRouter)
app.use('/api/product',productRouter)
app.use('/api/cart', cartRouter)
app.use('/api/order', orderRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/hero', heroRouter, heroErrorHandler)
app.use('/api/announcement', announcementRouter)
app.use('/api/category', categoryRouter)

app.get('/',(req,res)=>{
    res.send("API WORKING")
})

app.use(apiErrorHandler)

export const startServer = async () => {
    await connectCloudinary()
    await connectDB()

    const server = app.listen(port, LOCAL_API_HOST, ()=> console.log('Server started on loopback PORT : '+ port))
    await once(server, 'listening')
    return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startServer().catch(() => {
        console.error('Backend startup failed. Check database connectivity and local configuration.')
        process.exitCode = 1
    })
}

export default app
