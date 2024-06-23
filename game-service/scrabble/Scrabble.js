import GameModel from "./models/game.model.js";
import Bag from "./Bag.js";
import LetterFactory from "./LetterFactory.js";

export default class Scrabble {

    static rooms = [
        {
            roomID: '',
            players: [{
                username: '',
                socketID: '',
            }],
            bag: new Bag()
        }
    ]

    static async activate(io, scrabbleNameSpace) {
        scrabbleNameSpace.on('connection', socket => {
            console.log("user connected to scrabble server");

            socket.on('disconnect', () => {
                console.log("user disconnected from snooker", socket.id);

                const room = this.rooms.find(room => room.players.includes(room.players.find(player => player.socketID == socket.id)));

                console.log(room);
                
                if(!room) return;

                io.emit('remove', 'snooker', room.roomID);
            })

            console.log(socket.id);

            socket.once('create_game', (roomID) => this.createGame(socket, roomID))

            socket.on('join_game', (roomID) => this.joinGame(scrabbleNameSpace, socket, roomID));

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

    static async createGame(socket, roomID) {
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
                    username: 'test',
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
                    username: 'test',
                    socketID: socket.id
                }
            ],
            bag: scrabbleBag
        });

        socket.emit('created_game', scrabbleBag.finalLetters.map(letters => letters.alphabet));

        console.log("user created game");   
    }

    static async joinGame(scrabbleNameSpace, socket, roomID) {
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
                            username: 'test',
                            socketID: socket.id,
                            playerNumber: '1'
                        }
                    }
                })
    
                const room = this.rooms.filter(room => room.roomID == roomID)[0]

                room.players.push({
                    username: 'test',
                    socketID: socket.id
                })
    
                console.log("user joined game");

                const scrabbleBag = room.bag.finalLetters.map(letters => letters.alphabet);

                socket.emit('joined_game', scrabbleBag);

                scrabbleNameSpace.to(roomID).emit('start_game');
            }
        }
        else {
            this.createGame(socket, roomID);
        }
    }
}