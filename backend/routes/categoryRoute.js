import express from 'express'
import adminAuth from '../middleware/adminAuth.js'
import {
    createCategory,
    deleteCategory,
    listActiveCategories,
    listManagedCategories,
    removeDefaultCategory,
    updateCategory,
    updateDefaultCategory
} from '../controllers/categoryController.js'

const categoryRouter = express.Router()

categoryRouter.get('/public', listActiveCategories)
categoryRouter.get('/admin', adminAuth, listManagedCategories)
categoryRouter.post('/admin', adminAuth, createCategory)
categoryRouter.patch('/admin/default/:scope/:code', adminAuth, updateDefaultCategory)
categoryRouter.delete('/admin/default/:scope/:code', adminAuth, removeDefaultCategory)
categoryRouter.patch('/admin/:id', adminAuth, updateCategory)
categoryRouter.delete('/admin/:id', adminAuth, deleteCategory)

export default categoryRouter
