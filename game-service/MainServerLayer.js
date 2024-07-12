import CryptoJS from "crypto-js"
// import crypto from "node:crypto"

import LOBBY from "./models/lobby.model.js"
import dotenv from "dotenv"

import { publish_to_queue } from "./rabbit.js";

dotenv.config();

const url = "https://skyboardgames.com/api"
// const url = process.env.NODE_ENV == development ? "http://localhost:5656/api" : "https://skyboardgames.com/api";

async function postData(url, method, data) {
    const hashKey = process.env.GAME_SERVER_KEY

    const requestHash = CryptoJS.HmacSHA512(JSON.stringify(data), hashKey).toString();

    // const calculatedHash = crypto.createHmac('sha512', hashKey).update(JSON.stringify(data, null, 0)).digest('hex');

    // console.log("requestHash: " + requestHash + " calculatedHash: " + calculatedHash);

    const response = await fetch(url, {
        method: method,
        headers: {
            'Content-type': 'application/json',
            'skyboard-request-hash': requestHash
        },
        body: JSON.stringify(data)
    })

    return response
}

export default class MainServerLayer {

    static async getLobbyID(lobbyCode) {
        console.log("getting lobbyID, code: ", lobbyCode);
        const currentLobby = await LOBBY.findOne({ code: lobbyCode })

        const lobbyID = currentLobby.toObject()._id.toString();

        console.log("lobbyID: ", lobbyID);

        return lobbyID;
    }

    static async wonGame(lobbyId, winnerId) {
        try {
            console.log("sending winner info");
            
            const data = {
                lobbyId: lobbyId,
                winnerId: winnerId
            }
    
            await publish_to_queue("game-info-win", data, true)
    
            console.log("winner info sent");
        } catch (error) {
            console.log(error);
        }
    }

    static async startGame(lobbyId) {
        const data = {
            lobbyId: lobbyId
        }

        console.log("sending start game to main server, data: ", JSON.stringify(data));

        const response = await postData(url + "/game/start", "PATCH", data)

        if (response.ok) {
            console.log("game started successfully");;
        }
        else {
            console.log("somthing went wrong");
            const data = await response.json();

            console.log(data);
        }
    }

    static async cancelGame() {

    }

    static async startTournamentGame() {

    }

    static async cancelTournamentGame() {

    }
}