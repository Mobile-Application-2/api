import { logger } from "../config/winston.config.js";
import MainServerLayer from "../MainServerLayer.js";
import LOBBY from "../models/lobby.model.js";
import USER from "../models/user.model.js";
import GameModel from "./models/game.model.js";

export default class Chess {
    static white = 1;
    static black = 2;

    static winner = "";

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
            players: []
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
     * @param {import("socket.io").Namespace} whotNamespace - The specific namespace for the Whot game.
     * @param {Array<GameData>} mainRooms - A map of active game rooms.
     */
    static async activate(io, chessNameSpace, mainRooms) {
        chessNameSpace.on('connection', socket => {
            logger.info("user connected to chess server");
            // TODO: reconnect player to game if disconnected and game still on

            socket.once('create_game', (roomID, state) => this.createGame(socket, roomID, state))

            socket.on('join_game', (data, state) => this.joinGame(chessNameSpace, socket, data, state));

            socket.on('turn_played', (roomID, indexClicked, newPosition, callback) => {
                callback({
                    status: "ok"
                })
                logger.info("turn played", {roomID})
                this.turnPlayed(socket, roomID, indexClicked, newPosition)
            })

            socket.on('game_over', async (roomID, player_winner) => {
                await GameModel.updateOne({ roomID: roomID, 'players.socketID': socket.id }, {
                    $set: { 'players.$.winner': true }
                })

                const mainWinner = this.rooms.players.find(player => player.socketID == socket.id);
                const loser = this.rooms.players.find(player => player.socketID != socket.id);

                io.to(loser.socketID).emit("lost")

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

                if(currentRoom.tournamentId) {
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

    static async turnPlayed(socket, roomID, indexClicked, newPosition) {
        // logger.info(newState, this.rooms[0].state);
        // logger.info(newState);
        const currentRoom = this.rooms.filter(room => room.roomID == roomID)[0];

        logger.info("current room for turn played", currentRoom);

        if (currentRoom) {
            // currentRoom.state = newState;

            logger.info("sending turn played to opponent");

            socket.broadcast.emit('turn_played', indexClicked, newPosition, (err, response) => {
                if(err) {
                    logger.info("no response from client");
                    logger.info(err);
                }
                else {
                    logger.info("client responded");
                    logger.info(response);
                }
            });
        }
    }

    static async createGame(socket, data, state) {
        const roomID = data.lobbyCode;

        socket.join(roomID);

        logger.info("state on room create", state);

        const game = await GameModel.findOne({ roomID: roomID })

        if (game != null) {
            logger.info('room id exist');

            return
        }

        const gameModel = new GameModel({
            game_name: "chess",
            players: [
                {
                    username: state.username,
                    socketID: socket.id,
                    userId: data.playerId
                }
            ],
            roomID: roomID
        });

        await gameModel.save();

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

    /**
     * Activates the game logic for handling WebSocket connections.
     * 
     * @param {import("socket.io").Server} io - The main Socket.IO server instance.
     * @param {import("socket.io").Namespace} whotNamespace - The specific namespace for the Whot game.
     * @param {Array<GameData>} mainRooms - A map of active game rooms.
     */
    static async joinGame(chessNameSpace, socket, data, state) {
        const { gameId, gameName, lobbyCode, opponentId, playerId, stakeAmount, tournamentId } = data

        const roomID = lobbyCode

        const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

        // logger.info(gameRoom);

        if (gameRoom != undefined) {
            if (gameRoom.players.length > 1) {
                logger.info("room full");
                socket.emit(
                    'error',
                    'room full'
                )
            }
            else {
                socket.join(roomID);

                logger.info("state on room join", state);

                await GameModel.updateOne({ roomID: roomID }, {
                    $push: {
                        players: {
                            username: state.username,
                            socketID: socket.id,
                            userId: playerId
                        }
                    }
                })

                this.rooms.filter(room => room.roomID == roomID)[0].players.push({
                    username: state.username,
                    socketID: socket.id,
                    avatar: state.avatar,
                    userId: playerId
                })

                const currentGameState = this.rooms.filter(room => room.roomID == roomID)[0].state;

                logger.info("user joined game, current state:", currentGameState);

                socket.emit('joined_game', currentGameState);

                const playerOneInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID != socket.id);
                const playerTwoInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID == socket.id);

                if (!playerOneInfo || !playerTwoInfo) {
                    logger.info("cant get info");

                    return
                }

                logger.info("players: ", playerOneInfo, playerTwoInfo)

                // playerOneInfo = playerOneInfo.map(info => {return {username: info.username, avatar: info.avatar}})
                // playerTwoInfo = playerTwoInfo.map(info => {return {username: info.username, avatar: info.avatar}})
                // playerOneInfo.socketID = undefined;
                // playerTwoInfo.socketID = undefined;

                chessNameSpace.to(roomID).emit('start_game', playerOneInfo, playerTwoInfo);

                logger.info("sending info to main server");

                const lobbyID = await MainServerLayer.getLobbyID(roomID);

                await MainServerLayer.startGame(lobbyID);

                logger.info("done sending info to main server");
            }
        }
        else {
            this.createGame(socket, data, state);
        }

    }
}