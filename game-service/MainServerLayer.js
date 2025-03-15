import CryptoJS from "crypto-js"
// import crypto from "node:crypto"

import LOBBY from "./models/lobby.model.js"
import dotenv from "dotenv"

import { publish_to_queue } from "./rabbit.js";
import { isDev, isProd } from "./config/server.config.js";
import { logger } from "./config/winston.config.js";

dotenv.config();

const url = "https://main-api-34xd.onrender.com/api"
// const url = process.env.NODE_ENV == development ? "http://localhost:5656/api" : "https://skyboardgames.com/api";

async function postData(url, method, data) {
    const hashKey = process.env.GAME_SERVER_KEY

    const requestHash = CryptoJS.HmacSHA512(JSON.stringify(data), hashKey).toString();

    // const calculatedHash = crypto.createHmac('sha512', hashKey).update(JSON.stringify(data, null, 0)).digest('hex');

    // logger.info("requestHash: " + requestHash + " calculatedHash: " + calculatedHash);

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
            logger.info("getting lobbyID, code: ", lobbyCode);
            const currentLobby = await LOBBY.findOne({ code: lobbyCode })

            if(!currentLobby) {

                logger.info(isDev, isProd);

                if(isDev) logger.info("no lobby dev main server layer");
                else logger.info("sneaky");

                return;
            }
    
            const lobbyID = currentLobby.toObject()._id.toString();
    
            logger.info("lobbyID: ", lobbyID);
    
            return lobbyID;    
        }
        catch(error) {
            logger.error(error);
        }
    }

    static async wonGame(lobbyId, winnerId) {
        try {
            logger.info("sending winner info");
            
            const data = {
                lobbyId: lobbyId,
                winnerId: winnerId
            }
    
            await publish_to_queue("game-info-win", data, true)
    
            logger.info("winner info sent");
        } catch (error) {
            logger.error(error);
        }
    }

    static async startGame(lobbyId) {
        try {
            const data = {
                lobbyId: lobbyId
            }
    
            logger.info("sending start game to main server, data: ", JSON.stringify(data));

            logger.log(url + "/game/start")
    
            const response = await postData(url + "/game/start", "PATCH", data)
    
            if (response.ok) {
                logger.info("game started successfully");;
            }
            else {
                logger.error("somthing went wrong");
                const data = await response.json();
    
                logger.error(data);
            }
        }
        catch (error) {
            logger.error(error);
        }
    }

    static async cancelGame() {

    }

    static async startTournamentGame() {

    }

    static async cancelTournamentGame() {

    }
}