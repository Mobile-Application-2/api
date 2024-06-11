import {Router} from 'express';
import authRoutes from './auth.routes';
import mainRoutes from './main.routes';
import paymentRoutes from './payment.routes';
import adminRoutes from './admin.routes';
import {
  rate_limit_auth,
  rate_limit_payment,
} from '../middlewares/ratelimiter.middleware';
const router = Router();

router.use('/', mainRoutes);

router.use('/auth', rate_limit_auth, authRoutes);

router.use('/payment', rate_limit_payment, paymentRoutes);

router.use('/admin', adminRoutes);

export default router;
