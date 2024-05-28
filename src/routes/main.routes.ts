import {Router} from 'express';
import {is_logged_in} from '../middlewares/auth.middleware';
import {create_a_ticket, search_users} from '../controllers/main.controller';
const router = Router();

router.get('/search', is_logged_in, search_users);

router.post('/contact', is_logged_in, create_a_ticket);

export default router;
