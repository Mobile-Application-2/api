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

const app = express();

// Enable CORS
app.use(cors());

// Custom middleware to handle gzipped Unity files
const unityGzipHandler = (req, res, next) => {
    const originalUrl = req.url;
    const gzippedUrl = `${originalUrl}.gz`;
    const fullPath = path.join(__dirname, 'games/Ludo/Build', originalUrl);
    const gzippedPath = path.join(__dirname, 'games/Ludo/Build', gzippedUrl);

    console.log('Checking paths:');
    console.log('Original:', fullPath);
    console.log('Gzipped:', gzippedPath);

    // Check if gzipped version exists
    if (fs.existsSync(gzippedPath)) {
        console.log(`Found gzipped file: ${gzippedPath}`);
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
        console.log(`No gzipped file found, checking original: ${fullPath}`);
        if (fs.existsSync(fullPath)) {
            console.log(`Found original file: ${fullPath}`);
            // Let express.static handle it
            next();
        } else {
            console.log(`File not found: ${fullPath}`);
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

const newRooms = [
    {
        gameId: '',
        playerId: '',
        opponentId: '',
        stakeAmount: '',
        tournamentId: ''
    }
]

newRooms.splice(0);

async function handleError(error) {
    await ErrorModel.create({error: error.stack})
}

io.on('connection', (socket) => {
    console.log("user connected to general namespace");

    active.push({
        socketID: socket.id,
    });

    io.emit('get_active', active);

    console.log(active);
    // sentryLogActive();

    socket.on('disconnect', (_) => {
        try {
            console.log("user disconnected from general namespace", socket.id);
    
            active = active.filter(obj => obj.socketID != socket.id);
    
            console.log(active);
            // sentryLogActive();
    
            io.emit('get_active', active);    
        }
        catch (error) {
            // Sentry.captureException(error);
            handleError(error);
        }
    })

    socket.on("joinGame", ({gameId, playerId, opponentId, stakeAmount, tournamentId}) => {
        try {
            newRooms.push({gameId, playerId, opponentId, stakeAmount, tournamentId});
        }
        catch(error) {
            handleError(error);
        }
    })

    socket.on('lobby-created', (userID) => {
        try {
            const activeUser = active.find(activeUser => activeUser.socketID == socket.id);
    
            activeUser.userID = userID;
    
            console.log("updated active", active);
    
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
    
            console.log("updated active", active);
    
            io.emit('get_active', active);
    
            const lobby = await LOBBY.findOne({code: lobbyCode});
    
            const creatorID = lobby.toObject().creatorId;
    
            const gameID = lobby.toObject().gameId;
    
            const game = await GAME.findById(gameID);
    
            const gameName = game.toObject().name;
    
            const opponentToNotify = active.find(activeUser => {
                console.log(activeUser.userID, creatorID.toString());
    
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
                console.log(data);

                // Sentry.captureMessage(`game-message-channel: ${messageName} = ${data}`);
    
                /* const errorModel = new ErrorModel({
                    error: data
                });
        
                await errorModel.save(); */
            }
        }
        catch (error) {
            // Sentry.captureException(error);
            handleError(error);
        }
    })

    socket.on('created', (gameID, userID, roomID) => {
        try {
            console.log("lobby created");
    
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
//     console.log('a user connected to ludo server');

//     socket.on('disconnect', () => {
//         console.log("user disconnected from ludo", socket.id);

//         const room = ludoRooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

//         console.log(room);
//         if(!room) return;

//         io.emit('remove', 'ludo', room.roomID);
//     })

//     socket.on("dice_roll", ({roomID, num, isLocked, lastRolledBy}) => {
//         if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
//             console.log(num, isLocked, lastRolledBy);
    
//             socket.broadcast.to(roomID).emit("dice_roll", {num, isLocked, lastRolledBy})
//         }
//     })

//     socket.on("coin_played", (roomID, index) => {
//         // console.log(num, isLocked, lastRolledBy);
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
//             console.log("room found");

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

//             console.log("done sending info to main server");
//         }
//         else {
//             console.log("creating room");
//             socket.join(roomID);
    
//             console.log(roomID);
    
//             Ludo.addRoom(roomID, setup, ludoRooms, socket.id, username, avatar);
    
//             Ludo.addPlayerToDB(roomID, socket.id, username);
    
//             socket.emit('created_room');
//         }
//     })

//     socket.on("join_room", (roomID) => {
//         if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
//             console.log("room found");

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
//             console.log("sorry no room");
//             // socket.join(roomID);

//             // Ludo.addRoom(roomID, ludoRooms);
//         }
//     })
// })

// const whotNamespace = io.of("/whot");

// Whot.activate(io, whotNamespace);

// const chessNameSpace = io.of("/chess");

// Chess.activate(io, chessNameSpace);

// const snookerNameSpace = io.of("/snooker");

// Snooker.activate(io, snookerNameSpace);

// const scrabbleNameSpace = io.of("/scrabble");

// Scrabble.activate(io, scrabbleNameSpace);

const URL = process.env.MONGO_URL;

// Serve Unity files
app.use('/games/Ludo/Build', unityGzipHandler, express.static(path.join(__dirname, 'games/Ludo/Build')));
app.use('/TemplateData', express.static(path.join(__dirname, 'games/Ludo/TemplateData')));

// Serve the Unity game HTML page
app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'games/Ludo/index.html'));
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
        console.log(`server running at http://localhost:${PORT}`);

        // Log the directory structure
        console.log('\nChecking directory structure:');
        const buildPath = path.join(__dirname, 'games/Ludo/Build');
        if (fs.existsSync(buildPath)) {
            console.log('Build directory contents:', fs.readdirSync(buildPath));
        }
        else {
            console.log('Build directory not found at:', buildPath);
        }
    });
})
.catch(error => {
    handleError(error);
})