import {isValidObjectId, PipelineStage} from 'mongoose';
import GAME from '../models/game.model';
import {delete_file, upload_file} from '../utils/cloudinary';
import {handle_error} from '../utils/handle-error';
import {Request, Response} from 'express';
import USER from '../models/user.model';
import ADMINTRANSACTION from '../models/admin-transaction.model';
import ADMIN from '../models/admin.model';
import * as Sentry from '@sentry/node';
import TRANSACTION from '../models/transaction.model';

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

export async function get_users_summary(_: Request, res: Response) {
  try {
    const totalRegularUsers = await USER.countDocuments({isCelebrity: false});
    const totalCelebrityUsers = await USER.countDocuments({isCelebrity: true});
    const totalAdminAccounts = await ADMIN.countDocuments();

    res.status(200).json({
      message: 'Success',
      data: {totalAdminAccounts, totalCelebrityUsers, totalRegularUsers},
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_users(req: Request, res: Response) {
  try {
    const {pageNo, searchTerm, resultsPerPage, joinedMonthAndYear} = req.query;

    const MAX_RESULTS = resultsPerPage ? +resultsPerPage : 10;
    let currentPage;

    if (typeof pageNo !== 'string' || isNaN(+pageNo) || +pageNo <= 0) {
      currentPage = 1;
    } else {
      currentPage = Math.floor(+pageNo);
    }

    const skip = (currentPage - 1) * MAX_RESULTS;
    let filter = {};

    if (searchTerm) {
      filter = {username: {$regex: searchTerm, $options: 'i'}};
    }

    if (joinedMonthAndYear) {
      const date = new Date(joinedMonthAndYear as string);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();

      const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      const startOfNextMonth = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

      filter = {
        ...filter,
        createdAt: {
          $gte: startOfMonth,
          $lt: startOfNextMonth,
        },
      };
    }

    const users = await USER.find(
      filter,
      {
        username: 1,
        email: 1,
        createdAt: 1,
        isCelebrity: 1,
        accountIsActive: 1,
      },
      {limit: MAX_RESULTS, skip}
    );

    res.status(200).json({message: 'Success', data: users});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function block_user(req: Request, res: Response) {
  try {
    const {userId} = req.params;

    if (!isValidObjectId(userId)) {
      res.status(400).json({message: 'Invalid user id'});
      return;
    }

    const user = await USER.findOne({_id: userId});

    if (!user) {
      res.status(404).json({message: 'User not found'});
      return;
    }

    if (user.accountIsActive === false) {
      res.status(400).json({message: 'User is already blocked'});
      return;
    }

    await USER.updateOne({_id: userId}, {$set: {accountIsActive: false}});

    res.status(200).json({message: 'User blocked successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function unblock_user(req: Request, res: Response) {
  try {
    const {userId} = req.params;

    if (!isValidObjectId(userId)) {
      res.status(400).json({message: 'Invalid user id'});
      return;
    }

    const user = await USER.findOne({_id: userId});

    if (!user) {
      res.status(404).json({message: 'User not found'});
      return;
    }

    if (user.accountIsActive === true) {
      res.status(400).json({message: 'User is already unblocked'});
      return;
    }

    await USER.updateOne({_id: userId}, {$set: {accountIsActive: true}});

    res.status(200).json({message: 'User unblocked successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_all_transactions(req: Request, res: Response) {
  try {
    const {pageNo, searchTerm, resultsPerPage, monthAndYear} = req.query;

    // default to 100,000,000 if resultsPerPage is not provided, should serve for now
    const MAX_RESULTS = resultsPerPage ? +resultsPerPage : 100_000_000;
    let currentPage;

    if (typeof pageNo !== 'string' || isNaN(+pageNo) || +pageNo <= 0) {
      currentPage = 1;
    } else {
      currentPage = Math.floor(+pageNo);
    }

    const skip = (currentPage - 1) * MAX_RESULTS;
    let filter = {};

    if (searchTerm) {
      filter = {
        $or: [
          {description: {$regex: searchTerm, $options: 'i'}},
          {status: searchTerm},
        ],
      };
    }

    if (monthAndYear) {
      const date = new Date(monthAndYear as string);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();

      const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      const startOfNextMonth = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

      filter = {
        ...filter,
        createdAt: {
          $gte: startOfMonth,
          $lt: startOfNextMonth,
        },
      };
    }

    const projections = {
      userId: 1,
      type: 1,
      createdAt: 1,
      status: 1,
      amount: 1,
    };

    // fetch all transactions, then sum all deposits and withdrawals as total deposits and total withdrawals
    const pipeline: PipelineStage[] = [
      {
        $facet: {
          allTransactions: [
            {
              $match: filter,
            },
            {
              $project: projections,
            },
            {
              $skip: skip,
            },
            {
              $limit: MAX_RESULTS,
            },
          ],
          totals: [
            {
              $match: filter,
            },
            {
              $skip: skip,
            },
            {
              $limit: MAX_RESULTS,
            },
            {
              $group: {
                _id: null,
                totalDeposits: {
                  $sum: {
                    $cond: {
                      if: {$eq: ['$type', 'deposit']},
                      then: '$amount',
                      else: 0,
                    },
                  },
                },
                totalWithdrawals: {
                  $sum: {
                    $cond: {
                      if: {$eq: ['$type', 'withdrawal']},
                      then: '$amount',
                      else: 0,
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ];

    const transactions = await TRANSACTION.aggregate(pipeline);

    res.status(200).json({message: 'Success', data: transactions});
  } catch (error) {
    handle_error(error, res);
  }
}
