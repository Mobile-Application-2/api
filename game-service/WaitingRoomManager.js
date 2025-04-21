/**
 * @typedef {Object} ActivePlayer
 * @property {String} socketID
 * @property {String} userID
 */


import { logger } from "./config/winston.config.js";
import ACTIVEUSER from "./models/active.model.js";
import TOURNAMENTFIXTURES from "./models/tournament-fixtures.model.js";

/**
 * Manages the game tournament waiting room.
 */
export default class WaitingRoomManager {
    /**
     * @type {Map<string, Array<ActivePlayer>>} LobbyCodeWaiting
     */
    lobbyCodeWaiting = new Map();
    /**
     * @type {Map<string, NodeJS.Timeout>} LobbyCodeWaiting
     */
    timers = new Map()

    /**
     * @param {import("socket.io").Server} io - The Socket.IO server instance.
     * @param {Array<ActivePlayer>} activePlayers - Active players
     * @param {import("socket.io").Server} mainIo - The Socket.IO server instance.
     */
    constructor(io, activePlayers, mainIo) {
        this.io = io;
        this.mainIo = mainIo;
        this.activePlayers = activePlayers;
        // this.fixtures = [];
    }

    /**
     * Handles a player joining the waiting room.
     * @param {import("socket.io").Socket} socket - The player's socket connection.
     * @param {string} playerId - The ID of the player.
     * @param {string} lobbyCode - The tournament lobby code.
     */
    async joinWaitingRoom(socket, playerId, lobbyCode) {
        try {
            const fixture = await this.getFixture(lobbyCode, playerId);

            if (!fixture) {
                socket.emit("error", { message: "Fixture not found" });

                logger.error("Fixture not found, LobbyCode: ", { lobbyCode });

                return false;
            }

            logger.info("fixture found: ", { fixture })

            this.addPlayerToLobbyCodeWaiting(lobbyCode, playerId, socket.id);

            // this.emitNumbers();

            const opponentId = fixture.players.find(playerID => playerID != playerId) // OPPONENT

            if (!opponentId) {
                socket.emit("error", { message: "Opponent not found" });

                logger.error("opponent not found, LobbyCode: ", { lobbyCode });

                return false;
            }

            const isOpponentActive = await this.isActivePlayer(opponentId);

            if (!isOpponentActive) {
                logger.info(`not active, starting opponent timer...`);

                this.startOpponentTimer(socket.id, lobbyCode, opponentId);

                socket.emit("opponent-not-active", { message: "Opponent Not Active, Starting Timer" });

                logger.warn("opponent not active, starting timer, LobbyCode: ", { lobbyCode })
            }
            else {
                logger.info(`opponent active`);

                // Opponent is active, cancel the timer if it exists
                this.cancelOpponentTimer(opponentId);

                const playersSocketIds = this.getLobbyWaitingSocketsIds(lobbyCode);

                if (!playersSocketIds) {
                    socket.emit("error", { message: "Not enough players to start game" });

                    logger.warn(`Not enough players to start game, LobbyCode: ${lobbyCode}, sockets: ${playersSocketIds}`);

                    return false;
                }

                logger.info(`ids to start, ${playersSocketIds}`);

                this.io.to(playersSocketIds).emit("start-tournament-fixture");

                logger.info("starting tournament fixture, lobbyCode: ", { lobbyCode });

                // REMOVE FROM LOBBY
                this.lobbyCodeWaiting.delete(lobbyCode);
            }

            return true;
        }
        catch (error) {
            logger.warn("something went wrong joining tournament waiting room, lobbyCode: ", { lobbyCode })

            logger.error(error);

            socket.emit("error", { message: "Something went wrong with joining the tournament waiting room" });

            return false;
        }
    }

    // handlePlayerNotActive(socketIdToAlert, lobbyCode, opponentId) {
    //     this.startOpponentTimer(socketIdToAlert, lobbyCode, opponentId);

    //     socket.emit("opponent-not-active", { message: "Opponent Not Active, Starting Timer" });

    //     logger.warn("opponent not active, starting timer, LobbyCode: ", { lobbyCode })
    // }

