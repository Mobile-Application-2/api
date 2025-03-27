import GameManager from "./GameManager.js";
import { logger } from "./config/winston.config.js";

/**
 * Emits time remaining to specified room from a namespace
 * @param {import("socket.io").Namespace} roomNameSpace
 * @param {string} roomId
 * @param {GameManager} gameManager
 */
export async function emitTimeRemaining(roomNameSpace, roomId, gameManager) {
    const timeRemaining = gameManager.getTimeRemaining()

    // logger.info("time remaining: ", {timeRemaining});

    roomNameSpace.to(roomId).emit("timer", timeRemaining);
}