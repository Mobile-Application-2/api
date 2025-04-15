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
     * @param {Array<GameData>} mainRooms - A map of active game rooms.
     */
    static activate(io, tournamentNamespace, mainRooms) {
        this.tournamentNamespace = tournamentNamespace;
        this.mainIo = io;
        // this.tournamentWaitingRoom = new WaitingRoomManager(tournamentNamespace, this.activeTournamentPlayers, io);

        this.tournamentNamespace.on('connection', socket => {
            this.tournaments.delete("test");

            logger.info("user connected to tournament server");

            logger.info("data: ", {data: socket.handshake.query})

            const tournamentId = socket.handshake.query.tournamentId;
            const userId = socket.handshake.query.userId;
            const isOwner = socket.handshake.query.isOwner;

            if(!tournamentId) {
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

            if (isOwner) {
                logger.info("a celebrity");

                this.owners.set(tournamentId, socket.id);

                // MAY BE CELEBRITY
                return;
            }

            this.addTournament(tournamentId);

            this.addPlayerToTournament(userId, tournamentId, socket);

            socket.on('join-tournament-waiting-room', async (playerId, lobbyCode) => {
                const currentTournamentWaiting = this.tournamentWaitingRoom.get(tournamentId);

                if (!currentTournamentWaiting) {
                    logger.warn("no waiting room to join", { tournamentId })

                    return;
                }

                await currentTournamentWaiting.joinWaitingRoom(socket, playerId, lobbyCode);

                const ownerSocketId = this.owners.get(tournamentId);

                if (ownerSocketId) {
                    this.tournamentNamespace.to(ownerSocketId).emit("total-players", currentTournamentWaiting.getTotalPlayersInWaitingRoom())
                }

                logger.info("player joined tournament waiting room");
            })

            socket.on('leave-tournament-waiting-room', async (playerId, lobbyCode) => {
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

                logger.info("player left tournament waiting room");

                this.removePlayerFromTournament(userId, tournamentId);
            })

            socket.on('tournament-fixture-completed', async (playerId) => {
                const tournamentMatcher = this.tournaments.get(tournamentId);

                if(!tournamentMatcher) {
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

        if(!currentTournamentPlayers) {
            this.activeTournamentPlayers.set(tournamentId, [])
        }

        this.tournamentWaitingRoom.set(tournamentId, new WaitingRoomManager(tournamentNamespace, this.activeTournamentPlayers.get(tournamentId), this.mainIo));

        const maker = new MatchMaker();

        maker.on("match", async ({ playerOneId, playerTwoId }) => {
            const playerOneSocketId = this.playersSocketIds.get(playerOneId);
            const playerTwoSocketId = this.playersSocketIds.get(playerTwoId);

            try {
                const lobbyCode = await this.createFixture(tournamentId, playerOneId, playerTwoId);

                this.tournamentNamespace.to([playerOneSocketId, playerTwoSocketId]).emit("matched", { lobbyCode })

                this.fixtures.set(lobbyCode, [playerOneId, playerTwoId]);
            }
            catch (error) {
                logger.error(error);

                this.tournamentNamespace.to([playerOneSocketId, playerTwoSocketId]).emit("error", { message: `something went wrong with matching` });
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

        this.activeTournamentPlayers.get(tournamentId).push({ userID: playerId, socketID: socket.id });

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

        const updatedPlayers = this.activeTournamentPlayers.get(tournamentId).filter(value => value.userID != playerId);

        this.activeTournamentPlayers.set(tournamentId, updatedPlayers);

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