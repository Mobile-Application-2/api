import { logger } from "../config/winston.config.js";
import { gameSessionManager } from "../GameSessionManager.js";
import { emitTimeRemaining } from "../gameUtils.js";
import MainServerLayer from "../MainServerLayer.js";
import LOBBY from "../models/lobby.model.js";
import USER from "../models/user.model.js";
import GameModel from "./models/game.model.js";

export default class Chess {
    static white = 1;
    static black = 2;

    static winner = "";

    /**@type {Map<string, NodeJS.Timeout>} */
    static intervals = new Map()

    static timePerPlayer = process.env.NODE_ENV == "production" ? 1000 * 30 : 1000 * 10;

    static rooms = [
        {
            roomID: '',
            tournamentId: '',
            state: {
                squares: [],
                whiteFallenSoldiers: [],
                blackFallenSoldiers: [],
                player: 1,
                sourceSelection: -1,
                status: '',
                turn: 'white',
                winner: false,
                roomID: ''
            },
            players: [{
                username: "",
                socketID: "",
                avatar: "",
                userId: "",
            }]
        }
    ]

    /**
   * @typedef {Object} GameData
   * @property {string} gameId - The unique identifier for the game.
   * @property {string} playerId - The unique identifier for the player.
   * @property {string} opponentId - The unique identifier for the opponent.
   * @property {string} stakeAmount - The amount staked in the game.
   * @property {string} tournamentId - The unique identifier for tournaments.
   * @property {string} lobbyCode - The unique lobby code for the game.
   * @property {string} gameName - The name of the game.
   * 
   */

