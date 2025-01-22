import {Router} from 'express';
import {
  begin_2fa_process,
  change_password,
  edit_profile,
  get_default_avatars,
  get_my_profile,
  login,
  logout,
  refresh_tokens,
  register_celebrity,
  register_user,
  reset_password,
  send_email_otp,
  send_reset_password_email,
  send_sms_otp,
  verify_email_otp,
  verify_sms_otp,
} from '../controllers/auth.controller';
import {is_logged_in} from '../middlewares/auth.middleware';
import {process_file} from '../middlewares/file-upload.middleware';
import {rate_limit_verification} from '../middlewares/ratelimiter.middleware';
const router = Router();

router.get('/profile', is_logged_in, get_my_profile);

router.get('/avatars', get_default_avatars);

router.post('/register/user', register_user);

router.post('/register/celebrity', register_celebrity);

router.post('/login', login);

router.post('/logout', logout);

router.post('/refresh-tokens', refresh_tokens);

// todo include purpose as a req paramater
router.post('/send-email-otp', rate_limit_verification, send_email_otp);

// todo include purpose as a request parameter
router.post('/verify-email-otp', rate_limit_verification, verify_email_otp);

// todo include purpose as a request parameter
router.post('/send-sms-otp', rate_limit_verification, send_sms_otp);

// todo include purpose as a req paramater
router.post('/verify-sms-otp', rate_limit_verification, verify_sms_otp);

router.patch('/profile', is_logged_in, process_file('avatar'), edit_profile);

router.patch('/password', is_logged_in, change_password);

router.patch('/send-reset-password-mail', send_reset_password_email);

router.patch('/reset-password', reset_password);

router.patch('/2fa', is_logged_in, begin_2fa_process);

export default router;
