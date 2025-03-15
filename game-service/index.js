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

    active.push({
        socketID: socket.id,
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

// const ludoNamespace = io.of("/ludo");

// const ludoRooms = [
//     {
//         roomID: 'main',
//         setup: {
//             value: false,
//             playersList: [],
//             currentPlayer: "",
//             roomID: ''
//         }, 
//         players: []
//     }
// ];

// ludoNamespace.on('connection', socket => {
//     logger.info('a user connected to ludo server');

//     socket.on('disconnect', () => {
//         logger.info("user disconnected from ludo", socket.id);

//         const room = ludoRooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

//         logger.info(room);
//         if(!room) return;

//         io.emit('remove', 'ludo', room.roomID);
//     })

//     socket.on("dice_roll", ({roomID, num, isLocked, lastRolledBy}) => {
//         if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
//             logger.info(num, isLocked, lastRolledBy);
    
//             socket.broadcast.to(roomID).emit("dice_roll", {num, isLocked, lastRolledBy})
//         }
//     })

//     socket.on("coin_played", (roomID, index) => {
//         // logger.info(num, isLocked, lastRolledBy);
//         if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
//             socket.broadcast.to(roomID).emit("coin_played", index);
//         }

//     })

//     socket.on("player_won", async (roomID) => {
//         Ludo.declareWinner(roomID, socket.id);

//         const currentRoom = this.rooms.filter(room => room.roomID == roomID)[0];

//         const winner = currentRoom.players.find(player => player.socketID == socket.id);

//         const winnerData = await USER.findOne({username: winner.username})

//         const winnerId = winnerData.toObject()._id

//         const lobbyId = await MainServerLayer.getLobbyID(roomID);

//         await MainServerLayer.wonGame(lobbyId, winnerId);
//     })

//     socket.on("create_room", async (roomID, setup, username, avatar) => {
//         if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
//             logger.info("room found");

//             socket.join(roomID);

//             const currentRoomObject = ludoRooms.filter(roomObject => roomObject.roomID == roomID)[0];

//             currentRoomObject.players.push({
//                 username: username,
//                 socketID: socket.id,
//                 avatar: avatar
//             })
            
//             socket.emit("already_created", currentRoomObject.setup);

//             Ludo.addPlayerToDB(roomID, socket.id, username);

//             let playerOneInfo = currentRoomObject.players[0];
//             let playerTwoInfo = currentRoomObject.players[1];

//             // playerOneInfo.socketID = undefined;
//             // playerTwoInfo.socketID = undefined;

//             ludoNamespace.to(roomID).emit('start_game', playerOneInfo, playerTwoInfo)

//             const lobbyID = await MainServerLayer.getLobbyID(roomID);

//             await MainServerLayer.startGame(lobbyID);

//             logger.info("done sending info to main server");
//         }
//         else {
//             logger.info("creating room");
//             socket.join(roomID);
    
//             logger.info(roomID);
    
//             Ludo.addRoom(roomID, setup, ludoRooms, socket.id, username, avatar);
    
//             Ludo.addPlayerToDB(roomID, socket.id, username);
    
//             socket.emit('created_room');
//         }
//     })

//     socket.on("join_room", (roomID) => {
//         if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
//             logger.info("room found");

//             socket.join(roomID);

//             const currentRoomObject = ludoRooms.filter(roomObject => roomObject.roomID == roomID)[0];

//             currentRoomObject.players.push({
//                 username: '',
//                 socketID: socket.id
//             })
            
//             socket.emit("already_created", currentRoomObject.setup);

//             Ludo.addPlayerToDB(roomID, socket.id);
//         }
//         else {
//             logger.info("sorry no room");
//             // socket.join(roomID);

//             // Ludo.addRoom(roomID, ludoRooms);
//         }
//     })
// })

const whotNamespace = io.of("/whot");

Whot.activate(io, whotNamespace, newRooms);

// const chessNameSpace = io.of("/chess");

// Chess.activate(io, chessNameSpace);

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