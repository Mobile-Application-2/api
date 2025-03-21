// import "./instrument.js"

// import * as Sentry from "@sentry/node"

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from "dotenv";
import mongoose from 'mongoose';
dotenv.config();

import cors from "cors";
import fs from "fs";

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
import WaitingRoomManager from './WaitingRoomManager.js';

const app = express();

// Enable CORS
app.use(cors());

// Custom middleware to handle gzipped Unity files
const unityGzipHandler = (req, res, next) => {
    const originalUrl = req.url;
    const gzippedUrl = `${originalUrl}.gz`;
    const fullPath = path.join(__dirname, 'games/Ludo/Build', originalUrl);
    const gzippedPath = path.join(__dirname, 'games/Ludo/Build', gzippedUrl);

    logger.info('Checking paths:');
    logger.info('Original:', fullPath);
    logger.info('Gzipped:', gzippedPath);

    // Check if gzipped version exists
    if (fs.existsSync(gzippedPath)) {
        logger.info(`Found gzipped file: ${gzippedPath}`);
        res.set('Content-Encoding', 'gzip');
        
        if (originalUrl.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        } else if (originalUrl.endsWith('.wasm')) {
            res.set('Content-Type', 'application/wasm');
        } else if (originalUrl.endsWith('.data')) {
            res.set('Content-Type', 'application/octet-stream');
        }
        
        // Serve the gzipped file directly
        res.sendFile(gzippedPath);
        return;
    } else {
        logger.info(`No gzipped file found, checking original: ${fullPath}`);
        if (fs.existsSync(fullPath)) {
            logger.info(`Found original file: ${fullPath}`);
            // Let express.static handle it
            next();
        } else {
            logger.info(`File not found: ${fullPath}`);
            res.status(404).send('File not found');
        }
    }
};

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

const TournamentWaitingRoom = new WaitingRoomManager(io, active)

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
const newRooms = [
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
    await ErrorModel.create({error: error.stack})
}

