import MatchMaker from "./MatchMaker.js";
import { logger } from "./config/winston.config.js";
import crypto from "crypto";
import TOURNAMENTFIXTURES from "./models/tournament-fixtures.model.js";
import WaitingRoomManager from "./WaitingRoomManager.js";

export default class Tournament {
    /**@type {Map<string, MatchMaker>} */
    static tournaments = new Map([["test", new MatchMaker()]]);
    static playersSocketIds = new Map([["test", "jskdjsk"]]);
    static activatedTournaments = new Set();
    static tournamentNamespace;
    static activeTournamentPlayers = [{userID: "", socketID: ""}];
    static tournamentWaitingRoom;

    /**
     * Activates the game logic for handling WebSocket connections.
     * 
     * @param {import("socket.io").Server} io - The main Socket.IO server instance.
     * @param {import("socket.io").Namespace} tournamentNamespace - The specific namespace for the Whot game.
     * @param {Array<GameData>} mainRooms - A map of active game rooms.
     */
    static activate(io, tournamentNamespace, mainRooms) {
        this.tournamentNamespace = tournamentNamespace;
        this.tournamentWaitingRoom = new WaitingRoomManager(tournamentNamespace, this.activeTournamentPlayers);

        this.tournamentNamespace.on('connection', socket => {
            this.tournaments.delete("test");

            logger.info("user connected to tournament server");

            const tournamentId = socket.handshake.query.tournamentId;
            const userId = socket.handshake.query.userId;

            // TODO: ADD TOURNAMENT CHECK
            if (!this.isValidTournament(tournamentId)) {
                logger.warn("not a valid tournament", { tournamentId });

                return;
            }

            this.addTournament(tournamentId);

            this.addPlayerToTournament(userId, tournamentId, socket);

            socket.on('join-tournament-waiting-room', async (playerId, lobbyCode) => {
                await this.tournamentWaitingRoom.joinWaitingRoom(socket, playerId, lobbyCode);

                logger.info("player joined tournament waiting room");
            })

            socket.on('leave-tournament-waiting-room', async (playerId, lobbyCode) => {
                await this.tournamentWaitingRoom.leaveWaitingRoom(playerId, lobbyCode);

                logger.info("player left tournament waiting room");
            })

            socket.on("disconnect", async (_) => {
                logger.info("user disconnected from tournament namespace", socket.id);

                const lobbyCode = this.tournamentWaitingRoom.getLobbyCode(userId);

                await this.tournamentWaitingRoom.leaveWaitingRoom(userId, lobbyCode);

                logger.info("player left tournament waiting room");

                this.removePlayerFromTournament(userId, tournamentId);
            })
        })
    }

    /**
     * @param {string} tournamentId
     */
    static addTournament(tournamentId) {
        if (this.activatedTournaments.has(tournamentId)) {
            return;
        }

        this.activatedTournaments.add(tournamentId);

        const maker = new MatchMaker();

        maker.on("match", async ({ playerOneId, playerTwoId }) => {
            try {
                const lobbyCode = await this.createFixture(tournamentId, playerOneId, playerTwoId);

                const playerOneSocketId = this.playersSocketIds.get(playerOneId);
                const playerTwoSocketId = this.playersSocketIds.get(playerTwoId);

                this.tournamentNamespace.to([playerOneSocketId, playerTwoSocketId]).emit("matched", { lobbyCode })
            }
            catch (error) {
                logger.error(error)
            }
        })

        this.tournaments.set(tournamentId, maker);
    }

    static addPlayerToTournament(playerId, tournamentId, socket) {
        if (!this.activatedTournaments.has(tournamentId)) {
            return;
        }

        const tournamentMatcher = this.tournaments.get(tournamentId);

        if (!tournamentMatcher) {
            logger.warn("no tournament", { tournamentId })

            return;
        }

        this.activeTournamentPlayers.push({userID: playerId, socketID: socket.id});

        this.playersSocketIds.set(playerId, socket.id);

        tournamentMatcher.addPlayer(playerId);

        logger.info("player added successfully")
    }

    static removePlayerFromTournament(playerId, tournamentId) {
        if (!this.activatedTournaments.has(tournamentId)) {
            return;
        }

        const tournamentMatcher = this.tournaments.get(tournamentId);

        if (!tournamentMatcher) {
            logger.warn("no tournament", { tournamentId })

            return;
        }

        this.activeTournamentPlayers = this.activeTournamentPlayers.filter(value => value.userID != playerId);

        tournamentMatcher.removePlayer(playerId);

        logger.info("player removed successfully")
    }

    static genFixtureCode(playerOneId, playerTwoId) {
        return crypto.createHash("sha256")
            .update(playerOneId + playerTwoId)
            .digest("base64")
            .slice(0, 6)
    }

    static async createFixture(tournamentId, playerOneId, playerTwoId) {
        try {
            const joiningCode = this.genFixtureCode(playerOneId, playerTwoId);

            const update = {
                joiningCode: joiningCode,
                tournamentId: tournamentId,
                players: [playerOneId, playerTwoId]
            }

            await TOURNAMENTFIXTURES.create(update);

            return joiningCode
        }
        catch (error) {
            logger.warn("failed to create a fixture", { tournamentId });

            throw error;
        }
    }

    // TODO: ADD TOURNAMENT CHECK
    static isValidTournament(tournamentId) {

        return true;
    }
}