    /**
     * Activates the game logic for handling WebSocket connections.
     * 
     * @param {import("socket.io").Server} io - The main Socket.IO server instance.
     * @param {import("socket.io").Namespace} chessNameSpace - The specific namespace for the Whot game.
     * @param {Array<GameData>} mainRooms - A map of active game rooms.
     */
    static async activate(io, chessNameSpace, mainRooms) {
        chessNameSpace.on('connection', socket => {
            logger.info("user connected to chess server");
            // TODO: reconnect player to game if disconnected and game still on

            socket.on('join_game', async (data, state) => {
                await this.joinGame(chessNameSpace, socket, data, state);

                const roomID = data.lobbyCode;

                const lobbyCode = data.lobbyCode;

                const game = gameSessionManager.getGame(roomID);

                if(!game) {
                    // CREATE
                    const createdGame = gameSessionManager.createGame(lobbyCode);

                    if (!createdGame) {
                        logger.warn("couldnt create game with game session manager", { lobbyCode });
    
                        return;
                    }
    
                    createdGame.createTimer(this.timePerPlayer, () => {
                        // console.log(this, roomID)
                        logger.info("timer details", {roomID})
                        this.elapsedTimer(roomID, chessNameSpace)
                    })
    
                    logger.info("created game timer", { lobbyCode })
                    
                    logger.info("created game for game session", {lobbyCode})

                    return;
                }

                if (!game.timer) {
                    logger.warn("no game timer found for room.", { lobbyCode })

                    return;
                }

                game.startTimer();

                logger.info("started game timer", { lobbyCode })

                const interval = setInterval(() => {
                    if (!game.timer) {
                        logger.warn("no game timer found for interval.")

                        return
                    };

                    // logger.info("emitting time remaining");

                    emitTimeRemaining(chessNameSpace, roomID, game);
                }, 1000)

                interval.unref();

                this.intervals.set(roomID, interval);

                logger.info("sending info to main server");

                const lobbyID = await MainServerLayer.getLobbyID(roomID);

                await MainServerLayer.startGame(lobbyID);

                logger.info("done sending info to main server");
            });

            socket.on('turn_played', (roomID, indexClicked, newPosition, callback) => {
                callback({
                    status: "ok"
                })
                logger.info("turn played", { roomID })
                this.turnPlayed(socket, roomID, indexClicked, newPosition)
                
                this.resetTimer(roomID)
            })

            socket.on('game_over', async (roomID, player_winner) => {
                // const gameModel = new GameModel({
                //     game_name: "chess",
                //     players: [
                //         {
                //             username: "any",
                //             socketID: socket.id,
                //             userId: data.playerId
                //         }
                //     ],
                //     roomID: roomID
                // })
                // await GameModel.updateOne({ roomID: roomID, 'players.socketID': socket.id }, {
                //     $set: { 'players.$.winner': true }
                // })

                const mainWinner = this.rooms.players.find(player => player.socketID == socket.id);
                const loser = this.rooms.players.find(player => player.socketID != socket.id);

                io.to(loser.socketID).emit("lost")

                const interval = this.intervals.get(roomID);

                if (interval) {
                    clearInterval(interval);
                    this.intervals.delete(roomID);
                }

                const g = gameSessionManager.getGame(roomID);

                if(g) {
                    g.cancelTimer();
                    logger.info("cancelled game timer", {roomID})
                }

                const mainWinnerId = mainWinner.userId;
                const loserId = loser.userId;

                const mainFoundRooms = mainRooms.filter(room => room.lobbyCode == roomID);

                logger.info("main found rooms", mainFoundRooms);

                const gameResult = {
                    winner: mainWinnerId,
                    loser: loserId
                }

                logger.info("result chess", gameResult);

                const mainServerRooms = mainFoundRooms.map(room => room.socketId);

                logger.info("main server rooms", mainServerRooms);

                io.to(mainServerRooms).emit("gameEnd", gameResult);

                const currentRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                const winner = currentRoom.players.find(player => player.socketID == socket.id);

                const winnerData = await USER.findOne({ username: winner.username })

                const winnerId = winnerData.toObject()._id

                if (currentRoom.tournamentId) {
                    await MainServerLayer.wonTournamentGame(currentRoom.tournamentId, winnerId)
                }

                const lobbyId = await MainServerLayer.getLobbyID(roomID);

                await MainServerLayer.wonGame(lobbyId, winnerId);

                // await GameModel.findOne({'players.username'})
            })

            socket.on('disconnect', () => {
                logger.info("user disconnected from chess", socket.id);

                const room = this.rooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

                // logger.info(room);

                if (!room) return;
                
                const interval = this.intervals.get(room.roomID);

                if (interval) {
                    clearInterval(interval);
                    this.intervals.delete(room.roomID);
                }

                const g = gameSessionManager.getGame(room.roomID);

                if(g) {
                    g.cancelTimer();
                    logger.info("cancelled game timer", {roomID: room.roomID})
                }

                // TODO: remove player from game lobby not whole lobby

                io.emit('remove', 'chess', room.roomID);
            })

            socket.on('disconnecting', () => {
                for (let i = 0; i < this.rooms.length; ++i) {
                    const currentRoom = this.rooms[i];

                    if (currentRoom.players.filter(player => player.socketID == socket.id)[0] != undefined) {
                        logger.info("player is disconnecting");

                        chessNameSpace.to(currentRoom.roomID).emit('pause');
                        // socket.leave(currentRoom.roomID);

                        // currentRoom.players

                        // currentRoom.players = currentRoom.players.filter(player => player.socketID != socket.id);

                        // if(currentRoom.players.length == 0) {

                        // }

                        // break;
                    }
                }
            })
        })
    }

    static resetTimer(roomID) {
        const game = gameSessionManager.getGame(roomID);

        if (!game) {
            logger.warn("no game found to reset timer", { roomID });

            return;
        }

        game.cancelTimer();

        game.startTimer();
    }

    static elapsedTimer(roomID, namespace) {
        logger.info("timer has elapsed", {roomID})
        // SWITCH TURN
        const currentRoom = this.rooms.filter(room => room.roomID == roomID)[0];

        logger.info("current room for turn played", {roomID});

        if (!currentRoom) {
            logger.warn("no current room on elapsed timer")

            const interval = this.intervals.get(roomID);

            clearInterval(interval);

            return;
        }

        namespace.to(roomID).emit("timer-elapsed");

        logger.info("emitted timer elapsed")

        // CREATE NEW TIMER
        const game = gameSessionManager.getGame(roomID);

        if (!game) {
            logger.warn("no game found", { roomID });

            return;
        }

        game.cancelTimer();

        game.createTimer(this.timePerPlayer, () => this.elapsedTimer(roomID, namespace));

        logger.info("new timer created")

        game.startTimer();
    }

