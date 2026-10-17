import express from 'express';
import {loginUser, registerUser, adminLogin} from '../controllers/userController.js';
import { createAuthThrottle } from '../middleware/authThrottle.js';

const userRouter = express.Router();
const authThrottle = createAuthThrottle();

userRouter.post('/register',authThrottle,registerUser)
userRouter.post('/login',authThrottle,loginUser)
userRouter.post('/admin',authThrottle,adminLogin)

export default userRouter;
