import {isValidObjectId} from 'mongoose';
import GAME from '../models/game.model';
import {delete_file, upload_file} from '../utils/cloudinary';
import {handle_error} from '../utils/handle-error';
import {Request, Response} from 'express';

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
    const validFields = ['image', 'name', 'description'];

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
