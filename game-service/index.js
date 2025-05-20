// import "./instrument.js"

// import * as Sentry from "@sentry/node"

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from "dotenv";
import mongoose from 'mongoose';
dotenv.config();

import cors from "cors";
import fs, { readFileSync } from "fs";

import path from "path"
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import Ludo from './ludo/Ludo.js';
import Whot from './whot/Whot.js';
import Chess from './chess/Chess.js';
import Snooker from "./snooker/Snooker.js"
import Scrabble from './scrabble/Scrabble.js';

import LOBBY from "./models/lobby.model.js"
import GAME from "./models/game.model.js"
import MainServerLayer from './MainServerLayer.js';
import ErrorModel from './models/error.model.js';
import { logger, logtail } from './config/winston.config.js';
import MobileLayer from './MobileLayer.js';
// import WaitingRoomManager from './WaitingRoomManager.js';

import { URL as fileURL } from 'url';
import Tournament from './Tournament.js';
import { pinoLogger } from './config/pino.config.js';
import { gameSessionManager } from './GameSessionManager.js';
import { emitTimeRemaining } from './gameUtils.js';
import ACTIVEUSER from './models/active.model.js';
import SnookerNamespace from './games/Snooker/SnookerNamespace.js';

const scrabbleDict = JSON.parse(readFileSync(new fileURL("./games/Scrabble/words_dictionary.json", import.meta.url), "utf-8"));

const app = express();

// Enable CORS
app.use(cors());

app.use(pinoLogger);

const server = createServer(app);

const PORT = process.env.PORT || 5657;

const io = new Server(server, {
    cors: {
        origin: "*"
    },
});

let active = [
    {
        userID: '',
        socketID: ''
    }
]

active.splice(0);

let rooms = [
    {
        gameID: '',
        roomID: ''
    }
]

rooms.splice(0);

// const TournamentWaitingRoom = new WaitingRoomManager(io, active)

// function sentryLogActive() {
//     // Sentry.setContext("active_users", active);

//     // Sentry.captureMessage("active users");

//     Sentry.captureEvent({
//         message: "active users",
//         level: "info",
//         extra: active
//     });
// }

/**
 * @typedef {Object} GameData
 * @property {string} gameId - The unique identifier for the game.
 * @property {string} playerId - The unique identifier for the player.
 * @property {string} opponentId - The unique identifier for the opponent.
 * @property {string} stakeAmount - The amount staked in the game.
 * @property {string} tournamentId - The unique identifier for tournaments.
 * @property {string} lobbyCode - The unique lobby code for the game.
 * @property {string} gameName - The name of the game.
 */

/** @type {GameData[]} */
let newRooms = [
    {
        gameId: '',
        playerId: '',
        opponentId: '',
        stakeAmount: '',
        tournamentId: '',
        lobbyCode: '',
        gameName: '',
        socketId: ''
    }
]

newRooms.splice(0);

async function handleError(error) {
    await ErrorModel.create({ error: error.stack })
}

