import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    afterEach
} from "vitest";

// Mock GameManager before importing GameSessionManager
vi.mock("../GameManager.js");

import { gameSessionManager } from "../GameSessionManager.js";
import GameManager from "../GameManager.js";

describe("GameSessionManager", () => {
    let mockGameInstance;

    beforeEach(() => {
        // Mock GameManager instance
        mockGameInstance = {
            createTimer: vi.fn(),
            startTimer: vi.fn(),
            cancelTimer: vi.fn(),
            getTimeRemaining: vi.fn().mockReturnValue(10),
        };

        // Mock GameManager constructor to return mock instance
        GameManager.mockImplementation(() => mockGameInstance);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should create a new game session", () => {
        const lobbyCode = "lobby1";

        const game = gameSessionManager.createGame(lobbyCode);

        expect(game).toBe(mockGameInstance);
        expect(gameSessionManager.getGame(lobbyCode)).toBe(mockGameInstance);
    });

    it("should return null when creating a game with an existing lobby code", () => {
        const lobbyCode = "duplicateLobby";

        gameSessionManager.createGame(lobbyCode);

        const nullGame = gameSessionManager.createGame(lobbyCode);

        expect(null).toBeNull();
    });

    it("should return the correct game instance for a given lobby code", () => {
        const lobbyCode = "lobby2";

        gameSessionManager.createGame(lobbyCode);

        expect(gameSessionManager.getGame(lobbyCode)).toBe(mockGameInstance);
    });

    it("should remove a game session", () => {
        const lobbyCode = "lobby3";

        gameSessionManager.createGame(lobbyCode);
        gameSessionManager.removeGame(lobbyCode);

        expect(gameSessionManager.getGame(lobbyCode)).toBeUndefined();
    });
});
