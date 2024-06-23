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

            socket.once('create_game', (roomID) => this.createGame(socket, roomID))

            socket.on('join_game', (roomID) => this.joinGame(chessNameSpace, socket, roomID));

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
            })

            socket.on('disconnect', () => {
                console.log("user disconnected from chess", socket.id);

                const room = this.rooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

                // console.log(room);

                if(!room) return;

                // TODO: remove player from game lobby not whole lobby

                io.emit('remove', 'chess', room.roomID);
            })

            // socket.on('disconnecting', () => {
            //     for(let i = 0; i < this.rooms.length; ++i) {
            //         const currentRoom = this.rooms[i];

            //         if(currentRoom.players.filter(player => player.socketID == socket.id)[0] != undefined) {
            //             socket.leave(currentRoom.roomID);

            //             currentRoom.players

            //             currentRoom.players = currentRoom.players.filter(player => player.socketID != socket.id);

            //             if(currentRoom.players.length == 0) {

            //             }

            //             break;
            //         }
            //     }
            // })
        })
    }

    static async turnPlayed(socket, roomID, indexClicked, newPosition) {
        // console.log(newState, this.rooms[0].state);
        // console.log(newState);
        const currentRoom = this.rooms.filter(room => room.roomID == roomID)[0];

        if(currentRoom) {
            // currentRoom.state = newState;

            socket.broadcast.emit('turn_played', indexClicked, newPosition, (err, response) => {
                if(err) {
                    console.log("no response from client");
                    console.log(err);
                }
                else {
                    console.log("client responded");
                    console.log(response);
                }
            });
        }
    }

    static async createGame(socket, roomID, state) {
        socket.join(roomID);

        const game = await GameModel.findOne({roomID: roomID})

        if(game != null) {
            console.log('room id exist');

            return
        }

        const gameModel = new GameModel({
            game_name: "chess",
            players: [
                {
                    username: 'test',
                    socketID: socket.id
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
                    username: 'test',
                    socketID: socket.id
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
        
                await GameModel.updateOne({roomID: roomID}, {
                    $push: {
                        players: {
                            username: 'test',
                            socketID: socket.id,
                        }
                    }
                })
    
                this.rooms.filter(room => room.roomID == roomID)[0].players.push({
                    username: 'test',
                    socketID: socket.id
                })
    
                const currentGameState = this.rooms.filter(room => room.roomID == roomID)[0].state;
    
                console.log("user joined game");
    
                socket.emit('joined_game', currentGameState);

                chessNameSpace.to(roomID).emit('start_game');
            }
        }
        else {
            this.createGame(socket, roomID, state);
        }

    }
}