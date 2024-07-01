import { Schema, model } from "mongoose";

const GameSchema = new Schema({
    players: [
        {
            username: {
                type: String,
                required: true
            },
            socketID: {
                type: String,
                required: true
            },
            playerNumber: {
                type: String,
                required: true
            },
            winner: {
                type: Boolean,
                required: false
            },
            userID: {
                type: String,
                required: false
            }
        }
    ],
    game_name: {
        type: String,
        required: true
    },
    roomID: {
        type: String,
        required: true
    }
}, {
    collection: "scrabble"
})

const GameModel = model("scrabbles", GameSchema);

export default GameModel;