io.on('connection', (socket) => {
    logger.info("user connected to general namespace");
    const userId = socket.handshake.query.userId || socket.handshake.auth.userId;

    logger.info("details", { details: socket.handshake.query });

    if (userId) {
        (async () => {
            try {
                // Update or create atomically
                await ACTIVEUSER.updateOne(
                    { userID: userId },
                    { socketID: socket.id, userID: userId },
                    { upsert: true }
                );

                // Update in-memory list
                const existing = active.find(p => p.userID === userId);

                if (existing) {
                    existing.socketID = socket.id;
                }
                else {
                    active.push({ socketID: socket.id, userID: userId });
                }
            }
            catch (error) {
                logger.error(error)
                logtail.flush();
            }
        })()
    }


    io.emit('get_active', active);

    logger.info(active);
    // sentryLogActive();

    socket.on('disconnect', (_) => {
        try {
            logger.info("user disconnected from general namespace", { socketId: socket.id });

            active = active.filter(obj => obj.socketID != socket.id);

            (async () => {
                try {
                    await ACTIVEUSER.deleteOne({ socketID: socket.id });
                }
                catch (error) {
                    logger.error(error)
                }
            })()

            logger.info(active);
            // sentryLogActive();

            io.emit('get_active', active);

            logtail.flush();
        }
        catch (error) {
            // Sentry.captureException(error);
            handleError(error);
        }
    })

    // socket.on('join-tournament-waiting-room', async (playerId, lobbyCode) => {        
    //     await TournamentWaitingRoom.joinWaitingRoom(socket, playerId, lobbyCode);

    //     logger.info("player joined tournament waiting room");
    // })

    // socket.on('leave-tournament-waiting-room', async (playerId, lobbyCode) => {        
    //     await TournamentWaitingRoom.leaveWaitingRoom(playerId, lobbyCode);

    //     logger.info("player left tournament waiting room");
    // })

    // FOR MOBILE GAME END

    // interface GameResult {
    //     winner: string;
    //     loser: string;
    // }

    socket.on("joinGame", /** @param {GameData} data */ async (data) => {
        try {
            logger.info("request to join game", data);

            const { gameId, gameName, lobbyCode, opponentId, playerId, stakeAmount, tournamentId } = data;

            const lobby = await LOBBY.findOne({ code: lobbyCode });

            const newGameId = lobby?.gameId;

            const game = await GAME.findById(newGameId);

            if (!game) {
                logger.warn("no game found");
            }

            const dataPushed = {
                gameId,
                playerId,
                opponentId,
                stakeAmount,
                tournamentId,
                lobbyCode,
                gameName: game.name,
                socketId: socket.id
            }

            logger.info("data pushed", { dataPushed })

            newRooms.push(dataPushed);

            logger.info("newrooms after push", { newRooms })

            // socket.emit("game-message-channel", "init-game", {gameId, playerId, opponentId, stakeAmount, tournamentId, gameName: game.name});
        }
        catch (error) {
            handleError(error);
        }
    })

    socket.on('lobby-created', (userID) => {
        try {
            const activeUser = active.find(activeUser => activeUser.socketID == socket.id);

            activeUser.userID = userID;

            logger.info("updated active", active);

            io.emit('get_active', active);
        }
        catch (error) {
            // Sentry.captureException(error);
            handleError(error);
        }
    })

    socket.on('lobby-joined', async (userID, lobbyCode, cb) => {
        try {
            const activeUser = active.find(activeUser => activeUser.socketID == socket.id);

            activeUser.userID = userID;

            logger.info("updated active", active);

            io.emit('get_active', active);

            const lobby = await LOBBY.findOne({ code: lobbyCode });

            const creatorID = lobby.toObject().creatorId;

            const gameID = lobby.toObject().gameId;

            const game = await GAME.findById(gameID);

            const gameName = game.toObject().name;

            const opponentToNotify = active.find(activeUser => {
                logger.info(activeUser.userID, creatorID.toString());

                return activeUser.userID == creatorID.toString();
            });

            if (opponentToNotify) {
                io.to(opponentToNotify.socketID).emit('opponent-joined-lobby', creatorID, gameName, lobbyCode);

                if (cb != undefined) {
                    cb({
                        gameName: gameName
                    })
                }

            }
        }
        catch (error) {
            // Sentry.captureException(error);
            handleError(error);
        }
    })

    socket.on('game-message-channel', async (messageName, data) => {
        try {
            if (messageName == "photon-id") {
                logger.info(data);

                // Sentry.captureMessage(`game-message-channel: ${messageName} = ${data}`);

                /* const errorModel = new ErrorModel({
                    error: data
                });
        
                await errorModel.save(); */
            }
            if (messageName == "init-game") {
                logger.info(data);

                const room = {
                    gameId: '1234',
                    playerId: '8900',
                    opponentId: '3821',
                    stakeAmount: '1000',
                    tournamentId: '0932321',
                    lobbyId: "9392372937823",
                    lobbyCode: "2187232",
                    gameName: "Whot"
                }

                const errorModel = new ErrorModel({
                    error: JSON.stringify(room)
                });

                await errorModel.save();

                socket.broadcast.emit("game-message-channel", "init-game", room);
            }
        }
        catch (error) {
            // Sentry.captureException(error);
            handleError(error);
        }
    })

    socket.on('created', (gameID, userID, roomID) => {
        try {
            logger.info("lobby created");

            rooms.push({
                gameID: gameID,
                roomID: roomID
            })

            socket.broadcast.to(userID).emit('created', gameID, userID, roomID);
        }
        catch (error) {
            // Sentry.captureException(error);
            handleError(error);
        }
    })

    logtail.flush();
})

const ludoNamespace = io.of("/ludo");

const ludoRooms = [
    {
        roomID: 'main',
        tournamentId: '',
        setup: {
            value: false,
            playersList: [],
            currentPlayer: "",
            roomID: ''
        },
        players: []
    }
];

/**@type {Map<string, NodeJS.Timeout>} */
const intervals = new Map()

const timePerPlayer = process.env.NODE_ENV == "production" ? 1000 * 30 : 1000 * 1000;

