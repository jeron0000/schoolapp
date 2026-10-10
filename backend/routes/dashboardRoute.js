import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import { dashboardOverview } from '../controllers/dashboardController.js';

const dashboardRouter = express.Router();
dashboardRouter.get('/overview', adminAuth, dashboardOverview);

export default dashboardRouter;
