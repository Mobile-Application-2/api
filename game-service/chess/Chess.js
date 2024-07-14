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

    static async activate(io, chessNameSpace) {
        chessNameSpace.on('connection', socket => {
            console.log("user connected to chess server");
            // TODO: reconnect player to game if disconnected and game still on

            socket.once('create_game', (roomID, state) => this.createGame(socket, roomID, state))

            socket.on('join_game', (roomID, state) => this.joinGame(chessNameSpace, socket, roomID, state));

            socket.on('turn_played', (roomID, indexClicked, newPosition, callback) => {
                callback({
                    status: "ok"
                })
                this.turnPlayed(socket, roomID, indexClicked, newPosition)
            })

            socket.on('game_over', async (roomID, player_winner) => {
                await GameModel.updateOne({roomID: roomID, 'players.socketID': socket.id}, {
                    $set: {'players.$.winner': true}
                })

                const currentRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                const winner = currentRoom.players.find(player => player.socketID == socket.id);

                const winnerData = await USER.findOne({username: winner.username})

                const winnerId = winnerData.toObject()._id

                const lobbyId = await MainServerLayer.getLobbyID(roomID);

                await MainServerLayer.wonGame(lobbyId, winnerId);

                // await GameModel.findOne({'players.username'})
            })

            socket.on('disconnect', () => {
                console.log("user disconnected from chess", socket.id);

                const room = this.rooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

                // console.log(room);

                if(!room) return;

                // TODO: remove player from game lobby not whole lobby

                io.emit('remove', 'chess', room.roomID);
            })

            socket.on('disconnecting', () => {
                for(let i = 0; i < this.rooms.length; ++i) {
                    const currentRoom = this.rooms[i];

                    if(currentRoom.players.filter(player => player.socketID == socket.id)[0] != undefined) {
                        console.log("player is disconnecting");

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
        // console.log(newState, this.rooms[0].state);
        // console.log(newState);
        const currentRoom = this.rooms.filter(room => room.roomID == roomID)[0];

        if(currentRoom) {
            // currentRoom.state = newState;

            socket.broadcast.emit('turn_played', indexClicked, newPosition, (err, response) => {
                // if(err) {
                //     console.log("no response from client");
                //     console.log(err);
                // }
                // else {
                //     console.log("client responded");
                //     console.log(response);
                // }
            });
        }
    }

    static async createGame(socket, roomID, state) {
        socket.join(roomID);

        console.log("state on room create", state);

        const game = await GameModel.findOne({roomID: roomID})

        if(game != null) {
            console.log('room id exist');

            return
        }

        const gameModel = new GameModel({
            game_name: "chess",
            players: [
                {
                    username: state.username,
                    socketID: socket.id,
                }
            ],
            roomID: roomID
        });

        await gameModel.save();

        this.rooms.push({
            roomID: roomID,
            state: state,
            players: [
                {
                    username: state.username,
                    socketID: socket.id,
                    avatar: state.avatar
                }
            ]
        });

        console.log("user created game");
    }

    static async joinGame(chessNameSpace, socket, roomID, state) {
        const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

        // console.log(gameRoom);

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

                console.log("state on room join", state);
        
                await GameModel.updateOne({roomID: roomID}, {
                    $push: {
                        players: {
                            username: state.username,
                            socketID: socket.id,
                        }
                    }
                })
    
                this.rooms.filter(room => room.roomID == roomID)[0].players.push({
                    username: state.username,
                    socketID: socket.id,
                    avatar: state.avatar
                })
    
                const currentGameState = this.rooms.filter(room => room.roomID == roomID)[0].state;
    
                console.log("user joined game");
    
                socket.emit('joined_game', currentGameState);

                const playerOneInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID != socket.id);
                const playerTwoInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID == socket.id);

                if(!playerOneInfo || !playerTwoInfo) {
                    console.log("cant get info");

                    return
                }

                // playerOneInfo = playerOneInfo.map(info => {return {username: info.username, avatar: info.avatar}})
                // playerTwoInfo = playerTwoInfo.map(info => {return {username: info.username, avatar: info.avatar}})
                // playerOneInfo.socketID = undefined;
                // playerTwoInfo.socketID = undefined;

                chessNameSpace.to(roomID).emit('start_game', playerOneInfo, playerTwoInfo);

                console.log("sending info to main server");

                const lobbyID = await MainServerLayer.getLobbyID(roomID);

                await MainServerLayer.startGame(lobbyID);

                console.log("done sending info to main server");
            }
        }
        else {
            this.createGame(socket, roomID, state);
        }

    }
}