    static async turnPlayed(socket, roomID, indexClicked, newPosition) {
        // logger.info(newState, this.rooms[0].state);
        // logger.info(newState);
        const currentRoom = this.rooms.filter(room => room.roomID == roomID)[0];

        logger.info("current room for turn played", {roomID});

        if (currentRoom) {
            // currentRoom.state = newState;

            logger.info("sending turn played to opponent");

            socket.broadcast.emit('turn_played', indexClicked, newPosition);
        }
    }

    static async createGame(socket, data, state) {
        const roomID = data.lobbyCode;

        socket.join(roomID);

        // logger.info("state on room create", state);

        // const game = await GameModel.findOne({ roomID: roomID })

        // if (game != null) {
        //     logger.info('room id exist');

        //     return
        // }

        // const gameModel = new GameModel({
        //     game_name: "chess",
        //     players: [
        //         {
        //             username: state.username,
        //             socketID: socket.id,
        //             userId: data.playerId
        //         }
        //     ],
        //     roomID: roomID
        // });

        // await gameModel.save();

        this.rooms.push({
            roomID: roomID,
            tournamentId: data.tournamentId,
            state: state,
            players: [
                {
                    username: state.username,
                    socketID: socket.id,
                    avatar: state.avatar,
                    userId: data.playerId
                }
            ]
        });

        logger.info("user created game");
    }


    /**
     * @typedef {Object} GameData
     * @property {string} gameId - The unique identifier for the game.
     * @property {string} playerId - The unique identifier for the player.
     * @property {string} opponentId - The unique identifier for the opponent.
     * @property {string} stakeAmount - The amount staked in the game.
     * @property {string} tournamentId - The unique identifier for tournaments.
     * @property {string} lobbyCode - The unique lobby code for the game.
     * @property {string} gameName - The name of the game.
     * 
     */

    // http://localhost:5173/game/my-Chess?lobbyCode=123456&playerId=2178bhjsbdhus
    // http://localhost:5657/game?gameName=my-Chess&lobbyCode=123456&playerId=2178bhjsbdhus

    static async joinGame(chessNameSpace, socket, data, state) {
        const { gameId, gameName, lobbyCode, opponentId, playerId, stakeAmount, tournamentId } = data;

        logger.info("user want to join or create a game, params: ", {data})

        const roomID = lobbyCode

        const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

        // logger.info(gameRoom);

        if (gameRoom != undefined) {
            logger.info("game room exists, trying to join");

            if (gameRoom.players.length > 1) {
                logger.info("room full");
                socket.emit(
                    'error',
                    'room full'
                )
            }
            else {
                socket.join(roomID);

                // logger.info("state on room join", state);

                // await GameModel.updateOne({ roomID: roomID }, {
                //     $push: {
                //         players: {
                //             username: state.username,
                //             socketID: socket.id,
                //             userId: playerId
                //         }
                //     }
                // })

                this.rooms.filter(room => room.roomID == roomID)[0].players.push({
                    username: state.username,
                    socketID: socket.id,
                    avatar: state.avatar,
                    userId: playerId
                })

                const currentGameState = this.rooms.filter(room => room.roomID == roomID)[0].state;

                // logger.info("user joined game, current state:", currentGameState);

                socket.emit('joined_game', currentGameState);

                const playerOneInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID != socket.id);
                const playerTwoInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID == socket.id);

                if (!playerOneInfo || !playerTwoInfo) {
                    logger.info("cant get info");

                    return
                }

                // logger.info("players: ", playerOneInfo, playerTwoInfo)

                // playerOneInfo = playerOneInfo.map(info => {return {username: info.username, avatar: info.avatar}})
                // playerTwoInfo = playerTwoInfo.map(info => {return {username: info.username, avatar: info.avatar}})
                // playerOneInfo.socketID = undefined;
                // playerTwoInfo.socketID = undefined;

                logger.info("joined game room, starting game...");

                chessNameSpace.to(roomID).emit('start_game', playerOneInfo, playerTwoInfo);

                // logger.info("sending info to main server");

                // const lobbyID = await MainServerLayer.getLobbyID(roomID);

                // await MainServerLayer.startGame(lobbyID);

                // logger.info("done sending info to main server");
            }
        }
        else {
            logger.info("game room does not exist, creating...");

            this.createGame(socket, data, state);
        }
    }
}