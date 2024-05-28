import TICKET from '../models/ticket.model';
import USER from '../models/user.model';
import {handle_error} from '../utils/handle-error';
import {Request, Response} from 'express';
import send_mail from '../utils/nodemailer';

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

export async function create_a_ticket(req: Request, res: Response) {
  try {
    const {fullName, email, message} = req.body;
    const {userId} = req;

    const ticketInfo = await TICKET.create({
      fullName,
      email,
      message,
      userId,
    });

    // send the ticket via mail to the admin and another one to the user letting them know the ticket is received
    await send_mail(email, 'ticket', 'Ticket Received', {
      ticketId: ticketInfo._id,
      fullName,
    });

    await send_mail(
      process.env.EMAIL as string,
      'ticket-admin',
      'New Ticket Created',
      {
        ticketId: ticketInfo._id,
        fullName,
        email,
        message,
      }
    );

    res.status(201).json({message: 'Ticket filed successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function refer_a_friend(req: Request, res: Response) {
  try {
    const {email} = req.body;
    const {userId} = req;

    const userInfo = await USER.findOne({_id: userId});

    if (!userInfo) {
      res.status(404).json({
        message:
          "There is a problem with your account's status. Please contact support or try again later",
      });
      return;
    }

    // send the referral email to the friend
    await send_mail(
      email,
      'referral',
      `${email} is inviting you to join skyboard`,
      {
        referrer: userInfo.username,
        refereeEmail: email,
        referalLink: `${process.env.FRONTEND_URL}/signup?ref=${userInfo._id}`,
      }
    );

    res.status(200).json({message: 'Referral sent successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}