io.on('connection', (socket) => {
    logger.info("user connected to general namespace");
    const userId = socket.handshake.query.userId;

    active.push({
        socketID: socket.id,
        userID: userId
    });

    io.emit('get_active', active);

    logger.info(active);
    // sentryLogActive();

    socket.on('disconnect', (_) => {
        try {
            logger.info("user disconnected from general namespace", socket.id);
    
            active = active.filter(obj => obj.socketID != socket.id);
    
            logger.info(active);
            // sentryLogActive();
    
            io.emit('get_active', active);    
        }
        catch (error) {
            // Sentry.captureException(error);
            handleError(error);
        }
    })

    socket.on('join-tournament-waiting-room', async (playerId, lobbyCode) => {        
        await TournamentWaitingRoom.joinWaitingRoom(socket, playerId, lobbyCode);

        logger.info("player joined tournament waiting room");
    })

    socket.on('leave-tournament-waiting-room', async (playerId, lobbyCode) => {        
        await TournamentWaitingRoom.leaveWaitingRoom(playerId, lobbyCode);

        logger.info("player left tournament waiting room");
    })

    // FOR MOBILE GAME END
    
    // interface GameResult {
    //     winner: string;
    //     loser: string;
    // }

    socket.on("joinGame", /** @param {GameData} data */ async (data) => {
        try {
            logger.info("request to join game", data);
            
            const {gameId, gameName, lobbyCode, opponentId, playerId, stakeAmount, tournamentId} = data;

            const game = await GAME.findById(gameId);

            if(!game) {
                logger.info("no game found");
                
                await ErrorModel.create({error: "No Game Found"});

                // return;
            }

            newRooms.push({gameId, playerId, opponentId, stakeAmount, tournamentId, gameName: game.name, lobbyCode, socketId: socket.id});

            // socket.emit("game-message-channel", "init-game", {gameId, playerId, opponentId, stakeAmount, tournamentId, gameName: game.name});
        }
        catch(error) {
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
    
            const lobby = await LOBBY.findOne({code: lobbyCode});
    
            const creatorID = lobby.toObject().creatorId;
    
            const gameID = lobby.toObject().gameId;
    
            const game = await GAME.findById(gameID);
    
            const gameName = game.toObject().name;
    
            const opponentToNotify = active.find(activeUser => {
                logger.info(activeUser.userID, creatorID.toString());
    
                return activeUser.userID == creatorID.toString();
            });
    
            if(opponentToNotify) {
                io.to(opponentToNotify.socketID).emit('opponent-joined-lobby', creatorID, gameName, lobbyCode);
    
                if(cb != undefined) {
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
            if(messageName == "photon-id") {
                logger.info(data);

                // Sentry.captureMessage(`game-message-channel: ${messageName} = ${data}`);
    
                /* const errorModel = new ErrorModel({
                    error: data
                });
        
                await errorModel.save(); */
            }
            if(messageName == "init-game") {
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

ludoNamespace.on('connection', socket => {
    logger.info('a user connected to ludo server');

    socket.on('disconnect', () => {
        logger.info("user disconnected from ludo", socket.id);

        const room = ludoRooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

        logger.info(room);
        if(!room) return;

        io.emit('remove', 'ludo', room.roomID);
    })

    socket.on("dice_roll", ({roomID, num, isLocked, lastRolledBy}) => {
        logger.info("recieved dice roll", roomID, num, isLocked, lastRolledBy);

        if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
            logger.info("dice rolled", num, isLocked, lastRolledBy);
    
            socket.broadcast.to(roomID).emit("dice_roll", {num, isLocked, lastRolledBy})
        }
        else {
            logger.info("no room found", roomID, ludoRooms)
        }
    })

    socket.on("coin_played", (roomID, index) => {
        logger.info("coin played", roomID, index)
        // logger.info(num, isLocked, lastRolledBy);
        if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
            logger.info("coin played");

            socket.broadcast.to(roomID).emit("coin_played", index);
        }
        else {
            logger.info("no room found", roomID, ludoRooms)
        }
    })

    socket.on("player_won", async (roomID) => {
        Ludo.declareWinner(roomID, socket.id);

        const currentRoom = ludoRooms.filter(room => room.roomID == roomID)[0];
        
        const winner = currentRoom.players.find(player => player.socketID == socket.id);
        const loser = currentRoom.players.find(player => player.socketID != socket.id);

        socket.to(loser.socketID).emit("lost")
        
        logger.info(`player won ludo: ${winner.userId}`);

        const winnerId = winner.userId;
        const loserId = loser.userId;

        MobileLayer.sendGameWon(io, newRooms, winnerId, loserId, roomID);

        // const winnerData = await USER.findOne({username: winner.username})

        // const winnerId = winnerData.toObject()._id

        if(currentRoom.tournamentId) {
            await MainServerLayer.wonTournamentGame(currentRoom.tournamentId, winnerId)
        }

        const lobbyId = await MainServerLayer.getLobbyID(roomID);

        await MainServerLayer.wonGame(lobbyId, winnerId);
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

    socket.on("create_room", async (_roomID, setup, username, avatar, data) => {
        logger.info("user wanting to enter ludo", data);

        const {gameId, gameName, lobbyCode, opponentId, playerId, stakeAmount, tournamentId} = data

        const roomID = lobbyCode;

        if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
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

            const lobbyID = await MainServerLayer.getLobbyID(roomID);

            await MainServerLayer.startGame(lobbyID);

            logger.info("done sending info to main server");
        }
        else {
            logger.info("creating room");
            socket.join(roomID);
    
            logger.info(roomID);
    
            Ludo.addRoom(roomID, setup, ludoRooms, socket.id, username, avatar, playerId, tournamentId);
    
            Ludo.addPlayerToDB(roomID, socket.id, username, playerId);
    
            socket.emit('created_room');

            logger.info("room created");
        }
    })

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

// Create a new game
function createGame(gameId) {
    games[gameId] = {
        players: {},
        letterPool: shuffleArray(generateLetterPool()),
        active: false,
        timeRemaining: 120,
        timer: null,
        usedWords: [],
        lobbyCode: null
    };
    return games[gameId];
}

wordNamespace.on("connection", (socket) => {
    console.log('New client connected:', socket.id);
    
    // Create or join a game
    socket.on('joinGame', async ({ gameId, playerName, playerId: playerID, opponentId, stakeAmount, tournamentId, lobbyCode, gameName }) => {
        logger.info("client emitted joinGame", {gameId, playerName});

        let game = games[gameId];

        if (!game) {
            logger.info("no game, creating...");

            game = createGame(gameId);
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
            id: socket.id,
            userId: playerID,
            name: playerName,
            rack: [],
            score: 0,
            words: []
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

            const lobbyID = await MainServerLayer.getLobbyID(gameId);

            await MainServerLayer.startGame(lobbyID);
        }
    });
    
    // Submit a word
    socket.on('submitWord', ({ gameId, word }) => {
        logger.info("client submitted word", {gameId, word});

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
        
        // In a real game, you would verify against a dictwordNamespacenary here
        
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
        logger.info('Client disconnected:', {sockerId: socket.id});
        
        // Find game with this player
        Object.keys(games).forEach(gameId => {
            const game = games[gameId];
            if (game.players[socket.id]) {
                // Remove player
                delete game.players[socket.id];
                
                // End game if in progress
                if (game.active) {
                    endGame(gameId, 'Player disconnected');
                }
                
                // Remove game if empty
                if (Object.keys(game.players).length === 0) {
                    delete games[gameId];
                } else {
                    // Notify remaining players
                    wordNamespace.to(gameId).emit('playerLeft', { playerId: socket.id });
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
                }
            }
        });
    });
})

// Start a game
function startGame(gameId) {
    const game = games[gameId];
    if (!game || game.active) return;
    
    game.active = true;
    game.timeRemaining = process.env.NODE_ENV == "production" ? 120 : 30; // 2 minutes
    
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

// End a game
async function endGame(gameId, reason) {
    const game = games[gameId];
    if (!game) return;
    
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
    
    Object.values(game.players).forEach(player => {
        if (player.score > highestScore) {
            highestScore = player.score;
            winner = player;
        } else if (player.score === highestScore) {
            winner = null; // Tie
        }
    });

    logger.info("winner", {winner});
    
    // Notify players of game end
    wordNamespace.to(gameId).emit('gameEnded', {
        reason,
        winner: winner ? {
            id: winner.id,
            name: winner.name,
            score: winner.score
        } : null,
        isTie: winner === null && highestScore > -1,
        players: Object.values(game.players).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            words: p.words
        }))
    });

    wordNamespace.to(winner.id).emit('you-won')

    Object.values(game.players).forEach(player => {
        if(player.id != winner.id) {
            wordNamespace.to(player.id).emit("you-lost")
            loser = player;
        }
    })

    logger.info("loser", {loser});

    const winnerId = winner.userId;
    const loserId = loser.userId;

    MobileLayer.sendGameWon(io, newRooms, winnerId, loserId, gameId);

    const lobbyId = await MainServerLayer.getLobbyID(gameId);

    await MainServerLayer.wonGame(lobbyId, winnerId)

    // wordNamespace.to(winner.id).emit('you-won')

    // Object.values(game.players).forEach(player => {
    //     if(player.id != winner.id) {
    //         wordNamespace.to(player.id).emit("you-lost")
    //     }
    // })
}

const whotNamespace = io.of("/whot");

Whot.activate(io, whotNamespace, newRooms);

const chessNameSpace = io.of("/chess");

Chess.activate(io, chessNameSpace, newRooms);

// const snookerNameSpace = io.of("/snooker");

// Snooker.activate(io, snookerNameSpace);

// const scrabbleNameSpace = io.of("/scrabble");

// Scrabble.activate(io, scrabbleNameSpace);

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

// Serve static files directly from game directories
app.use('/games/:gameName/Build', (req, res, next) => {
    const gameName = req.params.gameName;
    const buildPath = path.join(__dirname, 'games', gameName, 'Build');
    
    // Handle gzipped content
    if (req.url.endsWith('.gz')) {
        res.set('Content-Encoding', 'gzip');
    }
    
    express.static(buildPath)(req, res, next);
});

app.use('/games/:gameName/TemplateData', (req, res, next) => {
    const gameName = req.params.gameName;
    const templatePath = path.join(__dirname, 'games', gameName, 'TemplateData');
    express.static(templatePath)(req, res, next);
});

// app.use('/game', express.static(__dirname + "/games/Whot", {redirect: false}))

// Serve specific game assets with the correct path mapping
// app.use('/game/assets', express.static(path.join(__dirname, "/games/Whot/assets")));

// Serve other game files directly from the game directory
app.use('/game/assets', express.static(path.join(__dirname, "/games/my-Whot/assets")));
app.use('/game/my-Chess/assets', express.static(path.join(__dirname, "/games/my-Chess/assets")));
app.use('/game/my-Ludo/assets', express.static(path.join(__dirname, "/games/my-Ludo/assets")));
app.use('/game/my-Word', express.static(path.join(__dirname, "/games/my-Word")));

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
            logger.info("all logs sent on graceful shutdown");
            logger.info("all logs sent on graceful shutdown");
            await logtail.flush();
        }
        catch(error) {
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
            logger.info("all logs sent on graceful shutdown");
            logger.info("all logs sent on graceful shutdown");
            await logtail.flush();
        }
        catch(error) {
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