ludoNamespace.on('connection', socket => {
    logger.info('a user connected to ludo server');


    socket.on('disconnect', () => {
        logger.info("user disconnected from ludo", socket.id);

        const room = ludoRooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

        logger.info(room);
        if (!room) return;

        const interval = intervals.get(room.roomID);

        if (interval) {
            clearInterval(interval);
            intervals.delete(room.roomID);
        }

        const g = gameSessionManager.getGame(room.roomID);

        if (g) {
            g.cancelTimer();
            logger.info("cancelled game timer", { roomID: room.roomID })
        }

        io.emit('remove', 'ludo', room.roomID);
    })

    socket.on("dice_roll", ({ roomID, num, isLocked, lastRolledBy }) => {
        logger.info("recieved dice roll", roomID, num, isLocked, lastRolledBy);

        if (ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
            logger.info("dice rolled", num, isLocked, lastRolledBy);

            socket.broadcast.to(roomID).emit("dice_roll", { num, isLocked, lastRolledBy })

            resetTimer(roomID);
        }
        else {
            logger.info("no room found", roomID, ludoRooms)
        }
    })

    socket.on("coin_played", (roomID, index) => {
        logger.info("coin played", roomID, index)
        // logger.info(num, isLocked, lastRolledBy);
        if (ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
            logger.info("coin played");

            socket.broadcast.to(roomID).emit("coin_played", index);

            resetTimer(roomID);
        }
        else {
            logger.info("no room found", roomID, ludoRooms)
        }
    })

    function resetTimer(roomID) {
        const game = gameSessionManager.getGame(roomID);

        if (!game) {
            logger.warn("no game found to reset timer", { roomID });

            return;
        }

        game.cancelTimer();

        game.startTimer();
    }

    socket.on("player_won", async (roomID) => {
        Ludo.declareWinner(roomID, socket.id);

        const currentRoom = ludoRooms.filter(room => room.roomID == roomID)[0];

        const winner = currentRoom.players.find(player => player.socketID == socket.id);
        const loser = currentRoom.players.find(player => player.socketID != socket.id);

        socket.to(loser.socketID).emit("lost")

        logger.info(`player won ludo: ${winner.userId}`);

        const interval = intervals.get(roomID);

        if (interval) {
            clearInterval(interval);
            intervals.delete(roomID);
        }

        const g = gameSessionManager.getGame(roomID);

        if (g) {
            g.cancelTimer();
            logger.info("cancelled game timer", { roomID })
        }

        const winnerId = winner.userId;
        const loserId = loser.userId;

        MobileLayer.sendGameWon(io, newRooms, winnerId, loserId, roomID);

        // const winnerData = await USER.findOne({username: winner.username})

        // const winnerId = winnerData.toObject()._id

        if (currentRoom.tournamentId) {
            await MainServerLayer.wonTournamentGame(currentRoom.tournamentId, winnerId, currentRoom.roomID)
        }
        else {
            const lobbyId = await MainServerLayer.getLobbyID(roomID);

            await MainServerLayer.wonGame(lobbyId, winnerId);
        }
    })

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

    socket.on("create_room", async (_not_roomID, setup, username, avatar, data) => {
        logger.info("user wanting to enter ludo", data);

        const { gameId, gameName, lobbyCode, opponentId, playerId, stakeAmount, tournamentId } = data

        const roomID = lobbyCode;

        logger.info("roomID: ", roomID);

        logger.info("data: ", { ...data })


        if (ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
            logger.info("room found");

            socket.join(roomID);

            const currentRoomObject = ludoRooms.filter(roomObject => roomObject.roomID == roomID)[0];

            logger.info("room found: ", currentRoomObject);

            currentRoomObject.players.push({
                username: username,
                socketID: socket.id,
                avatar: avatar,
                userId: playerId
            })

            socket.emit("already_created", currentRoomObject.setup);

            Ludo.addPlayerToDB(roomID, socket.id, username, playerId);

            let playerOneInfo = currentRoomObject.players[0];
            let playerTwoInfo = currentRoomObject.players[1];

            logger.info("players infos", playerOneInfo, playerTwoInfo)

            // playerOneInfo.socketID = undefined;
            // playerTwoInfo.socketID = undefined;

            ludoNamespace.to(roomID).emit('start_game', playerOneInfo, playerTwoInfo)

            logger.info("starting game");

            const game = gameSessionManager.getGame(roomID);

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

                emitTimeRemaining(ludoNamespace, roomID, game);
            }, 1000)

            interval.unref();

            intervals.set(roomID, interval);

            if (currentRoomObject.tournamentId) {
                await MainServerLayer.startTournamentGame(currentRoomObject.tournamentId, currentRoomObject.roomID);
            }
            else {
                const lobbyID = await MainServerLayer.getLobbyID(roomID);

                await MainServerLayer.startGame(lobbyID);
            }

            // const lobbyID = await MainServerLayer.getLobbyID(roomID);

            // await MainServerLayer.startGame(lobbyID);

            logger.info("done sending info to main server");
        }
        else {
            // let roomID = lobbyCode;

            logger.info("creating room", { roomID });

            socket.join(roomID);

            logger.info(roomID);

            Ludo.addRoom(roomID, setup, ludoRooms, socket.id, username, avatar, playerId, tournamentId);

            Ludo.addPlayerToDB(roomID, socket.id, username, playerId);

            socket.emit('created_room');

            logger.info("room created");

            const createdGame = gameSessionManager.createGame(lobbyCode);

            if (!createdGame) {
                logger.warn("couldnt create game with game session manager", { lobbyCode });

                return;
            }

            createdGame.createTimer(timePerPlayer, () => {
                logger.info("timer details", { roomID })
                elapsedTimer(roomID, ludoNamespace)
            })

            logger.info("created game timer", { lobbyCode })

            logger.info("created game for game session", { lobbyCode })

            return;
        }
    })

    function elapsedTimer(roomID, namespace) {
        logger.info("timer has elapsed", { roomID })
        // SWITCH TURN
        const currentRoom = ludoRooms.filter(room => room.roomID == roomID)[0];

        logger.info("current room for turn played", { roomID });

        if (!currentRoom) {
            logger.warn("no current room on elapsed timer")

            const interval = intervals.get(roomID);

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

        game.createTimer(timePerPlayer, () => elapsedTimer(roomID, namespace));

        logger.info("new timer created")

        game.startTimer();
    }

    // socket.on("join_room", (roomID) => {
    //     if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
    //         logger.info("room found");

    //         socket.join(roomID);

    //         const currentRoomObject = ludoRooms.filter(roomObject => roomObject.roomID == roomID)[0];

    //         currentRoomObject.players.push({
    //             username: '',
    //             socketID: socket.id
    //         })

    //         socket.emit("already_created", currentRoomObject.setup);

    //         Ludo.addPlayerToDB(roomID, socket.id);
    //     }
    //     else {
    //         logger.info("sorry no room");
    //         // socket.join(roomID);

    //         // Ludo.addRoom(roomID, ludoRooms);
    //     }
    // })
})

