import MainServerLayer from "../MainServerLayer.js";
import GameModel from "./models/game.model.js";

import Matter from "matter-js";

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

export default class Snooker {
    static _noEngine = Matter.Engine.create();
    static _noWorld = this._noEngine.world;

    static rooms = [
        {
            roomID: '',
            players: [{
                username: '',
                socketID: '',
                avatar: ''
            }],
            engine: this._noEngine,
            world: this._noWorld,
        }
    ]

    /**
     * Activates the game logic for handling WebSocket connections.
     * 
     * @param {import("socket.io").Server} io - The main Socket.IO server instance.
     * @param {import("socket.io").Namespace} snookerNameSpace - The specific namespace for the Whot game.
     * @param {Array<GameData>} mainRooms - A map of active game rooms.
     */
    static async activate(io, snookerNameSpace, mainRooms) {
        
        snookerNameSpace.on('connection', (socket) => {
            socket.on('disconnect', () => {
                console.log("user disconnected from snooker", socket.id);

                const room = this.rooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

                console.log(room);
                
                if(!room) return;

                io.emit('remove', 'snooker', room.roomID);
            })

            console.log("user connected to snooker server");

            socket.once('create_game', (roomID) => this.createGame(socket, roomID))

            socket.on('join_game', (roomID, username, avatar) => this.joinGame(snookerNameSpace, socket, roomID, username, avatar));

            // x and y for the whiteball position
            // down for mouse click
            socket.on('first_play', (roomID, x, y, down) => {
                const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                if(gameRoom != undefined) {
                    socket.broadcast.to(roomID).emit('first_play', x, y, down);
                }

            })

            socket.on('stick_rotate', (roomID, rotation) => {
                const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                if(gameRoom != undefined) {
                    socket.broadcast.to(roomID).emit('stick_rotate', rotation);
                }
            })

            socket.on('movement_input', (roomID, w, s, keyInput) => {
                const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                if(gameRoom != undefined) {
                    socket.broadcast.to(roomID).emit('movement_input', w, s, keyInput);
                }
            })

            socket.on('mobile_movement_input', (roomID, originX) => {
                const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                if(gameRoom != undefined) {
                    socket.broadcast.to(roomID).emit('mobile_movement_input', originX);
                }
            });

            socket.on('mobile_stick_strike', (roomID, power) => {
                const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                if(gameRoom != undefined) {
                    socket.broadcast.to(roomID).emit('mobile_stick_strike', power);
                }
            });

            socket.on('stick_strike', (roomID, power, leftDown, space) => {
                const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                if(gameRoom != undefined) {
                    socket.broadcast.to(roomID).emit('stick_strike', power, leftDown, space);
                }
            })

            socket.on('winner', async (roomID, playerNumber) => {
                const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                if(gameRoom != undefined) {
                    // await GameModel.updateOne({roomID: roomID, 'players.playerNumber': playerNumber}, {
                    //     $set: {'players.$.winner': true}
                    // })

                    const currentRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                    const winner = currentRoom.players.find(player => player.playerNumber == playerNumber);

                    const winnerData = await USER.findOne({username: winner.username})

                    const winnerId = winnerData.toObject()._id

                    const lobbyId = await MainServerLayer.getLobbyID(roomID);

                    await MainServerLayer.wonGame(lobbyId, winnerId);
                }
            });

            // socket.on('turn_played', (roomID, indexClicked, newPosition) => this.turnPlayed(socket, roomID, indexClicked, newPosition))

            // socket.on('game_over', async (roomID, player_winner) => {
            //     await GameModel.updateOne({roomID: roomID, 'players.socketID': socket.id}, {
            //         $set: {'players.$.winner': true}
            //     })
            // })
        })
    }

    static async createGame(socket, roomID, username, avatar) {

        socket.join(roomID);

        // const game = await GameModel.findOne({roomID: roomID})

        // if(game != null) {
        //     console.log('room id exist');

        //     return
        // }

        // const gameModel = new GameModel({
        //     game_name: "snooker",
        //     players: [
        //         {
        //             username: username,
        //             socketID: socket.id,
        //             playerNumber: '0'
        //         }
        //     ],
        //     roomID: roomID
        // });

        // await gameModel.save();

        this.rooms.push({
            roomID: roomID,
            players: [
                {
                    username: username,
                    socketID: socket.id,
                    avatar: avatar,
                    playerNumber: '0'
                }
            ]
        });

        console.log("user created game");
        
    }

    static async joinGame(snookerNameSpace, socket, roomID, username, avatar) {
        const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

        if(gameRoom != undefined) {
            if(gameRoom.players.length > 1) {
                console.log("room full");
                socket.emit(
                    'error',
                    'room full'
                )
            }
            else {
                socket.join(roomID);
        
                // await GameModel.updateOne({roomID: roomID}, {
                //     $push: {
                //         players: {
                //             username: username,
                //             socketID: socket.id,
                //             playerNumber: '1'
                //         }
                //     }
                // })
    
                this.rooms.filter(room => room.roomID == roomID)[0].players.push({
                    username: username,
                    socketID: socket.id,
                    avatar: avatar,
                    playerNumber: '1'
                })
    
                // const currentGameState = this.rooms.filter(room => room.roomID == roomID)[0].state;
    
                console.log("user joined game");

                socket.emit('joined_game')

                const playerOneInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID != socket.id);
                const playerTwoInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID == socket.id);

                snookerNameSpace.to(roomID).emit('start_game', playerOneInfo, playerTwoInfo);

                const lobbyID = await MainServerLayer.getLobbyID(roomID);

                await MainServerLayer.startGame(lobbyID);

                console.log("done sending info to main server");
            }
        }
        else {
            this.createGame(socket, roomID, username, avatar);
        }
    }
}