import {Router} from 'express';
import authRoutes from './auth.routes';
import mainRoutes from './main.routes';
import paymentRoutes from './payment.routes';
const router = Router();

router.use('/', mainRoutes);

router.use('/auth', authRoutes);

router.use('/payment', paymentRoutes);

export default router;