const wordNamespace = io.of('/word')

const games = {};
const letterPool = {
    'A': { count: 9, value: 1 },
    'B': { count: 2, value: 3 },
    'C': { count: 2, value: 3 },
    'D': { count: 4, value: 2 },
    'E': { count: 12, value: 1 },
    'I': { count: 9, value: 1 },
    'L': { count: 4, value: 1 },
    'M': { count: 2, value: 3 },
    'N': { count: 6, value: 1 },
    'O': { count: 8, value: 1 },
    'P': { count: 2, value: 3 },
    'R': { count: 6, value: 1 },
    'S': { count: 4, value: 1 },
    'T': { count: 6, value: 1 },
    'U': { count: 4, value: 1 },
    'V': { count: 2, value: 4 },
    'W': { count: 2, value: 4 },
    'X': { count: 1, value: 8 },
    'Y': { count: 2, value: 4 },
    'Z': { count: 1, value: 10 },
    'F': { count: 2, value: 4 },
    'G': { count: 3, value: 2 },
    'H': { count: 2, value: 4 },
    'J': { count: 1, value: 8 },
    'K': { count: 1, value: 5 },
    'Q': { count: 1, value: 10 }
};

// Generate letter pool
function generateLetterPool() {
    let pool = [];
    for (const [letter, info] of Object.entries(letterPool)) {
        for (let i = 0; i < info.count; i++) {
            pool.push({ letter, value: info.value });
        }
    }
    return pool;
}

// Shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Deal 7 random letters to a player
function dealLetters(gameId, playerId, count = 7) {
    const game = games[gameId];
    if (!game) return [];

    let letters = [];
    for (let i = 0; i < count; i++) {
        if (game.letterPool.length > 0) {
            const letterObj = game.letterPool.pop();
            letters.push(letterObj);
        }
    }

    return letters;
}

/**
 * Create a new game
 * @param {string} gameId 
 * @returns {Game}
 */
function createGame(gameId, tournamentId = null) {
    games[gameId] = {
        /**@type {Player} */
        players: {},
        letterPool: shuffleArray(generateLetterPool()),
        active: false,
        timeRemaining: 120,
        timer: null,
        usedWords: [],
        lobbyCode: null,
        tournamentId: tournamentId
    };
    return games[gameId];
}

/**
 * @typedef {Object} Tile
 * @property {string} letter - The letter on the tile.
 * @property {number} value - The point value of the tile.
 */

/**
 * @typedef {Object} WordScore
 * @property {string} word - The word played by the player.
 * @property {number} score - The score for the word.
 */

/**
 * @typedef {Object} Player
 * @property {string} id - The unique identifier for the player session.
 * @property {string} userId - The unique identifier of the user.
 * @property {string} name - The player's display name.
 * @property {Array<Tile>} rack - The set of letter tiles the player currently has.
 * @property {number} score - The player's total score.
 * @property {Array<WordScore>} words - The words the player has played and their scores.
 * @property {boolean} disconnected - Whether the player is disconnected.
 * @property {boolean} avatar
 */

/**
 * @typedef {Object} Game
 * @property {Object.<string, Player>} players - A dictionary of players, indexed by their player IDs.
 * @property {Array<Tile>} letterPool - The pool of available letter tiles.
 * @property {boolean} active - Whether the game is currently active.
 * @property {number} timeRemaining - Time left in the game (in seconds).
 * @property {NodeJS.Timeout} timer - The game timer object.
 * @property {Array<string> } usedWords - List of words that have already been played.
 * @property {string|null} lobbyCode - The code for joining the game, or null if not set.
 */

/**
 * @type {Record<string, Player>}
 */
const persistStore = {}


// Convert object keys to a Set, filtering out words shorter than 3 letters
const scrabbleDictionary = new Set(Object.keys(scrabbleDict).filter(word => word.length > 2));

/**
 * 
 * @param {string} word 
 * @returns 
 */
function isValidWord(word) {
    return scrabbleDictionary.has(word.toLowerCase());
}

/**
 * Creates a frequency map of available letters.
 * @param {Array<{ letter: string, value: number }>} letters - Array of letter objects with their value.
 * @returns {Object} A frequency map of available letters (e.g., { A: 2, P: 1, L: 1 }).
 */
function getLetterFrequency(letters) {
    const freq = {};
    for (const letterObj of letters) {
        const letter = letterObj.letter.toUpperCase();
        freq[letter] = (freq[letter] || 0) + 1;
    }
    return freq;
}

