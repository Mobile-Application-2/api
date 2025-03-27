import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    afterEach
} from "vitest";


import GameManager from "../GameManager.js";
import GameTimer from "../GameTimer.js";

vi.mock("../GameTimer.js"); // Mock GameTimer class

describe("GameManager", () => {
    let gameManager;
    let onTimerEnd;
    let mockGameTimerInstance;

    beforeEach(() => {
        onTimerEnd = vi.fn();

        // Mock GameTimer instance methods
        mockGameTimerInstance = {
            start: vi.fn(),
            cancel: vi.fn(),
            getTimeRemaining: vi.fn().mockReturnValue(10),
        };

        // Make GameTimer constructor return our mocked instance
        GameTimer.mockImplementation(() => mockGameTimerInstance);

        gameManager = new GameManager();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should create a timer", () => {
        gameManager.createTimer(5000, onTimerEnd);

        expect(GameTimer).toHaveBeenCalledTimes(1);
        expect(GameTimer).toHaveBeenCalledWith(5000, onTimerEnd);
        expect(gameManager.timer).toBe(mockGameTimerInstance);
    });

    it("should start the timer", () => {
        gameManager.createTimer(5000, onTimerEnd);

        gameManager.startTimer();

        expect(mockGameTimerInstance.start).toHaveBeenCalledTimes(1);
    });

    it("should cancel the timer", () => {
        gameManager.createTimer(5000, onTimerEnd);

        gameManager.cancelTimer();

        expect(mockGameTimerInstance.cancel).toHaveBeenCalledTimes(1);
    });

    it("should return the remaining time", () => {
        gameManager.createTimer(5000, onTimerEnd);

        const remainingTime = gameManager.getTimeRemaining();

        expect(mockGameTimerInstance.getTimeRemaining).toHaveBeenCalledTimes(1);
        expect(remainingTime).toBe(10); // Mocked return value
    });
});
