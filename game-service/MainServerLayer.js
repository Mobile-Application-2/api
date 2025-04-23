import CryptoJS from "crypto-js"
// import crypto from "node:crypto"

import LOBBY from "./models/lobby.model.js"
import dotenv from "dotenv"

import { publish_to_queue } from "./rabbit.js";
import { isDev, isProd } from "./config/server.config.js";
import { logger } from "./config/winston.config.js";
import USER from "./models/user.model.js";
import TOURNAMENTFIXTURES from "./models/tournament-fixtures.model.js";

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
    static async getUserGameDetails(userId) {
        if (!userId) {
            return null
        }

        try {
            const user = await USER.findById(userId).lean()

            if (!user) {
                return null
            }

            const { username, avatar } = user

            return {username, avatar};
        }
        catch (error) {
            logger.error(error)
        }
    }

    static async getLobbyID(lobbyCode) {
        if (!lobbyCode) {
            logger.warn("no lobby code");
        }
        try {
            logger.info("getting lobbyID, code: ", { lobbyCode });
            const currentLobby = await LOBBY.findOne({ code: lobbyCode })

            if (!currentLobby) {

                logger.info(isDev, isProd);

                if (isDev) logger.info("no lobby dev main server layer");
                else logger.info("sneaky");

                return;
            }

            const lobbyID = currentLobby.toObject()._id.toString();

            logger.info("lobbyID: ", {lobbyID});

            return lobbyID;
        }
        catch (error) {
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

            logger.info("info", {data});

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

            logger.info("sending start game to main server, data: ", {data});

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
            logger.error("somthing went wrong when sending start notif");
            logger.error(error);
        }
    }

    static async cancelGame() {

    }

    static async startTournamentGame(fixtureId, joiningCode) {
        try {
            const f = await TOURNAMENTFIXTURES.findOne({tournamentId: fixtureId, joiningCode: joiningCode});

            if(!f) {
                logger.warn("fixture not found");
            }

            const data = {
                fixtureId: f._id
            }

            logger.info("sending start game to main server, data: ", {data});

            const response = await postData(url + "/tournament/start-fixture-game", "PATCH", data)

            if (response.ok) {
                logger.info("game fixture started successfully");;
            }
            else {
                logger.error("somthing went wrong");
                const data = await response.json();

                logger.error(data);
            }
        }
        catch (error) {
            logger.error("somthing went wrong when sending start notif");
            logger.error(error);
        }
    }

    static async wonTournamentGame(fixtureId, winnerId, joiningCode) {
        try {
            const f = await TOURNAMENTFIXTURES.findOne({tournamentId: fixtureId, joiningCode: joiningCode});

            if(!f) {
                logger.warn("fixture not found");
            }

            logger.info("sending winner info (tournament)");

            const data = {
                fixtureId: f._id,
                winnerId: winnerId
            }

            await publish_to_queue("tournament-info-win", data, true)

            logger.info("winner info sent (tournament)");
        } catch (error) {
            logger.error(error);
        }
    }

    static async cancelTournamentGame() {

    }
}