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
    /**@type {import("socket.io").Namespace} */
    static tournamentNamespace;
    static activeTournamentPlayers = new Map([["test", [{ userID: "", socketID: "" }]]]);
    static tournamentWaitingRoom = new Map();
    static fixtures = new Map([["test", ["ndjsk", "njkds"]]]);
    static owners = new Map([["test", "djskdjnsk"]])
    static mainIo;

    /**
     * Activates the game logic for handling WebSocket connections.
     * 
     * @param {import("socket.io").Server} io - The main Socket.IO server instance.
     * @param {import("socket.io").Namespace} tournamentNamespace - The specific namespace for the Whot game.
     * @param {Array<import("./index.js").GameData>} mainRooms - A map of active game rooms.
     */
    static activate(io, tournamentNamespace, mainRooms) {
        this.tournamentNamespace = tournamentNamespace;
        this.mainIo = io;
        // this.tournamentWaitingRoom = new WaitingRoomManager(tournamentNamespace, this.activeTournamentPlayers, io);

        this.tournamentNamespace.on('connection', socket => {
            this.tournaments.delete("test");

            logger.info("user connected to tournament server");

            logger.info({ query: socket.handshake.query })
            logger.info({ query: socket.handshake.auth })

            const tournamentId = socket.handshake.query.tournamentId || socket.handshake.auth.tournamentId;
            const userId = socket.handshake.query.userId || socket.handshake.auth.userId;
            const isOwner = socket.handshake.query.isOwner || socket.handshake.auth.isOwner;

            const isTournamentCreator = isOwner && isOwner == "true";

            /* const tournamentId2 = socket.handshake.auth.tournamentId;
            const userId2 = socket.handshake.auth.userId;
            const isOwner2 = socket.handshake.auth.isOwner == "true"; */

            logger.info(`tournament: ${tournamentId}, user: ${userId}, isOwner: ${isOwner}`);

            if (!tournamentId) {
                logger.warn("no tournament id", { tournamentId });

                return;
            }

            // TODO: ADD TOURNAMENT CHECK
            if (!this.isValidTournament(tournamentId)) {
                logger.warn("not a valid tournament", { tournamentId });

                return;
            }

            if (!userId) {
                logger.warn("no user", { userId });

                return;
            }

            if (isTournamentCreator) {
                logger.info("a celebrity");

                this.owners.set(tournamentId, socket.id);

                // MAY BE CELEBRITY
                return;
            }

            this.addTournament(tournamentId);

            this.addPlayerToTournament(userId, tournamentId, socket);

            socket.on('join-tournament-waiting-room', async ({ userId: playerId, lobbyCode }) => {
                logger.info(`unto the waiting room: ${playerId}, ${lobbyCode}, ${tournamentId}`);

                const currentTournamentWaiting = this.tournamentWaitingRoom.get(tournamentId);

                if (!currentTournamentWaiting) {
                    logger.warn("no waiting room to join", { tournamentId })

                    return;
                }

                const result = await currentTournamentWaiting.joinWaitingRoom(socket, playerId, lobbyCode);

                if (!result) {
                    logger.warn("error joining tournament waiting room");

                    return;
                }


                const ownerSocketId = this.owners.get(tournamentId);

                if (ownerSocketId) {
                    this.tournamentNamespace.to(ownerSocketId).emit("total-players", currentTournamentWaiting.getTotalPlayersInWaitingRoom())
                }

                logger.info(`player joined tournament waiting room: ${playerId}, ${lobbyCode}, ${tournamentId}`);
            })

            socket.on('leave-tournament-waiting-room', async ({ userId: playerId, lobbyCode }) => {
                logger.info(`leaving the waiting room: ${playerId}, ${lobbyCode}, ${tournamentId}`);

                const currentTournamentWaiting = this.tournamentWaitingRoom.get(tournamentId);

                if (!currentTournamentWaiting) {
                    logger.warn("no waiting room to leave", { tournamentId });

                    return;
                }

                await currentTournamentWaiting.leaveWaitingRoom(playerId, lobbyCode);

                const ownerSocketId = this.owners.get(tournamentId);

                if (ownerSocketId) {
                    this.tournamentNamespace.to(ownerSocketId).emit("total-players", currentTournamentWaiting.getTotalPlayersInWaitingRoom())
                }

                logger.info(`player left tournament waiting room: ${playerId}, ${lobbyCode}, ${tournamentId}`);

                this.removePlayerFromTournament(playerId, tournamentId);
            })

            socket.on('tournament-fixture-completed', async (playerId) => {
                const tournamentMatcher = this.tournaments.get(tournamentId);

                if (!tournamentMatcher) {
                    logger.info("tournament matcher not found");

                    return;
                }

                tournamentMatcher.emit("playerMatchCompleted", { player: playerId });

                logger.info("tournament fixture completed");
            })

            socket.on("disconnect", async (_) => {
                logger.info("user disconnected from tournament namespace", socket.id);

                const currentTournamentWaiting = this.tournamentWaitingRoom.get(tournamentId);

                if (!currentTournamentWaiting) {
                    logger.warn("no waiting room to leave", { tournamentId });

                    return;
                }

                const lobbyCode = currentTournamentWaiting.getLobbyCode(userId);

                if (!lobbyCode) {
                    logger.warn("user not in lobby, may be the owner");

                    return;
                }

                await currentTournamentWaiting.leaveWaitingRoom(userId, lobbyCode);

                const ownerSocketId = this.owners.get(tournamentId);

                if (ownerSocketId) {
                    this.tournamentNamespace.to(ownerSocketId).emit("total-players", currentTournamentWaiting.getTotalPlayersInWaitingRoom())
                }

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

        const tournamentNamespace = this.tournamentNamespace;

        const currentTournamentPlayers = this.activeTournamentPlayers.get(tournamentId);

        if (!currentTournamentPlayers) {
            this.activeTournamentPlayers.set(tournamentId, [])
        }

        const tournamentActivePlayers = this.activeTournamentPlayers.get(tournamentId) || [];

        this.tournamentWaitingRoom.set(tournamentId, new WaitingRoomManager(tournamentNamespace, tournamentActivePlayers, this.mainIo));

        const maker = new MatchMaker();

        maker.on("match", async ({ playerA: playerOneId, playerB: playerTwoId }) => {

            logger.info(`successfully matched: ${playerOneId} ${playerTwoId}`)

            const playerOneSocketId = this.playersSocketIds.get(playerOneId);
            const playerTwoSocketId = this.playersSocketIds.get(playerTwoId);

            if (!playerOneSocketId || !playerTwoSocketId) {
                logger.warn(`no ids, ${playerOneId}: ${playerOneSocketId}, ${playerTwoId}: ${playerTwoSocketId}`);

                return;
            }

            logger.info(`successfully matched: ${playerOneSocketId} ${playerTwoSocketId}`)

            try {
                logger.info(`creating tournament fixture: ${tournamentId}, ${playerOneId} ${playerTwoId}`)

                const lobbyCode = await this.createFixture(tournamentId, playerOneId, playerTwoId);

                logger.info(`generated lobby code: ${lobbyCode}`)

                this.tournamentNamespace.to([playerOneSocketId, playerTwoSocketId]).emit("matched", { lobbyCode })

                this.fixtures.set(lobbyCode, [playerOneId, playerTwoId]);
            }
            catch (error) {
                logger.error(error);

                const key = [playerOneId, playerTwoId].sort().join('-')

                maker.matchedPairs.delete(key);

                this.tournamentNamespace.to([playerOneSocketId, playerTwoSocketId]).emit("error", { message: `error in creating a fixture` });
            }
        })

        this.tournaments.set(tournamentId, maker);
    }

    static addPlayerToTournament(playerId, tournamentId, socket) {
        if (!this.activatedTournaments.has(tournamentId)) {
            logger.warn("not activated", { tournamentId })

            return;
        }

        const tournamentMatcher = this.tournaments.get(tournamentId);

        if (!tournamentMatcher) {
            logger.warn("no tournament", { tournamentId })

            return;
        }

        const tournamentActivePlayers = this.activeTournamentPlayers.get(tournamentId) || [];

        tournamentActivePlayers.push({ userID: playerId, socketID: socket.id });

        // this.activeTournamentPlayers.push({ userID: playerId, socketID: socket.id });

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

        // this.activeTournamentPlayers = this.activeTournamentPlayers.filter(value => value.userID != playerId);

        const tournamentActivePlayers = this.activeTournamentPlayers.get(tournamentId) || [];

        const updatedPlayers = tournamentActivePlayers.filter(value => value.userID != playerId);

        this.activeTournamentPlayers.set(tournamentId, updatedPlayers);

        tournamentMatcher.removePlayer(playerId);

        logger.info("player removed successfully")
    }

    static genFixtureCode() {
        return crypto.randomBytes(4) // 4 bytes = 32 bits
            .toString("base64")        // base64 encodes it
            .replace(/[^a-zA-Z0-9]/g, '') // remove non-alphanumeric chars
            .slice(0, 6);              // get first 6 chars
    }


    static async createFixture(tournamentId, playerOneId, playerTwoId) {
        try {
            const joiningCode = this.genFixtureCode();

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