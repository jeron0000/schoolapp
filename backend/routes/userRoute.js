import express from 'express';
import { adminLogin, getUserProfile, loginUser, registerUser, updateUserProfile } from '../controllers/userController.js';
import { createAuthThrottle } from '../middleware/authThrottle.js';
import authUser from '../middleware/auth.js';

const userRouter = express.Router();
const authThrottle = createAuthThrottle();

userRouter.post('/register',authThrottle,registerUser)
userRouter.post('/login',authThrottle,loginUser)
userRouter.post('/admin',authThrottle,adminLogin)
userRouter.get('/profile',authUser,getUserProfile)
userRouter.put('/profile',authUser,updateUserProfile)

export default userRouter;