/**
 * Checks if a word can be formed using the available letter frequencies.
 * @param {string} word - The word to check.
 * @param {Object} availableFreq - A frequency map of available letters.
 * @returns {boolean} True if the word can be formed, false otherwise.
 */
function canFormWord(word, availableFreq) {
    const wordFreq = {};
    for (const char of word.toUpperCase()) {
        wordFreq[char] = (wordFreq[char] || 0) + 1;
        if (wordFreq[char] > (availableFreq[char] || 0)) {
            return false;
        }
    }
    return true;
}

/**
 * Finds up to `limit` words from the dictionary that can be formed with the given letters.
 * @param {Array<{ letter: string, value: number }>} letters - The available letters for the game round.
 * @param {Object<string, number>} dictionary - An object where keys are valid words (e.g., { "apple": 1, "plea": 1 }).
 * @param {number} [limit=10] - The maximum number of words to return.
 * @returns {string[]} An array of words that can be formed with the given letters.
 */
function generateWordsForLetters(letters, dictionary, limit = 20) {
    const availableFreq = getLetterFrequency(letters);
    const validWords = [];

    for (const word of Object.keys(dictionary)) {
        if (canFormWord(word, availableFreq) && isValidWord(word)) {
            validWords.push(word);
        }
    }

    // Shuffle valid words to introduce randomness
    for (let i = validWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validWords[i], validWords[j]] = [validWords[j], validWords[i]];
    }

    return validWords.slice(0, limit);
}

// http://localhost:5657/game?gameName=my-Word&lobbyCode=123456&playerId=21hjshdsj

// http://localhost:5657/game?gameName=Scrabble&lobbyCode=123456&playerId=39288h29x3n89exn23e2en
// http://localhost:5657/game?gameName=Scrabble&lobbyCode=123456&playerId=dsjknsdjskbd7s87ds87ds

// http://localhost:5657/game?gameName=Whot&lobbyCode=123456&playerId=39288h29x3n89exn23e2en
// http://localhost:5657/game?gameName=Whot&lobbyCode=123456&playerId=dsjknsdjskbd7s87ds87ds

// http://localhost:5657/game?gameName=Chess&lobbyCode=123456&playerId=39288h29x3n89exn23e2en
// http://localhost:5657/game?gameName=Chess&lobbyCode=123456&playerId=dsjknsdjskbd7s87ds87ds
// http://localhost:5173/game/Chess/?gameName=Chess&lobbyCode=123456&playerId=39288h29x3n89exn23e2en
// http://localhost:5173/game/Chess/?gameName=Chess&lobbyCode=123456&playerId=dsjknsdjskbd7s87ds87ds

// http://localhost:5657/game?gameName=Ludo&lobbyCode=123456&playerId=677ac0f552d67df13f494f81
// http://localhost:5657/game?gameName=Ludo&lobbyCode=123456&playerId=664a055c8abcfe371430a5d1

// http://localhost:5173/game/Ludo?gameName=Ludo&lobbyCode=123456&playerId=677ac0f552d67df13f494f81
// http://localhost:5173/game/Ludo?gameName=Ludo&lobbyCode=123456&playerId=664a055c8abcfe371430a5d1

// http://localhost:5173/?gameName=Snooker&lobbyCode=123456&playerId=677ac0f552d67df13f494f81
// http://localhost:5173/?gameName=Snooker&lobbyCode=123456&playerId=664a055c8abcfe371430a5d1

// http://localhost:5657/game?gameName=Snooker&lobbyCode=123456&playerId=677ac0f552d67df13f494f81
// http://localhost:5657/game?gameName=Snooker&lobbyCode=123456&playerId=664a055c8abcfe371430a5d1




// https://game-service-uny2.onrender.com/game?gameName=Scrabble&lobbyCode=m99nko&playerId=67d54787f7425f237bd6acd1

