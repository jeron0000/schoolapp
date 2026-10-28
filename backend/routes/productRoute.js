import express from 'express'
import {
    addProduct,
    addProductListing,
    cancelPendingProductPricing,
    getProductPricing,
    listScheduledProductPricing,
    listProducts,
    removeProduct,
    replacePendingProductPricing,
    scheduleBulkProductPricing,
    scheduleStockUpdate,
    singleProduct,
    updateProductCategory,
    updateProductFlags,
    updateProductMeasurements,
    updateProductPricing,
    updateProductRestock,
    updateProductSizes,
    updateStock,
    cancelStockUpdate,
    getScheduledStockUpdate,
    updateProductVariants,
    removeProductVariant
} from '../controllers/productController.js'
import upload, { listingUpload } from '../middleware/multer.js';
import adminAuth from '../middleware/adminAuth.js';
import { MAX_LISTING_ITEMS } from '../../shared/productVariants.js'

const productRouter = express.Router();

productRouter.post('/add',adminAuth,upload.fields([{name:'image1',maxCount:1},{name:'image2',maxCount:1},{name:'image3',maxCount:1},{name:'image4',maxCount:1}]),addProduct);
const listingImageFields = Array.from({ length: MAX_LISTING_ITEMS }, (_, index) => (
    ['image1', 'image2', 'image3', 'image4'].map(field => ({ name: `item${index}${field}`, maxCount: 1 }))
)).flat()
productRouter.post('/add-listing', adminAuth, listingUpload.fields(listingImageFields), addProductListing)
productRouter.post('/remove',adminAuth,removeProduct);
productRouter.put('/variants/:id', adminAuth, updateProductVariants)
productRouter.delete('/variants/:id', adminAuth, removeProductVariant)
productRouter.patch('/category/:id', adminAuth, updateProductCategory)
productRouter.post('/flags',adminAuth,updateProductFlags);
productRouter.post('/stock',adminAuth,updateStock);
productRouter.post('/stock/scheduled', adminAuth, scheduleStockUpdate)
productRouter.get('/stock/scheduled/:id', adminAuth, getScheduledStockUpdate)
productRouter.delete('/stock/scheduled/:id', adminAuth, cancelStockUpdate)
productRouter.patch('/sizes/:id', adminAuth, updateProductSizes)
productRouter.patch('/measurements/:id', adminAuth, updateProductMeasurements)
productRouter.patch('/restock/:id', adminAuth, updateProductRestock)
productRouter.post('/pricing/bulk', adminAuth, scheduleBulkProductPricing)
productRouter.get('/pricing/scheduled', adminAuth, listScheduledProductPricing)
productRouter.get('/pricing/:id', adminAuth, getProductPricing)
productRouter.patch('/pricing/:id', adminAuth, updateProductPricing)
productRouter.patch('/pricing/:id/pending', adminAuth, replacePendingProductPricing)
productRouter.delete('/pricing/:id/pending', adminAuth, cancelPendingProductPricing)
productRouter.post('/single',singleProduct);
productRouter.get('/list',listProducts);

export default productRouter
