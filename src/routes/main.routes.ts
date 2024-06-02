import {Router} from 'express';
import {is_logged_in} from '../middlewares/auth.middleware';
import {
  create_a_ticket,
  get_notifications,
  refer_a_friend,
  search_users,
  delete_notification,
  delete_all_notifications,
} from '../controllers/main.controller';
const router = Router();

router.get('/search', is_logged_in, search_users);

router.get('/notifications', is_logged_in, get_notifications);

router.post('/contact', is_logged_in, create_a_ticket);

router.post('/refer', is_logged_in, refer_a_friend);

router.delete('/notification/:id', is_logged_in, delete_notification);

router.delete('/notifications', is_logged_in, delete_all_notifications);

export default router;