    /**
     * @typedef {Object} TournamentFixture
     * @property {string} _id - The unique identifier of the fixture.
     * @property {string} tournamentId - The ID of the tournament.
     * @property {string[]} players - Array of player IDs.
     * @property {string | null} winner - The ID of the winning player (if available).
     * @property {string} joiningCode - The unique joining code for the fixture.
     * @property {boolean} gameStarted - Indicates if the game has started.
     * @property {string} createdAt - Timestamp when the fixture was created.
     * @property {string} updatedAt - Timestamp when the fixture was last updated.
     */

    /**
     * Finds the fixture for a given player and lobby.
     * @param {string} lobbyCode - The tournament lobby code.
     * @param {string} playerId - The ID of the player.
     * @returns {Promise<TournamentFixture | null>} The fixture if found.
     */
    async getFixture(lobbyCode, playerId) {
        try {
            const result = await TOURNAMENTFIXTURES.findOne({
                joiningCode: lobbyCode
            }).lean()

            return result
        }
        catch (error) {
            logger.error("error getting fixture: ", error);

            return null
        }
    }

    async getLobbyCode(playerId) {
        for (const [key, value] of this.lobbyCodeWaiting.entries()) {
            if (value.includes(playerId)) {
                return key; // This will correctly exit the function
            }
        }

        return ""; // Default return if no match is found
    }

    /**
     * Cancels the timer for a specific opponent.
     * @param {string} opponentId - The ID of the opponent.
     */
    cancelOpponentTimer(opponentId) {
        // logger.info("keys to timers", { keys: this.timers.keys() })

        if (this.timers.has(opponentId)) {
            clearTimeout(this.timers.get(opponentId)); // Cancel the timer
            this.timers.delete(opponentId); // Remove the timer from the map

            logger.info("canceled timer for opponent, opponentId: ", { opponentId });
        }
    }

    /**
     * Starts a 2-minute timer to check if an opponent is available.
     * @param {string} socketID - The player's socket ID.
     * @param {string} lobbyCode - The tournament lobby code.
     * @param {string} opponentId - The ID of the opponent.
     */
    startOpponentTimer(socketID, lobbyCode, opponentId) {
        if (this.timers.has(opponentId)) {
            clearTimeout(this.timers.get(opponentId)); // Prevent duplicate timers
        }

        const timeout = setTimeout(async () => {
            try {
                const au = await this.isActivePlayer(opponentId);

                if (!au) {
                    this.io.to(socketID).emit("opponent-not-available");

                    logger.warn("player still not active, lobbyCode: ", { lobbyCode })

                    // REMOVE FROM TOURNAMENT
                    // ETC

                    this.timers.delete(opponentId);
                }
            }
            catch (error) {
                logger.warn("error in cb (opponent not available)");

                logger.error(error);

                this.timers.delete(opponentId);
            }

        }, 120000); // 2 minutes

        timeout.unref();

        this.timers.set(opponentId, timeout);
    }

    addPlayerToLobbyCodeWaiting(lobbyCode, playerId, socketId) {
        const waiting = this.lobbyCodeWaiting.get(lobbyCode);

        if (!waiting) {
            this.lobbyCodeWaiting.set(lobbyCode, [{ socketID: socketId, userID: playerId }])

            logger.info("added player to tournament lobby waiting, lobbyCode: ", { lobbyCode });

            return;
        }

        this.lobbyCodeWaiting.set(lobbyCode, [...waiting, { socketID: socketId, userID: playerId }])

        logger.info("matched player, tournament game about to start, lobbyCode: ", { lobbyCode });
    }

    /**
    * @deprecated This method is deprecated. Use `isActivePlayer(opponentId)` instead.
    */
    checkOpponentOnlineState(opponentId) {
        const opponent = this.activePlayers.find(player => player.userID == opponentId);

        if (!opponent) {
            return false;
        }

        return true;
    }

    getLobbyWaitingSocketsIds(lobbyCode) {
        const waiting = this.lobbyCodeWaiting.get(lobbyCode);

        if (!waiting) {
            return undefined;
        }

        if (waiting.length < 2) {
            return undefined
        }

        return waiting.map(lobbyPlayer => lobbyPlayer.socketID)
    }