wordNamespace.on("connection", (socket) => {
    logger.info('New client connected to scrabble:', { socketId: socket.id });

    // Create or join a game
    socket.on('joinGame', async ({ gameId, playerName, playerId: playerID, opponentId, stakeAmount, tournamentId, lobbyCode, gameName, avatar }) => {
        logger.info("client emitted joinGame", { gameId, id: socket.id, playerName });

        let game = games[gameId];

        if (!game) {
            logger.info("no game, creating...");

            game = createGame(gameId, tournamentId);
        }

        if (persistStore[playerID]) {
            logger.info(`Restoring player ${playerID} to game ${gameId}`);

            const persistPlayer = persistStore[playerID]

            logger.info(`Player data: `, { persistPlayer });

            delete game.players[persistPlayer.id];

            persistPlayer.disconnected = false;

            game.players[socket.id] = persistPlayer;

            game.players[socket.id].id = socket.id;

            delete persistStore[playerID];

            logger.info("restored data: ", { data: game.players[socket.id] });

            socket.join(gameId);

            logger.info("emitting reconnected");

            wordNamespace.to(socket.id).emit('reconnected', {
                gameId,
                playerId: socket.id,
                rack: game.players[socket.id].rack,
                gameState: {
                    players: Object.values(game.players).map(p => ({
                        id: p.id,
                        name: p.name,
                        score: p.score,
                        wordCount: p.words.length
                    })),
                    active: game.active,
                    timeRemaining: game.timeRemaining
                }
            });

            return;
        }

        // Check if game is full
        if (Object.keys(game.players).length >= 2) {
            logger.info("game is full");

            socket.emit('gameError', { message: 'Game is full' });
            return;
        }

        // Check if game already started
        if (game.active) {
            logger.info("game is active");

            socket.emit('gameError', { message: 'Game already in progress' });
            return;
        }

        // Add player to game
        const playerId = socket.id;

        game.players[playerId] = {
            id: playerId,
            userId: playerID,
            name: playerName,
            avatar: avatar,
            rack: [],
            score: 0,
            words: [],
            disconnected: false
        };

        // Join socket to game room
        socket.join(gameId);

        logger.info("joined game room");

        // Deal initial letters
        game.players[playerId].rack = dealLetters(gameId, playerId);

        // Notify player
        socket.emit('gameJoined', {
            gameId,
            playerId,
            name: playerName,
            rack: game.players[playerId].rack
        });

        logger.info("emitted gameJoined event");

        // Update all players in the game
        wordNamespace.to(gameId).emit('gameState', {
            players: Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                wordCount: p.words.length
            })),
            active: game.active,
            timeRemaining: game.timeRemaining
        });

        logger.info("updated game state");

        // Start game if we have 2 players
        if (Object.keys(game.players).length === 2 && !game.active) {
            startGame(gameId);
            logger.info("starting game due to 2 players");

            if (tournamentId) {
                await MainServerLayer.startTournamentGame(tournamentId, gameId);
            }
            else {
                const lobbyID = await MainServerLayer.getLobbyID(gameId);

                await MainServerLayer.startGame(lobbyID);
            }

        }
    });

    /**
     * @typedef {Object} SubmittedWord
     * @property {string} gameId
     * @property {string} word
     */

    // Submit a word
    socket.on('submitWord', /** @param {SubmittedWord} */({ gameId, word }) => {
        logger.info("client submitted word", { gameId, word });

        const game = games[gameId];
        if (!game || !game.active) {
            logger.info("no game or game not active");
            return
        };

        const playerId = socket.id;
        const player = game.players[playerId];
        if (!player) {
            logger.info("no player");

            return
        };

        // Check if word is valid (not already used and at least 2 letters)
        if (word.length < 2 || game.usedWords.includes(word.toLowerCase())) {
            logger.info("client word rejected ");

            socket.emit('wordRejected', { word, reason: 'Word is too short or already used' });
            return;
        }

        if (!isValidWord(word)) {
            logger.info("client word rejected ");

            socket.emit('wordRejected', { word, reason: 'Word is not a valid word' });
            return;
        }

        // In a real game, you would verify against a dictionary here

        // Calculate word score
        let wordScore = 0;
        for (const letter of word) {
            const letterInfo = letterPool[letter.toUpperCase()];
            if (letterInfo) {
                wordScore += letterInfo.value;
            }
        }

        // Update player score
        player.score += wordScore;
        player.words.push({ word, score: wordScore });
        game.usedWords.push(word.toLowerCase());

        // Notify player of word acceptance
        socket.emit('wordAccepted', {
            word,
            score: wordScore,
            totalScore: player.score
        });

        // Update all players in the game
        wordNamespace.to(gameId).emit('gameState', {
            players: Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                wordCount: p.words.length
            })),
            active: game.active,
            timeRemaining: game.timeRemaining,
            lastWord: {
                playerId: playerId,
                playerName: player.name,
                word: word,
                score: wordScore
            }
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        logger.info('Client disconnected:', { socketId: socket.id });

        // Find game with this player
        Object.keys(games).forEach(gameId => {
            const game = games[gameId];
            if (game.players[socket.id] && game.active) {
                // Remove player
                // delete game.players[socket.id];
                game.players[socket.id].disconnected = true;

                const pl = game.players[socket.id]

                persistStore[pl.userId] = { ...pl }

                logger.info("saved to persist store: ", persistStore);
            }
        });
    });
})

// Start a game
function startGame(gameId) {
    const game = games[gameId];
    if (!game || game.active) return;

    game.active = true;
    game.timeRemaining = process.env.NODE_ENV == "production" ? 30 : 30; // 2 minutes

    // Start timer
    game.timer = setInterval(() => {
        game.timeRemaining--;

        // Update clients with time
        wordNamespace.to(gameId).emit('timeUpdate', { timeRemaining: game.timeRemaining });

        if (game.timeRemaining <= 0) {
            endGame(gameId, 'Time expired');
        }
    }, 1000);

    // Notify players that game started
    wordNamespace.to(gameId).emit('gameStarted', {
        timeRemaining: game.timeRemaining,
        players: Object.values(game.players).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
        }))
    });
}

/**
 * @typedef WordGameResult 
 * @property {Array<Player>} players
 * @property {string} winnerId
 */

