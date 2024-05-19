import {Router} from 'express';
import {register_user} from '../controllers/auth.controller';
const router = Router();

router.post('/register/user', register_user);

export default router;
