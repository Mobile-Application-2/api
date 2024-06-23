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
            winner: {
                type: Boolean,
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
    collection: "ludo"
})

const GameModel = model("ludos", GameSchema);

export default GameModel;