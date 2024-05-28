import {Router} from 'express';
import {is_logged_in} from '../middlewares/auth.middleware';
import {
  create_a_ticket,
  refer_a_friend,
  search_users,
} from '../controllers/main.controller';
const router = Router();

router.get('/search', is_logged_in, search_users);

router.post('/contact', is_logged_in, create_a_ticket);

router.post('/refer', is_logged_in, refer_a_friend);

export default router;
