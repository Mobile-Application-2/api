import GameModel from "./models/game.model.js";

export default class Ludo {
    static async addRoom(roomID, setup, ludoRooms, socketID) {
        const roomObject = {
            roomID: roomID,
            setup: setup,
            players: [
                {
                    username: '',
                    socketID: socketID,
                }
            ]
        }

        ludoRooms.push(roomObject);

        console.log(roomObject);

        const gameModel = new GameModel({
            game_name: "Ludo",
            players: [],
            roomID: roomID
        });

        await gameModel.save();
    }

    static async addPlayerToDB(roomID, socketID) {
        // const currentGame = await GameModel.findOne({roomID: roomID});

        // console.log(currentGame.toObject());

        const player = {
            username: "null",
            socketID: socketID,
            winner: false
        }

        // await GameModel.updateOne({roomID: roomID}, {
        //     players: [...currentGame.players, player]
        // });
        await GameModel.updateOne({roomID: roomID}, {
            $push: {
                players: {
                    username: 'test',
                    socketID: socketID,
                }
            }
        })
    }

    static async declareWinner(roomID, socketID) {
        await GameModel.updateOne({roomID: roomID, 'players.socketID': socketID}, {
            $set: {'players.$.winner': true}
        })
    }
}