    async isActivePlayer(userId) {
        const au = await ACTIVEUSER.findOne({ userID: userId })

        const activePlayer = this.activePlayers.find(p => p.userID == userId);

        if (!au) {
            return false;
        }

        // If the opponent becomes active, cancel the timer
        this.cancelOpponentTimer(userId);

        return true
    }

    /**
     * Handles a player leaving the waiting room.
     * @param {string} playerId - The ID of the player.
     * @param {string} lobbyCode - The tournament lobby code.
     */
    async leaveWaitingRoom(playerId, lobbyCode) {
        try {
            logger.info(`player leaving waiting room, ${playerId}, ${lobbyCode}`)

            const waiting = this.lobbyCodeWaiting.get(lobbyCode);

            if (!waiting) {
                logger.warn("lobby not found, lobbyCode: ", { lobbyCode });

                return;
            }

            const playerToRemoveSocketId = waiting.filter(p => p.userID == playerId)[0].socketID;

            // Remove the player from the lobby
            const updatedWaiting = waiting.filter((player) => player.userID !== playerId);

            // if (updatedWaiting.length === 0) {
            //     // If the lobby is empty, delete it
            //     this.lobbyCodeWaiting.delete(lobbyCode);
            //     logger.info("lobby is now empty, deleted lobby, lobbyCode: ", { lobbyCode });
            // }

            // Update the lobby with the remaining players
            this.lobbyCodeWaiting.set(lobbyCode, updatedWaiting);

            logger.info(`removed, ${playerId}, ${lobbyCode}`)

            const playersToEmit = updatedWaiting.map(p => p.socketID);

            this.io.to([...playersToEmit]).emit("opponent-not-active", { message: "Opponent left the room, Starting Timer" })

            logger.info("player left waiting room, lobbyCode: ", { lobbyCode });

            this.startOpponentTimer(playersToEmit[0], lobbyCode, playerToRemoveSocketId);

            // socket.emit("opponent-not-active", { message: "Opponent Not Active, Starting Timer" });

            logger.info("getting fixture to see if opponent has timer");

            const fixture = await this.getFixture(lobbyCode, playerId);

            logger.info("fixture", { fixture });

            if (!fixture) {
                logger.info("somehow no fixture")

                return;
            }

            // Cancel the timer for the player's opponent (if any)
            const opponentId = fixture.players.find(playerID => playerID != playerId) // OPPONENT

            logger.info("opponent to check if has a timer", { opponentId })

            if (this.timers.get(opponentId)) {
                logger.info("Opponent has a timer set, seeing if can cancel", { opponentId })
                this.cancelOpponentTimer(opponentId);
            }
        }
        catch (error) {
            logger.error(error);

            socket.emit("error", { message: "Something went wrong with leaving the tournament waiting room" });
        }
    }

    getTotalPlayersInWaitingRoom() {
        const lobbyCodeWaiting = this.lobbyCodeWaiting;

        const players = Array.from(lobbyCodeWaiting.values()).flat();

        return players.length;
    }

    emitNumbers() {
        try {
            const lobbyCodeWaiting = this.lobbyCodeWaiting;

            const players = Array.from(lobbyCodeWaiting.values()).flat()

            this.io.emit("total-players", players.length)
        }
        catch (error) {
            console.log("could not emit", error);
        }
    }

    // /**
    //  * Gets the opponent's ID for a given player in a lobby if it exists.
    //  * @param {string} lobbyCode - The tournament lobby code.
    //  * @param {string} playerId - The ID of the player.
    //  * @returns {string | undefined} The opponent's ID, or undefined if not found.
    //  */
    // getOpponentId(lobbyCode, playerId) {
    //     const waiting = this.lobbyCodeWaiting.get(lobbyCode);

    //     if (!waiting) {
    //         return undefined;
    //     }

    //     // Find the opponent in the lobby
    //     const opponent = waiting.find((player) => player.userID !== playerId);

    //     return opponent ? opponent.userID : undefined;
    // }
}
