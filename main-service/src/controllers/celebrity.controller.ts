import {Request, Response} from 'express';
import {handle_error} from '../utils/handle-error';
import TOURNAMENT from '../models/tournament.model';
import {PipelineStage, isValidObjectId} from 'mongoose';
import GAME from '../models/game.model';

export async function get_my_tournaments(req: Request, res: Response) {
  try {
    const {userId} = req;

    const tournaments = await TOURNAMENT.find({creatorId: userId});

    res
      .status(200)
      .json({message: 'Tournaments retrieved successfully', data: tournaments});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_a_tournament(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    res.status(200).json({
      message: 'Tournament retrieved successfully',
      data: tournamentInfo,
    });
  } catch (error) {
    handle_error(error, res);
  }
}

// final winners
export async function get_tournament_winners(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamenId} = req.params;

    if (!isValidObjectId(tournamenId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    // check that torunament exists
    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamenId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    const pipeline: PipelineStage[] = [
      {
        $match: {
          creatorId: userId,
          _id: tournamenId,
        },
      },
      {
        $unwind: '$winners',
      },
      {
        $lookup: {
          from: 'users',
          localField: 'winners',
          foreignField: '_id',
          as: 'winner',
          pipeline: [
            {
              $project: {
                username: 1,
                avatar: 1,
              },
            },
          ],
        },
      },
      {
        $replaceRoot: {
          newRoot: '$winner',
        },
      },
    ];

    const winners = await TOURNAMENT.aggregate(pipeline);

    res
      .status(200)
      .json({message: 'Winners retrieved successfully', data: winners});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_tournament_participants(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    const pipeline: PipelineStage[] = [
      {
        $match: {
          creatorId: userId,
          _id: tournamentId,
        },
      },
      {
        $unwind: '$participants',
      },
      {
        $lookup: {
          from: 'users',
          localField: 'participants',
          foreignField: '_id',
          as: 'participant',
          pipeline: [
            {
              $project: {
                username: 1,
                avatar: 1,
              },
            },
          ],
        },
      },
      {
        $replaceRoot: {
          newRoot: '$participant',
        },
      },
    ];

    const participants = await TOURNAMENT.aggregate(pipeline);

    res.status(200).json({
      message: 'Participants retrieved successfully',
      data: participants,
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function create_tournament(req: Request, res: Response) {
  try {
    const {userId} = req;
    const tournamentInfo = req.body;

    if (!tournamentInfo || typeof tournamentInfo !== 'object') {
      res.status(400).json({message: 'Please provide tournament information'});
      return;
    }

    const allowedFields = [
      'name',
      'gameId',
      'registrationDeadline',
      'noOfWinners',
      'hasGateFee',
    ];

    if (tournamentInfo.hasGateFee) {
      allowedFields.push('gateFee');
    }

    const fields = Object.keys(tournamentInfo);

    const hasValidFields = fields.every(field => allowedFields.includes(field));
    const hasAllRequiredFields = allowedFields.every(field =>
      fields.includes(field)
    );

    if (!hasValidFields || !hasAllRequiredFields) {
      res.status(400).json({
        message: 'Please provide valid tournament information',
      });
      return;
    }

    // check gameId
    if (!isValidObjectId(tournamentInfo.gameId)) {
      res.status(400).json({message: 'Invalid game ID'});
      return;
    }

    const gameInfo = await GAME.findOne({_id: tournamentInfo.gameId});

    if (!gameInfo) {
      res.status(404).json({message: 'Game not found'});
      return;
    }

    // create
    const newTournament = await TOURNAMENT.create({
      ...tournamentInfo,
      creatorId: userId,
    });

    res
      .status(201)
      .json({message: 'Tournament created successfully', data: newTournament});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function update_prizes_to_tournament(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;
    const {prizes} = req.body;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    if (!tournamentInfo.isActive) {
      res.status(400).json({message: 'Tournament has already ended'});
      return;
    }

    if (!prizes || !Array.isArray(prizes)) {
      res.status(400).json({message: 'Please provide valid prizes'});
      return;
    }

    const prizesAreValid = prizes.every(
      prize => typeof prize === 'number' && prize > 0 && Number.isInteger(prize)
    );

    if (!prizesAreValid) {
      res.status(400).json({message: 'Please provide valid prizes'});
      return;
    }

    if (prizes.length !== tournamentInfo.noOfWinners) {
      res.status(400).json({
        message: 'Please provide prizes for all winners',
      });
      return;
    }

    const update = {
      prizes,
      isFullyCreated: false,
    };

    // so the order doesn't matter
    if (tournamentInfo.joiningCode) {
      update['isFullyCreated'] = true;
    }

    // update
    await TOURNAMENT.updateOne(
      {_id: tournamentId},
      {
        $set: {
          update,
        },
      }
    );

    res.status(200).json({message: 'Prizes updated successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function update_tournament_code(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;
    const {joiningCode} = req.body;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    if (!tournamentInfo.isActive) {
      res.status(400).json({message: 'Tournament has already ended'});
      return;
    }

    if (
      !joiningCode ||
      typeof joiningCode !== 'string' ||
      joiningCode.trim().length === 0
    ) {
      res.status(400).json({message: 'Please provide a valid joining code'});
      return;
    }

    // check that it is unique
    const codeExists = await TOURNAMENT.findOne({
      joiningCode,
    });

    if (codeExists && codeExists._id.toString() === tournamentId) {
      res.status(400).json({
        message: 'Joining code is already in use by this tournament',
      });
      return;
    }

    if (codeExists) {
      res.status(400).json({
        message: 'Joining code is already in use by another tournament',
      });
      return;
    }

    // so the order doesn't matter
    const update = {
      joiningCode,
      isFullyCreated: false,
    };

    // the model is now complete
    if (tournamentInfo.prizes.length) {
      update['isFullyCreated'] = true;
    }

    // update
    await TOURNAMENT.updateOne(
      {_id: tournamentId},
      {
        $set: update,
      }
    );

    res.status(200).json({message: 'Joining code updated successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}
