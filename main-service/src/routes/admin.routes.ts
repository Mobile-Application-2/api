import {Router} from 'express';
import {create_game, update_game} from '../controllers/admin.controller';
import {process_file} from '../middlewares/file-upload.middleware';
const router = Router();

router.post('/games', process_file('image'), create_game);

router.patch('/game/:gameId', process_file('image'), update_game);

export default router;
