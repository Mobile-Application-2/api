import GameModel from "./models/game.model.js";
import Bag from "./Bag.js";
import LetterFactory from "./LetterFactory.js";
import MainServerLayer from "../MainServerLayer.js";

export default class Scrabble {

    static rooms = [
        {
            roomID: '',
            players: [{
                username: '',
                socketID: '',
                avatar: ''
            }],
            bag: new Bag()
        }
    ]

    static async activate(io, scrabbleNameSpace) {
        scrabbleNameSpace.on('connection', socket => {
            console.log("user connected to scrabble server");

            socket.on('disconnect', () => {
                console.log("user disconnected from scrabble", socket.id);

                const room = this.rooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

                console.log(room);
                
                if(!room) return;

                io.emit('remove', 'scrabble', room.roomID);
            })

            console.log(socket.id);

            socket.once('create_game', (roomID) => this.createGame(socket, roomID))

            socket.on('join_game', (roomID, username, avatar) => this.joinGame(scrabbleNameSpace, socket, roomID, username, avatar));

            socket.on('update_state', (roomID, state) => {
                const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                if(gameRoom != undefined) {
                    // state = index, letterAlphabet, letterScore, totalScore

                    socket.broadcast.to(roomID).emit('update_state', state);
                }
            })

            socket.on('update_bag', (roomID, arrayOfAlphabets) => {
                const gameRoom = this.rooms.filter(room => room.roomID == roomID)[0];

                if(gameRoom != undefined) {
                    const letters = LetterFactory.genLettersWithAlphabet(arrayOfAlphabets);

                    gameRoom.bag.finalLetters = letters;

                    socket.broadcast.to(roomID).emit('update_bag', arrayOfAlphabets);
                }
            })
        })
    }

    static async createGame(socket, roomID, username, avatar) {
        socket.join(roomID);

        const game = await GameModel.findOne({roomID: roomID})

        if(game != null) {
            console.log('room id exist');

            return
        }

        const gameModel = new GameModel({
            game_name: "scrabble",
            players: [
                {
                    username: username,
                    socketID: socket.id,
                    playerNumber: '0'
                }
            ],
            roomID: roomID
        });

        await gameModel.save();

        const totalLetters = LetterFactory.genLetters();

        const scrabbleBag = new Bag(totalLetters);

        this.rooms.push({
            roomID: roomID,
            players: [
                {
                    username: username,
                    socketID: socket.id,
                    avatar: avatar
                }
            ],
            bag: scrabbleBag
        });

        socket.emit('created_game', scrabbleBag.finalLetters.map(letters => letters.alphabet));

        console.log("user created game");   
    }

    static async joinGame(scrabbleNameSpace, socket, roomID, username, avatar) {
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
        
                await GameModel.updateOne({roomID: roomID}, {
                    $push: {
                        players: {
                            username: username,
                            socketID: socket.id,
                            playerNumber: '1'
                        }
                    }
                })
    
                const room = this.rooms.filter(room => room.roomID == roomID)[0]

                room.players.push({
                    username: username,
                    socketID: socket.id,
                    avatar: avatar
                })
    
                console.log("user joined game");

                const scrabbleBag = room.bag.finalLetters.map(letters => letters.alphabet);

                socket.emit('joined_game', scrabbleBag);

                const playerOneInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID != socket.id);
                const playerTwoInfo = this.rooms.filter(room => room.roomID == roomID)[0].players.find(playerObject => playerObject.socketID == socket.id);

                if(!playerOneInfo || !playerTwoInfo) {
                    console.log("player info not found");

                    return;
                }

                scrabbleNameSpace.to(roomID).emit('start_game', playerOneInfo, playerTwoInfo);

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