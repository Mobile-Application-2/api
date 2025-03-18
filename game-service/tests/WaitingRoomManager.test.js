import { jest } from "@jest/globals"

// Mock dependencies
jest.unstable_mockModule("../models/tournament-fixtures.model.js", () => ({
    default: {
        findOne: jest.fn(), // Mock the findOne method
    },
}));

// jest.unstable_mockModule('../config/winston.config.js', () => ({
//     logger: {
//         info: jest.fn(),
//         warn: jest.fn(),
//         error: jest.fn()
//     }
// }));

// import WaitingRoomManager from "../WaitingRoomManager.js";
// import TOURNAMENTFIXTURES from '../models/tournament-fixtures.model.js';

// Dynamically import the modules after mocking
const WaitingRoomManager = (await import("../WaitingRoomManager.js")).default;
const TOURNAMENTFIXTURES = (await import("../models/tournament-fixtures.model.js")).default;


describe('WaitingRoomManager', () => {
    let waitingRoomManager;
    let mockIo;
    let mockSocket;
    let activePlayers;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        jest.resetAllMocks();

        // Mock Socket.IO server
        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        };

        // Mock socket
        mockSocket = {
            id: 'socket-123',
            emit: jest.fn()
        };

        // Mock active players
        activePlayers = [
            { socketID: 'socket-123', userID: 'player-1' },
            { socketID: 'socket-456', userID: 'player-2' }
        ];

        // Create instance of WaitingRoomManager
        waitingRoomManager = new WaitingRoomManager(mockIo, activePlayers);
    });

    describe('constructor', () => {
        test('should initialize with proper properties', () => {
            expect(waitingRoomManager.io).toBe(mockIo);
            expect(waitingRoomManager.activePlayers).toEqual(activePlayers);
            expect(waitingRoomManager.lobbyCodeWaiting).toBeInstanceOf(Map);
            expect(waitingRoomManager.timers).toBeInstanceOf(Map);
        });
    });

    describe('getFixture', () => {
        test('should return fixture when found', async () => {
            const mockFixture = {
                _id: 'fixture-1',
                joiningCode: 'lobby-123',
                players: ['player-1', 'player-2']
            };

            TOURNAMENTFIXTURES.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockFixture)
            });

            const result = await waitingRoomManager.getFixture('lobby-123', 'player-1');

            expect(TOURNAMENTFIXTURES.findOne).toHaveBeenCalledWith({ joiningCode: 'lobby-123' });
            expect(result).toEqual(mockFixture);
        });

        test('should return null when error occurs', async () => {
            TOURNAMENTFIXTURES.findOne.mockReturnValue({
                lean: jest.fn().mockRejectedValue(new Error('Database error'))
            });

            const result = await waitingRoomManager.getFixture('lobby-123', 'player-1');

            expect(result).toBeNull();
        });
    });

    describe('isActivePlayer', () => {
        test('should return true when player is active', () => {
            const result = waitingRoomManager.isActivePlayer('player-1');
            expect(result).toBe(true);
        });

        test('should return false when player is not active', () => {
            const result = waitingRoomManager.isActivePlayer('non-existent-player');
            expect(result).toBe(false);
        });
    });

    describe('addPlayerToLobbyCodeWaiting', () => {
        test('should create new lobby when lobby does not exist', () => {
            waitingRoomManager.addPlayerToLobbyCodeWaiting('new-lobby', 'player-1', 'socket-123');

            expect(waitingRoomManager.lobbyCodeWaiting.get('new-lobby')).toEqual([
                { socketID: 'socket-123', userID: 'player-1' }
            ]);
        });

        test('should add player to existing lobby', () => {
            // Setup existing lobby
            waitingRoomManager.lobbyCodeWaiting.set('existing-lobby', [
                { socketID: 'socket-123', userID: 'player-1' }
            ]);

            waitingRoomManager.addPlayerToLobbyCodeWaiting('existing-lobby', 'player-2', 'socket-456');

            expect(waitingRoomManager.lobbyCodeWaiting.get('existing-lobby')).toEqual([
                { socketID: 'socket-123', userID: 'player-1' },
                { socketID: 'socket-456', userID: 'player-2' }
            ]);
        });
    });

    describe('getLobbyWaitingSocketsIds', () => {
        test('should return undefined when lobby does not exist', () => {
            const result = waitingRoomManager.getLobbyWaitingSocketsIds('non-existent-lobby');
            expect(result).toBeUndefined();
        });

        test('should return undefined when lobby has less than 2 players', () => {
            waitingRoomManager.lobbyCodeWaiting.set('lonely-lobby', [
                { socketID: 'socket-123', userID: 'player-1' }
            ]);

            const result = waitingRoomManager.getLobbyWaitingSocketsIds('lonely-lobby');
            expect(result).toBeUndefined();
        });

        test('should return array of socket IDs when lobby has at least 2 players', () => {
            waitingRoomManager.lobbyCodeWaiting.set('full-lobby', [
                { socketID: 'socket-123', userID: 'player-1' },
                { socketID: 'socket-456', userID: 'player-2' }
            ]);

            const result = waitingRoomManager.getLobbyWaitingSocketsIds('full-lobby');
            expect(result).toEqual(['socket-123', 'socket-456']);
        });
    });

    describe('startOpponentTimer', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.clearAllTimers(); // Clear all fake timers
            jest.useRealTimers(); // Restore real timers
        });

        test('should clear existing timer for opponent if one exists', () => {
            const mockTimeout = setTimeout(() => { }, 1000);
            waitingRoomManager.timers.set('player-2', mockTimeout);

            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            waitingRoomManager.startOpponentTimer(mockSocket, 'lobby-123', 'player-2');

            expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimeout);
        });

        test('should set timer for opponent', () => {
            waitingRoomManager.startOpponentTimer(mockSocket, 'lobby-123', 'player-2');

            expect(waitingRoomManager.timers.has('player-2')).toBe(true);
        });

        test('should send notification and clean up if opponent still not active after timeout', () => {
            // Mock isActivePlayer to return false
            jest.spyOn(waitingRoomManager, 'isActivePlayer').mockReturnValue(false);

            waitingRoomManager.startOpponentTimer(mockSocket, 'lobby-123', 'player-2');

            // Fast-forward time
            jest.advanceTimersByTime(120000);

            // expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id);
            expect(mockIo.emit).toHaveBeenCalledWith('opponent-not-available');
            expect(waitingRoomManager.timers.has('player-2')).toBe(false);
        });

        test('should clean up timer if opponent becomes active before timeout', () => {
            // Mock isActivePlayer to return true
            jest.spyOn(waitingRoomManager, 'isActivePlayer').mockReturnValue(true);

            waitingRoomManager.startOpponentTimer(mockSocket, 'lobby-123', 'player-2');

            // Fast-forward time
            jest.advanceTimersByTime(120000);

            expect(mockIo.emit).not.toHaveBeenCalled();
            expect(waitingRoomManager.timers.has('player-2')).toBe(false);
        });
    });

    describe('joinWaitingRoom', () => {
        beforeEach(() => {
            // Mock methods
            jest.spyOn(waitingRoomManager, 'getFixture');
            jest.spyOn(waitingRoomManager, 'addPlayerToLobbyCodeWaiting');
            jest.spyOn(waitingRoomManager, 'isActivePlayer');
            jest.spyOn(waitingRoomManager, 'startOpponentTimer');
            jest.spyOn(waitingRoomManager, 'getLobbyWaitingSocketsIds');
        });

        test('should emit error when fixture not found', async () => {
            waitingRoomManager.getFixture.mockResolvedValue(null);

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'non-existent-lobby');

            expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Fixture not found' });
            expect(waitingRoomManager.addPlayerToLobbyCodeWaiting).not.toHaveBeenCalled();
        });

        test('should emit error when opponent not found in fixture', async () => {
            const mockFixture = {
                players: ['player-1'] // Only one player, no opponent
            };
            waitingRoomManager.getFixture.mockResolvedValue(mockFixture);

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Opponent not found' });
        });

        test('should start timer when opponent is not active', async () => {
            const mockFixture = {
                players: ['player-1', 'player-3'] // player-3 is not in activePlayers
            };
            waitingRoomManager.getFixture.mockResolvedValue(mockFixture);
            waitingRoomManager.isActivePlayer.mockReturnValue(false);

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            // expect(waitingRoomManager.startOpponentTimer).toHaveBeenCalledWith(mockSocket, 'lobby-123', 'player-3');
            expect(mockSocket.emit).toHaveBeenCalledWith('opponent-not-active', { message: 'Opponent Not Active, Starting Timer' });
        });

        test('should emit error when not enough players to start game', async () => {
            const mockFixture = {
                players: ['player-1', 'player-2']
            };
            waitingRoomManager.getFixture.mockResolvedValue(mockFixture);
            waitingRoomManager.isActivePlayer.mockReturnValue(true);
            waitingRoomManager.getLobbyWaitingSocketsIds.mockReturnValue(undefined);

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not enough players to start game' });
        });

        test('should start tournament fixture when all conditions met', async () => {
            const mockFixture = {
                players: ['player-1', 'player-2']
            };
            const socketIds = ['socket-123', 'socket-456'];

            waitingRoomManager.getFixture.mockResolvedValue(mockFixture);
            waitingRoomManager.isActivePlayer.mockReturnValue(true);
            waitingRoomManager.getLobbyWaitingSocketsIds.mockReturnValue(socketIds);

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            expect(mockIo.to).toHaveBeenCalledWith(socketIds);
            expect(mockIo.emit).toHaveBeenCalledWith('start-tournament-fixture');
        });

        test('should handle exceptions gracefully', async () => {
            waitingRoomManager.getFixture.mockRejectedValue(new Error('Unexpected error'));

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            // No unhandled exception should occur, and logger should be called
            // We're testing that the function completes without throwing
        });
    });

    describe('leaveWaitingRoom', () => {
        test('should remove player from the lobby', () => {
            // Add a player to the lobby
            waitingRoomManager.addPlayerToLobbyCodeWaiting('lobby-123', 'player-1', 'socket-123');
            waitingRoomManager.addPlayerToLobbyCodeWaiting('lobby-123', 'player-2', 'socket-456');

            // Player leaves the lobby
            waitingRoomManager.leaveWaitingRoom('player-1', 'lobby-123');

            // Check if the player is removed
            const lobby = waitingRoomManager.lobbyCodeWaiting.get('lobby-123');
            expect(lobby).toEqual([{ socketID: 'socket-456', userID: 'player-2' }]);
        });

        // test('should delete the lobby if it becomes empty', () => {
        //     // Add a player to the lobby
        //     waitingRoomManager.addPlayerToLobbyCodeWaiting('lobby-123', 'player-1', 'socket-123');

        //     // Player leaves the lobby
        //     waitingRoomManager.leaveWaitingRoom('player-1', 'lobby-123');

        //     // Check if the lobby is deleted
        //     const lobby = waitingRoomManager.lobbyCodeWaiting.get('lobby-123');
        //     expect(lobby).toBeUndefined();
        // });

        test('should cancel the timer for the opponent if the player leaves', () => {
            // Add a player to the lobby
            // waitingRoomManager.addPlayerToLobbyCodeWaiting('lobby-123', 'player-1', 'socket-123');
            waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            // Start a timer for the opponent
            const mockTimeout = setTimeout(() => { }, 120000);
            mockTimeout.unref();
            waitingRoomManager.timers.set('player-2', mockTimeout);

            // Player leaves the lobby
            waitingRoomManager.leaveWaitingRoom('player-1', 'lobby-123');

            // console.log("mock test keys (after leaveWaitingRoom):", waitingRoomManager.timers.keys());

            // Check if the timer is canceled
            expect(waitingRoomManager.timers.has('player-2')).toBe(false);
        });

        test('should not throw an error if the lobby does not exist', () => {
            // Player leaves a non-existent lobby
            expect(() => {
                waitingRoomManager.leaveWaitingRoom('player-1', 'non-existent-lobby');
            }).not.toThrow();
        });
    });

    // Legacy test for checkOpponentOnlineState which seems to be unused
    describe('checkOpponentOnlineState', () => {
        test('should return true when opponent is active', () => {
            const result = waitingRoomManager.checkOpponentOnlineState('player-2');
            expect(result).toBe(true);
        });

        test('should return false when opponent is not active', () => {
            const result = waitingRoomManager.checkOpponentOnlineState('non-existent-player');
            expect(result).toBe(false);
        });
    });
});