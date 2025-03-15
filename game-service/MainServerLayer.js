import CryptoJS from "crypto-js"
// import crypto from "node:crypto"

import LOBBY from "./models/lobby.model.js"
import dotenv from "dotenv"

import { publish_to_queue } from "./rabbit.js";
import { isDev, isProd } from "./config/server.config.js";

dotenv.config();

const url = "https://main-api-34xd.onrender.com"
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
        try {
            console.log("getting lobbyID, code: ", lobbyCode);
            const currentLobby = await LOBBY.findOne({ code: lobbyCode })

            if(!currentLobby) {

                console.log(isDev, isProd);

                if(isDev) console.log("no lobby dev main server layer");
                else console.log("sneaky");

                return;
            }
    
            const lobbyID = currentLobby.toObject()._id.toString();
    
            console.log("lobbyID: ", lobbyID);
    
            return lobbyID;    
        }
        catch(error) {
            console.error(error);
        }
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
            console.error(error);
        }
    }

    static async startGame(lobbyId) {
        try {
            const data = {
                lobbyId: lobbyId
            }
    
            console.log("sending start game to main server, data: ", JSON.stringify(data));
    
            const response = await postData(url + "/game/start", "PATCH", data)
    
            if (response.ok) {
                console.log("game started successfully");;
            }
            else {
                console.error("somthing went wrong");
                const data = await response.json();
    
                console.error(data);
            }
        }
        catch (error) {
            console.error(error);
        }
    }

    static async cancelGame() {

    }

    static async startTournamentGame() {

    }

    static async cancelTournamentGame() {

    }
}