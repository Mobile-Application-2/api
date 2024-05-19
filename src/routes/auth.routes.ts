import {Router} from 'express';
import {
  get_my_profile,
  login,
  register_user,
} from '../controllers/auth.controller';
import {is_logged_in} from '../middlewares/auth.middleware';
const router = Router();

router.post('/register/user', register_user);

router.post('/login', login);

router.get('/profile', is_logged_in, get_my_profile);

export default router;