// End a game
async function endGame(gameId, reason) {
    try {
        const game = games[gameId];
        if (!game) return;

        Object.values(game.players).forEach(player => {
            const playerUserId = player.userId;

            delete persistStore[playerUserId];
        })

        console.log("deleted players from persist store after game end");

        // Stop timer
        if (game.timer) {
            clearInterval(game.timer);
            game.timer = null;
        }

        logger.info("game ended");

        game.active = false;

        // Determine winner
        let winner = null;
        let loser = null;
        let highestScore = -1;

        let tiedPlayers = [];

        // Step 1: Find all players with the highest score
        Object.values(game.players).forEach(player => {
            if (player.score > highestScore) {
                highestScore = player.score;
                tiedPlayers = [player]; // reset list
            }
            else if (player.score === highestScore) {
                tiedPlayers.push(player); // add to list of tied players
            }
        });

        if (tiedPlayers.length === 1) {
            winner = tiedPlayers[0];
        } else {
            winner = tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)];
        }

        // Object.values(game.players).forEach(player => {
        //     if (player.score > highestScore) {
        //         highestScore = player.score;
        //         winner = player;
        //     } else if (player.score === highestScore) {
        //         winner = game.players[Math.floor(Math.random() * 2)]; // Tie
        //     }
        // });

        logger.info("winner", { winner });

        // Notify players of game end
        wordNamespace.to(gameId).emit('gameEnded', {
            reason,
            winner: winner ? {
                id: winner.id,
                name: winner.name,
                score: winner.score,
                avatar: winner.avatar
            } : null,
            isTie: winner === null && highestScore > -1,
            players: Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                words: p.words,
                avatar: p.avatar
            }))
        });

        wordNamespace.to(winner.id).emit('you-won')

        Object.values(game.players).forEach(player => {
            if (player.id != winner.id) {
                wordNamespace.to(player.id).emit("you-lost")
                loser = player;
            }
        })

        const tournamentId = game.tournamentId;

        // delete games[gameId];

        logger.info("loser", { loser });

        const winnerId = winner.userId;
        const loserId = loser.userId;

        MobileLayer.sendGameWon(io, newRooms, winnerId, loserId, gameId);

        if (tournamentId) {
            await MainServerLayer.wonTournamentGame(tournamentId, winnerId, gameId)
        }
        else {
            const lobbyId = await MainServerLayer.getLobbyID(gameId);

            await MainServerLayer.wonGame(lobbyId, winnerId);
        }

        delete games[gameId];
    }
    catch (error) {
        logger.warn(`error occured while ending scrabble game, gameId: ${gameId}`);

        logger.error(error);
    }
}

const whotNamespace = io.of("/whot");

Whot.activate(io, whotNamespace, newRooms);

const chessNameSpace = io.of("/chess");

Chess.activate(io, chessNameSpace, newRooms);

const snookerNamespace = io.of("/snooker");

const snookerServerNamespace = new SnookerNamespace(snookerNamespace);

snookerServerNamespace.activate(io, newRooms);

// Snooker.activate(io, snookerNameSpace, newRooms);

// const scrabbleNameSpace = io.of("/scrabble");

// Scrabble.activate(io, scrabbleNameSpace);

const tournamentNamespace = io.of("/tournament");

// const TournamentWaitingRoom = new WaitingRoomManager(tournamentNamespace, active);

Tournament.activate(io, tournamentNamespace, newRooms);

const URL = process.env.MONGO_URL;

// Get valid games (only directories with both Build folder and index.html)
const getValidGames = () => {
    const gamesPath = path.join(__dirname, 'games');
    if (!fs.existsSync(gamesPath)) {
        logger.info('Games directory not found');
        return [];
    }

    return fs.readdirSync(gamesPath, { withFileTypes: true })
        .filter(dirent => {
            if (!dirent.isDirectory()) return false;

            const gamePath = path.join(gamesPath, dirent.name);
            const hasBuild = fs.existsSync(path.join(gamePath, 'Build'));
            const hasIndex = fs.existsSync(path.join(gamePath, 'index.html'));

            return hasBuild && hasIndex;
        })
        .map(dirent => dirent.name);
};

// // Serve static files directly from game directories
// app.use('/games/:gameName/Build', (req, res, next) => {
//     const gameName = req.params.gameName;
//     const buildPath = path.join(__dirname, 'games', gameName, 'Build');

//     // Handle gzipped content
//     if (req.url.endsWith('.gz')) {
//         res.set('Content-Encoding', 'gzip');
//     }

//     express.static(buildPath)(req, res, next);
// });

// app.use('/games/:gameName/TemplateData', (req, res, next) => {
//     const gameName = req.params.gameName;
//     const templatePath = path.join(__dirname, 'games', gameName, 'TemplateData');
//     express.static(templatePath)(req, res, next);
// });

// app.use('/game', express.static(__dirname + "/games/Whot", {redirect: false}))

// Serve specific game assets with the correct path mapping
// app.use('/game/assets', express.static(path.join(__dirname, "/games/Whot/assets")));

// Serve other game files directly from the game directory
app.use('/game/assets', express.static(path.join(__dirname, "/games/my-Whot/assets")));
app.use('/game/my-Chess/assets', express.static(path.join(__dirname, "/games/my-Chess/assets")));
app.use('/game/my-Ludo/assets', express.static(path.join(__dirname, "/games/my-Ludo/assets")));
app.use('/game/my-Word', express.static(path.join(__dirname, "/games/my-Word")));
app.use('/game/my-Scrabble', express.static(path.join(__dirname, "/games/my-Scrabble")));

