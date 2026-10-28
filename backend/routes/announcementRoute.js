import express from 'express'
import adminAuth from '../middleware/adminAuth.js'
import {
    createAnnouncement,
    deleteAnnouncement,
    deleteAnnouncementById,
    getManagedAnnouncement,
    getManagedAnnouncements,
    getPublicAnnouncement,
    getPublicAnnouncements,
    updateAnnouncement,
    updateAnnouncementById
} from '../controllers/announcementController.js'

const announcementRouter = express.Router()

announcementRouter.get('/public', getPublicAnnouncement)
announcementRouter.get('/public/list', getPublicAnnouncements)
announcementRouter.get('/admin', adminAuth, getManagedAnnouncement)
announcementRouter.get('/admin/list', adminAuth, getManagedAnnouncements)
announcementRouter.post('/admin', adminAuth, createAnnouncement)
announcementRouter.patch('/admin', adminAuth, updateAnnouncement)
announcementRouter.delete('/admin', adminAuth, deleteAnnouncement)
announcementRouter.patch('/admin/:id', adminAuth, updateAnnouncementById)
announcementRouter.delete('/admin/:id', adminAuth, deleteAnnouncementById)

export default announcementRouter
