import { dashboardRange, getDashboardOverview } from '../utils/dashboard.js';

export const dashboardOverview = async (req, res) => {
    let range;
    try {
        if (Object.keys(req.query).some(key => key !== 'range')) {
            return res.status(400).json({ success: false, message: 'Only the range query parameter is supported.' });
        }
        range = dashboardRange(req.query.range);
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
    try {
        const overview = await getDashboardOverview(range);
        res.json({ success: true, ...overview });
    } catch {
        res.status(500).json({ success: false, message: 'Unable to load dashboard analytics. Please try again.' });
    }
};