app.use('/game/Whot/assets', express.static(path.join(__dirname, "/games/Whot/assets")));
app.use('/game/Chess/assets', express.static(path.join(__dirname, "/games/Chess/assets")));
app.use('/game/Ludo/assets', express.static(path.join(__dirname, "/games/Ludo/assets")));
app.use('/game/Word', express.static(path.join(__dirname, "/games/Word")));
app.use('/game/Scrabble', express.static(path.join(__dirname, "/games/Scrabble")));
app.use('/game/Snooker', express.static(path.join(__dirname, "/games/Snooker")));

// Game route handler
app.get('/game', (req, res) => {
    logger.info('Game route hit');
    logger.info('Game parameters:', req.query);

    const { gameName } = req.query;

    logger.info("gamename: ", gameName);
    // const validGames = getValidGames();
    const validGames = ["Whot"];

    const room = {
        gameId: '1234',
        playerId: '8900',
        opponentId: '3821',
        stakeAmount: '1000',
        tournamentId: '0932321',
        lobbyId: "9392372937823",
        lobbyCode: "2187232",
        gameName: gameName
    }

    // If no gameName provided, serve the first valid game
    if (!gameName) {
        const firstGame = validGames[0];
        if (!firstGame) {
            return res.status(404).send('No valid games available');
        }

        // const room = newRooms.find(room => room.playerId == req.query.playerId);

        // if(!room) {

        // }

        io.emit("game-message-channel", "init-game", room);

        const gamePath = path.join(__dirname, 'games', firstGame, 'index.html');
        logger.info('Serving default game from:', gamePath);
        return res.sendFile(gamePath);
    }

    /* // Check if requested game exists and is valid
    if (!validGames.includes(gameName)) {
        return res.status(404).send(`Game "${gameName}" not found or invalid`);
    } */

    io.emit("game-message-channel", "init-game", room);

    const gamePath = path.join(__dirname, 'games', gameName, 'index.html');
    logger.info('Serving specific game from:', gamePath);
    res.sendFile(gamePath);
});

// for cron job
app.get('/', (req, res) => {
    res.send("<h2>Welcome</h2>");
})

app.get('/user-details/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const userGameDetails = await MainServerLayer.getUserGameDetails(userId)

        if (!userGameDetails) {
            res.status(404).json({ message: "not found" })

            return;
        }

        if (!userGameDetails.avatar) {
            userGameDetails.avatar = "https://game-service-uny2.onrender.com/game/Scrabble/a1.png"
        }

        res.status(200).json({ message: "successful", userGameDetails });
    }
    catch (error) {
        logger.error(error);

        res.status(500).json({ message: "unsuccessful" });
    }
})

/* app.get("/debug-sentry", function mainHandler(req, res) {
    throw new Error("My first Sentry error!");
}); */

// The error handler must be registered before any other error middleware and after all controllers
// Sentry.setupExpressErrorHandler(app);

mongoose.connect(URL)
    .then(() => {
        server.listen(PORT, () => {
            logger.info(`server running at http://localhost:${PORT}`);

            // // Log available games and their status
            // const gamesPath = path.join(__dirname, 'games');
            // const allDirectories = fs.readdirSync(gamesPath, { withFileTypes: true })
            //     .filter(dirent => dirent.isDirectory())
            //     .map(dirent => dirent.name);

            // logger.info('\nAvailable games:');
            // allDirectories.forEach(game => {
            //     logger.info(`\n${game}:`);
            //     const buildPath = path.join(gamesPath, game, 'Build');
            //     const indexPath = path.join(gamesPath, game, 'index.html');

            //     logger.info('Build path:', buildPath);
            //     logger.info('Index path:', indexPath);
            //     logger.info('Build exists:', fs.existsSync(buildPath));
            //     logger.info('Index exists:', fs.existsSync(indexPath));

            //     if (fs.existsSync(buildPath)) {
            //         logger.info('Build contents:', fs.readdirSync(buildPath));
            //     }
            // });
        });

        process.on("SIGTERM", async () => {
            try {
                await ACTIVEUSER.deleteMany({});

                await io.close();
                logger.info("socket server closed")
                logger.info("all logs sent on graceful shutdown");
                logger.info("all logs sent on graceful shutdown");
                await logtail.flush();
            }
            catch (error) {
                logger.error("Error during flush:", error);
            }

            server.close(async () => {
                logger.info('Express server closed.');

                // Close the Mongoose connection
                await mongoose.connection.close();
                logger.info('MongoDB connection closed.');

                // Exit the process
                process.exit(0);
            });
        })

        process.on("SIGINT", async () => {
            try {
                await ACTIVEUSER.deleteMany({});

                await io.close();
                logger.info("socket server closed")
                logger.info("all logs sent on graceful shutdown");
                logger.info("all logs sent on graceful shutdown");
                await logtail.flush();
            }
            catch (error) {
                logger.error("Error during flush:", error);
            }

            server.close(async () => {

                logger.info('Express server closed.');

                // Close the Mongoose connection
                await mongoose.connection.close();
                logger.info('MongoDB connection closed.');

                // Exit the process
                process.exit(0);
            });
        })
    })
    .catch(error => {
        handleError(error);
    })