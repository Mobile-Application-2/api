import {isValidObjectId} from 'mongoose';
import GAME from '../models/game.model';
import {delete_file, upload_file} from '../utils/cloudinary';
import {handle_error} from '../utils/handle-error';
import {Request, Response} from 'express';
import USER from '../models/user.model';
import ADMINTRANSACTION from '../models/admin-transaction.model';
import ADMIN from '../models/admin.model';
import * as Sentry from '@sentry/node';

export async function create_game(req: Request, res: Response) {
  try {
    const gameInfo = req.body;

    const requiredFields = ['image', 'name', 'description'];

    const hasRequiredFields = requiredFields.every(field =>
      Object.prototype.hasOwnProperty.call(gameInfo, field)
    );

    if (!hasRequiredFields) {
      res
        .status(400)
        .json({message: 'Please provide image, name and description'});
      return;
    }

    if (typeof gameInfo !== 'object' || Object.keys(gameInfo).length === 0) {
      res.status(400).json({message: 'Please provide game information'});
      return;
    }

    gameInfo['image'] = await upload_file(gameInfo['image'], 'game');

    await GAME.create(gameInfo);

    res.status(201).json({message: 'Game created successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function update_game(req: Request, res: Response) {
  try {
    const update = req.body;
    const {gameId} = req.params;

    if (!isValidObjectId(gameId)) {
      res.status(400).json({message: 'Invalid game id'});
      return;
    }

    if (update === undefined || Object.keys(update).length === 0) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    const fieldsFromUpdate = Object.keys(update);
    const validFields = ['image', 'name', 'description', 'isActive'];

    const hasInvalidFields = fieldsFromUpdate.some(
      field => validFields.includes(field) === false
    );

    if (hasInvalidFields) {
      res
        .status(400)
        .json({message: 'Update failed as request contains invalid fields'});
      return;
    }

    if (Object.prototype.hasOwnProperty.call(update, 'image')) {
      const gameInfo = await GAME.findOne({_id: gameId});

      if (!gameInfo) {
        res.status(404).json({message: 'Game not found'});
        return;
      }

      await delete_file(gameInfo['image'], 'game');

      update['image'] = await upload_file(update['image'], 'game');
    }

    const updateInfo = await GAME.updateOne({_id: gameId}, {$set: update});

    if (updateInfo.modifiedCount === 0) {
      res.status(404).json({message: 'Game not found'});
      return;
    }

    res.status(200).json({message: 'Game updated successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_games(_: Request, res: Response) {
  try {
    const games = await GAME.find();

    res.status(200).json({message: 'Games fetch successfully', data: games});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_dashboard_details(_: Request, res: Response) {
  try {
    const totalUsers = await USER.countDocuments();
    const totalGames = await GAME.countDocuments();
    const totalTransactions = await ADMINTRANSACTION.find();
    const adminInfo = await ADMIN.findOne(); // there should be exactly 1 document always

    if (!adminInfo) {
      Sentry.captureMessage('There is no admin account in the DB', {
        level: 'fatal',
      });

      res.status(401).json({
        message: 'Something went wrong while verifying your auth status',
      });
      return;
    }

    const topGames = await GAME.find(
      {},
      {name: 1, averageRating: 1},
      {sort: {averageRating: -1}, limit: 5}
    );

    res.status(200).json({
      message: 'Success',
      data: {
        totalUsers,
        totalGames,
        totalRevenue: adminInfo.walletBalance,
        totalTransactions,
        topGames,
      },
    });
  } catch (error) {
    handle_error(error, res);
  }
}
