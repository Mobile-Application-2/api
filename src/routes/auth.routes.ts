import {Router} from 'express';
import {
  change_password,
  edit_profile,
  get_my_profile,
  login,
  refresh_tokens,
  register_user,
  send_email_otp,
  verify_email_otp,
} from '../controllers/auth.controller';
import {is_logged_in} from '../middlewares/auth.middleware';
import {process_file} from '../middlewares/file-upload.middleware';
const router = Router();

router.get('/profile', is_logged_in, get_my_profile);

router.post('/register/user', register_user);

router.post('/login', login);

router.post('/refresh-tokens', refresh_tokens);

router.post('/send-email-otp', send_email_otp);

router.post('/verify-email-otp', verify_email_otp);

router.patch('/profile', is_logged_in, process_file, edit_profile);

router.patch('/password', is_logged_in, change_password);

export default router;
