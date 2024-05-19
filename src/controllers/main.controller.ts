import USER from '../models/user.model';
import {handle_error} from '../utils/handle-error';
import {Request, Response} from 'express';

export async function search_users(req: Request, res: Response) {
  try {
    const {q: searchQuery} = req.query;

    if (typeof searchQuery !== 'string' || searchQuery.trim() === '') {
      res.status(400).json({mesage: 'Please specify a search query'});
      return;
    }

    // fetch results based on only usernames
    const users = await USER.find(
      {
        username: {$regex: searchQuery, $options: 'i'},
      },
      {username: 1, avatar: 1, bio: 1}
    );

    res.status(200).json({message: 'Success', data: users});
  } catch (error) {
    handle_error(Error, res);
  }
}
