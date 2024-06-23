import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from "dotenv";
import mongoose from 'mongoose';
dotenv.config();

import Ludo from './ludo/Ludo.js';
import Whot from './whot/Whot.js';
import Chess from './chess/Chess.js';
import Snooker from "./snooker/Snooker.js"
import Scrabble from './scrabble/Scrabble.js';

const app = express();

const server = createServer(app);

const PORT = 5657;

const io = new Server(server, {
    cors: {
      origin: "*"
    },
});

let active = [
    {
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


io.on('connection', (socket) => {
    console.log("user connected to general namespace");

    active.push({
        socketID: socket.id
    });

    io.emit('get_active', active);

    console.log(active);

    socket.on('disconnect', (_) => {
        console.log("user disconnected from general namespace", socket.id);

        active = active.filter(obj => obj.socketID != socket.id);

        console.log(active);

        io.emit('get_active', active);
    })

    // socket.on('get_active', () => {
    //     // socket.emit('get_active', active.filter(obj => obj.socketID != socket.id));
    //     io.emit('get_active', active.filter(obj => obj.socketID != socket.id));
    // })

    socket.on('created', (gameID, userID, roomID) => {
        console.log("lobby created");

        rooms.push({
            gameID: gameID,
            roomID: roomID
        })

        socket.broadcast.to(userID).emit('created', gameID, userID, roomID);
    })
})

const ludoNamespace = io.of("/ludo");

const ludoRooms = [
    {
        roomID: 'main',
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
    console.log('a user connected to ludo server');

    socket.on('disconnect', () => {
        console.log("user disconnected from ludo", socket.id);

        const room = ludoRooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

        console.log(room);
        if(!room) return;

        io.emit('remove', 'ludo', room.roomID);
    })

    socket.on("dice_roll", ({roomID, num, isLocked, lastRolledBy}) => {
        if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
            console.log(num, isLocked, lastRolledBy);
    
            socket.broadcast.to(roomID).emit("dice_roll", {num, isLocked, lastRolledBy})
        }
    })

    socket.on("coin_played", (roomID, index) => {
        // console.log(num, isLocked, lastRolledBy);
        if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
            socket.broadcast.to(roomID).emit("coin_played", index);
        }

    })

    socket.on("player_won", (roomID) => {
        Ludo.declareWinner(roomID, socket.id);
    })

    socket.on("create_room", (roomID, setup) => {
        if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
            console.log("room found");

            socket.join(roomID);

            const currentRoomObject = ludoRooms.filter(roomObject => roomObject.roomID == roomID)[0];

            currentRoomObject.players.push({
                username: '',
                socketID: socket.id
            })
            
            socket.emit("already_created", currentRoomObject.setup);

            Ludo.addPlayerToDB(roomID, socket.id);
        }
        else {
            console.log("creating room");
            socket.join(roomID);
    
            console.log(roomID);
    
            Ludo.addRoom(roomID, setup, ludoRooms, socket.id);
    
            Ludo.addPlayerToDB(roomID, socket.id);
    
            socket.emit('created_room');
        }
    })

    socket.on("join_room", (roomID) => {
        if(ludoRooms.find(roomObject => roomObject.roomID == roomID)) {
            console.log("room found");

            socket.join(roomID);

            const currentRoomObject = ludoRooms.filter(roomObject => roomObject.roomID == roomID)[0];

            currentRoomObject.players.push({
                username: '',
                socketID: socket.id
            })
            
            socket.emit("already_created", currentRoomObject.setup);

            Ludo.addPlayerToDB(roomID, socket.id);
        }
        else {
            console.log("sorry no room");
            // socket.join(roomID);

            // Ludo.addRoom(roomID, ludoRooms);
        }
    })
})

const whotNamespace = io.of("/whot");

Whot.activate(io, whotNamespace);

const chessNameSpace = io.of("/chess");

Chess.activate(io, chessNameSpace);

const snookerNameSpace = io.of("/snooker");

Snooker.activate(io, snookerNameSpace);

const scrabbleNameSpace = io.of("/scrabble");

Scrabble.activate(io, scrabbleNameSpace);

const URL = process.env.MONGO_URL;

// for cron job
app.get('/', (req, res) => {
    res.send("<h2>Welcome</h2>");
})

mongoose.connect(URL)
.then(() => {
    server.listen(PORT, () => {
        console.log(`server running at http://localhost:${PORT}`);
    });
})