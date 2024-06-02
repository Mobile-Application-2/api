import TICKET from '../models/ticket.model';
import USER from '../models/user.model';
import {handle_error} from '../utils/handle-error';
import {Request, Response} from 'express';
import send_mail from '../utils/nodemailer';
import NOTIFICATION from '../models/notification.model';
import isEmail from 'validator/lib/isEmail';
import {isValidObjectId} from 'mongoose';

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
      {username: 1, avatar: 1, bio: 1},
      {limit: 50}
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

    if (!email || isEmail(email) === false) {
      res.status(400).json({message: 'Please provide a valid email address'});
      return;
    }

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

export async function get_notifications(req: Request, res: Response) {
  try {
    const {userId} = req;

    const notifications = await NOTIFICATION.find({userId});

    const notificationIds = notifications.map(notification => notification._id);

    // mark all notifications as read
    await NOTIFICATION.updateMany({_id: {$in: notificationIds}}, {read: true});

    res.status(200).json({message: 'Success', data: notifications});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function delete_notification(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {id: notificationId} = req.params;

    if (!isValidObjectId(notificationId)) {
      res.status(400).json({message: 'Invalid notification id'});
      return;
    }

    const notification = await NOTIFICATION.findOne({_id: notificationId});

    if (!notification) {
      res.status(404).json({message: 'Notification not found'});
      return;
    }

    if (!notification.userId.equals(userId)) {
      res
        .status(403)
        .json({message: 'You are not authorized to delete this notification'});
      return;
    }

    await notification.deleteOne({_id: notificationId});

    res.status(200).json({message: 'Notification deleted successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function delete_all_notifications(req: Request, res: Response) {
  try {
    const {userId} = req;

    await NOTIFICATION.deleteMany({userId});

    res.status(200).json({message: 'All notifications deleted successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}
