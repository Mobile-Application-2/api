import {Router} from 'express';
import {is_logged_in} from '../middlewares/auth.middleware';
import {search_users} from '../controllers/main.controller';
const router = Router();

router.get('/search', is_logged_in, search_users);

export default router;
