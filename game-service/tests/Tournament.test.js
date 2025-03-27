import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    afterEach
} from "vitest";

// --- Mocks ---

// Mock MatchMaker
vi.mock("../MatchMaker.js", () => {
    return {
        default: vi.fn(() => {
            return {
                on: vi.fn(),
                addPlayer: vi.fn(),
                removePlayer: vi.fn(),
                emit: vi.fn(),
            };
        }),
    };
});

// Mock WaitingRoomManager
vi.mock("../WaitingRoomManager.js", () => {
    return {
        default: vi.fn(() => {
            return {
                joinWaitingRoom: vi.fn().mockResolvedValue(),
                leaveWaitingRoom: vi.fn().mockResolvedValue(),
                getTotalPlayersInWaitingRoom: vi.fn().mockReturnValue(0),
                getLobbyCode: vi.fn().mockReturnValue(null),
            };
        }),
    };
});

// Mock TOURNAMENTFIXTURES
vi.mock("../models/tournament-fixtures.model.js", () => {
    return {
        default: {
            create: vi.fn().mockResolvedValue(),
        },
    };
});

// Mock logger (we don't verify logging)
vi.mock("./config/winston.config.js", () => {
    return {
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

import MatchMaker from "../MatchMaker.js";
import TOURNAMENTFIXTURES from "../models/tournament-fixtures.model.js";

// Now import Tournament (which is a default export from some module file, for example "Tournament.js")
import Tournament from "./Tournament.js";

// Since Tournament is a static class, we need to clear/adjust its static properties between tests.
beforeEach(() => {
    // Reset static maps/sets to a known state.
    Tournament.tournaments = new Map([["test", new MatchMaker()]]);
    Tournament.playersSocketIds = new Map([["test", "jskdjsk"]]);
    Tournament.activatedTournaments = new Set();
    Tournament.activeTournamentPlayers = new Map([["test", [{ userID: "", socketID: "" }]]]);
    Tournament.tournamentWaitingRoom = new Map();
    Tournament.fixtures = new Map([["test", ["ndjsk", "njkds"]]]);
    Tournament.owners = new Map([["test", "djskdjnsk"]]);
    Tournament.tournamentNamespace = undefined;
    Tournament.mainIo = undefined;
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("Tournament static methods", () => {
    describe("genFixtureCode", () => {
        it("should return a 6-character fixture code", () => {
            const code = Tournament.genFixtureCode("player1", "player2");
            expect(code).toHaveLength(6);
        });
    });

    describe("createFixture", () => {
        it("should create a fixture and return the joining code", async () => {
            // Call createFixture; since crypto is real, we know it returns a 6-char code.
            const code = await Tournament.createFixture("tournament1", "player1", "player2");

            // Verify TOURNAMENTFIXTURES.create was called with expected update object
            const expectedUpdate = {
                joiningCode: code,
                tournamentId: "tournament1",
                players: ["player1", "player2"],
            };
            const fixturesModel = TOURNAMENTFIXTURES;
            expect(fixturesModel.create).toHaveBeenCalledWith(expectedUpdate);
            expect(code).toHaveLength(6);
        });

        it("should throw an error if fixture creation fails", async () => {
            const fixturesModel = TOURNAMENTFIXTURES;
            fixturesModel.create.mockRejectedValueOnce(new Error("create failed"));

            await expect(
                Tournament.createFixture("tournament1", "player1", "player2")
            ).rejects.toThrow("create failed");
        });
    });

    describe("addTournament", () => {
        it("should activate a tournament if not already activated", () => {
            // Setup: ensure tournament is not activated yet
            expect(Tournament.activatedTournaments.has("tourny1")).toBeFalsy();

            // We need to fake tournamentNamespace and activeTournamentPlayers.
            const fakeNamespace = { to: vi.fn() };
            Tournament.tournamentNamespace = fakeNamespace;
            // Ensure activeTournamentPlayers for this tournament is not set.
            Tournament.activeTournamentPlayers.delete("tourny1");

            Tournament.addTournament("tourny1");

            // Check that tournament was added to activatedTournaments.
            expect(Tournament.activatedTournaments.has("tourny1")).toBeTruthy();
            // Check that activeTournamentPlayers now has an empty array.
            expect(Tournament.activeTournamentPlayers.get("tourny1")).toEqual([]);
            // Check that a waiting room was created.
            expect(Tournament.tournamentWaitingRoom.has("tourny1")).toBeTruthy();
            // Check that tournaments has a new MatchMaker instance for "tourny1"
            expect(Tournament.tournaments.has("tourny1")).toBeTruthy();
        });

        it("should do nothing if tournament is already activated", () => {
            Tournament.activatedTournaments.add("tourny1");
            const prevActivatedSize = Tournament.activatedTournaments.size;

            Tournament.addTournament("tourny1");

            // Should not add duplicate activation.
            expect(Tournament.activatedTournaments.size).toBe(prevActivatedSize);
        });
    });

    describe("addPlayerToTournament", () => {
        it("should add a player if tournament is activated and tournament exists", () => {
            // Setup an activated tournament with a tournamentMatcher
            Tournament.activatedTournaments.add("tourny1");
            Tournament.tournaments.set("tourny1", {
                addPlayer: vi.fn(),
            });
            Tournament.activeTournamentPlayers.set("tourny1", []);
            Tournament.playersSocketIds = new Map();

            // Fake socket
            const fakeSocket = { id: "socket123" };

            Tournament.addPlayerToTournament("player1", "tourny1", fakeSocket);

            // Verify activeTournamentPlayers got updated.
            expect(Tournament.activeTournamentPlayers.get("tourny1")).toEqual([
                { userID: "player1", socketID: "socket123" },
            ]);
            // Verify playersSocketIds updated.
            expect(Tournament.playersSocketIds.get("player1")).toBe("socket123");
            // Verify tournamentMatcher.addPlayer was called.
            const tournamentMatcher = Tournament.tournaments.get("tourny1");
            expect(tournamentMatcher.addPlayer).toHaveBeenCalledWith("player1");
        });

        it("should warn and do nothing if tournament is not activated", () => {
            // Not activated
            Tournament.activatedTournaments.delete("tourny1");
            Tournament.tournaments.set("tourny1", {
                addPlayer: vi.fn(),
            });
            Tournament.activeTournamentPlayers.set("tourny1", []);

            const fakeSocket = { id: "socket123" };

            Tournament.addPlayerToTournament("player1", "tourny1", fakeSocket);

            // activeTournamentPlayers should remain unchanged
            expect(Tournament.activeTournamentPlayers.get("tourny1")).toEqual([]);
        });
    });

    describe("removePlayerFromTournament", () => {
        it("should remove a player if tournament is activated and tournament exists", () => {
            Tournament.activatedTournaments.add("tourny1");
            // Setup active players list with one player.
            Tournament.activeTournamentPlayers.set("tourny1", [
                { userID: "player1", socketID: "socket123" },
                { userID: "player2", socketID: "socket456" },
            ]);
            // Set tournament matcher with removePlayer
            Tournament.tournaments.set("tourny1", {
                removePlayer: vi.fn(),
            });

            Tournament.removePlayerFromTournament("player1", "tourny1");

            // activeTournamentPlayers should no longer contain player1.
            expect(Tournament.activeTournamentPlayers.get("tourny1")).toEqual([
                { userID: "player2", socketID: "socket456" },
            ]);
            // Verify tournamentMatcher.removePlayer was called.
            const tournamentMatcher = Tournament.tournaments.get("tourny1");
            expect(tournamentMatcher.removePlayer).toHaveBeenCalledWith("player1");
        });
    });
});

describe("Tournament.activate (Socket.IO simulation)", () => {
    let fakeIo, fakeNamespace, fakeSocket;

    beforeEach(() => {
        // Setup fake Socket.IO objects.
        fakeSocket = {
            id: "socket1",
            handshake: {
                query: {
                    tournamentId: "tourny1",
                    userId: "player1",
                    isOwner: false,
                },
            },
            on: vi.fn(),
        };

        fakeNamespace = {
            on: vi.fn((event, callback) => {
                // Immediately store the callback for "connection" event.
                if (event === "connection") {
                    // We'll call this callback manually in tests.
                    fakeNamespace.connectionCallback = callback;
                }
            }),
            to: vi.fn(() => ({ emit: vi.fn() })),
        };

        fakeIo = { /* not used directly in tests */ };

        // Reset some static properties before activate
        Tournament.tournaments = new Map([["test", new MatchMaker()]]);
        Tournament.activatedTournaments = new Set();
        Tournament.activeTournamentPlayers = new Map();
        Tournament.playersSocketIds = new Map();
        Tournament.owners = new Map();
        Tournament.tournamentWaitingRoom = new Map();
    });

    it("should handle a connection for a non-owner", () => {
        // Spy on addTournament and addPlayerToTournament
        const addTournamentSpy = vi.spyOn(Tournament, "addTournament").mockImplementation(() => { });
        const addPlayerSpy = vi.spyOn(Tournament, "addPlayerToTournament").mockImplementation(() => { });

        Tournament.activate(fakeIo, fakeNamespace, []);

        // Simulate a connection event
        fakeNamespace.connectionCallback(fakeSocket);

        // It should remove the 'test' tournament from the map.
        expect(Tournament.tournaments.has("test")).toBeFalsy();
        // And call addTournament and addPlayerToTournament with the provided tournamentId and userId.
        expect(addTournamentSpy).toHaveBeenCalledWith("tourny1");
        expect(addPlayerSpy).toHaveBeenCalledWith("player1", "tourny1", fakeSocket);

        // Also, socket event listeners should have been registered.
        expect(fakeSocket.on).toHaveBeenCalled(); // At least one event listener was added
    });

    it("should handle a connection for an owner", () => {
        // For an owner, set isOwner to true.
        fakeSocket.handshake.query.isOwner = true;
        Tournament.activate(fakeIo, fakeNamespace, []);
        fakeNamespace.connectionCallback(fakeSocket);

        // In owner case, it should set the owner mapping and return early.
        expect(Tournament.owners.get("tourny1")).toBe(fakeSocket.id);
    });

    it("should handle join-tournament-waiting-room event", async () => {
        // Prepare a fake waiting room manager with joinWaitingRoom implemented.
        const fakeWaitingRoom = {
            joinWaitingRoom: vi.fn().mockResolvedValue(),
            getTotalPlayersInWaitingRoom: vi.fn().mockReturnValue(5),
        };
        Tournament.tournamentWaitingRoom.set("tourny1", fakeWaitingRoom);
        Tournament.owners = new Map([["tourny1", "ownerSocketId"]]);
        // Fake the namespace.to() to return an object with an emit function.
        fakeNamespace.to = vi.fn(() => ({ emit: vi.fn() }));

        Tournament.activate(fakeIo, fakeNamespace, []);
        fakeNamespace.connectionCallback(fakeSocket);

        // Retrieve the registered callback for 'join-tournament-waiting-room'
        const joinCallback = fakeSocket.on.mock.calls.find(call => call[0] === 'join-tournament-waiting-room')[1];

        // Call the event callback.
        await joinCallback("player1", "lobbyCode1");

        // Verify waiting room's joinWaitingRoom was called.
        expect(fakeWaitingRoom.joinWaitingRoom).toHaveBeenCalledWith(fakeSocket, "player1", "lobbyCode1");
        // Verify that an emit was sent to the owner with total players.
        expect(fakeNamespace.to).toHaveBeenCalledWith("ownerSocketId");
    });

    it("should handle disconnect event", async () => {
        // Setup: Create a fake waiting room that returns a lobby code for the user.
        const fakeWaitingRoom = {
            leaveWaitingRoom: vi.fn().mockResolvedValue(),
            getTotalPlayersInWaitingRoom: vi.fn().mockReturnValue(2),
            getLobbyCode: vi.fn().mockReturnValue("lobbyCode1"),
        };
        Tournament.tournamentWaitingRoom.set("tourny1", fakeWaitingRoom);
        Tournament.owners = new Map([["tourny1", "ownerSocketId"]]);
        Tournament.activeTournamentPlayers.set("tourny1", [{ userID: "player1", socketID: "socket1" }]);

        fakeNamespace.to = vi.fn(() => ({ emit: vi.fn() }));

        Tournament.activate(fakeIo, fakeNamespace, []);
        fakeNamespace.connectionCallback(fakeSocket);

        // Retrieve the disconnect callback
        const disconnectCallback = fakeSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];

        await disconnectCallback();

        // Verify that leaveWaitingRoom was called with userId and lobby code.
        expect(fakeWaitingRoom.leaveWaitingRoom).toHaveBeenCalledWith("player1", "lobbyCode1");
    });
});
