import {Router} from 'express';
import authRoutes from './auth.routes';
import mainRoutes from './main.routes';
const router = Router();

router.use('/', mainRoutes);

router.use('/auth', authRoutes);

export default router;
