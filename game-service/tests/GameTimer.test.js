import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    afterEach
} from "vitest";

import GameTimer from "../GameTimer.js";

describe("GameTimer", () => {
    let callback;
    let timer;

    beforeEach(() => {
        vi.useFakeTimers();

        callback = vi.fn();

        timer = new GameTimer(2000, callback); // 2 seconds duration
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should start the timer and execute callback after duration", () => {
        timer.start();

        expect(timer.timeout).not.toBeNull();

        vi.advanceTimersByTime(2000);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(timer.timeout).toBeNull();
    });

    it("should not start a new timer if already running", () => {
        timer.start();

        const firstTimeout = timer.timeout;

        timer.start();

        expect(timer.timeout).toBe(firstTimeout);
    });

    it("should cancel the timer before execution", () => {
        timer.start();
        timer.cancel();

        expect(timer.timeout).toBeNull();

        vi.advanceTimersByTime(2000);

        expect(callback).not.toHaveBeenCalled();
    });

    it("should return the correct remaining time", () => {
        timer.start();

        vi.advanceTimersByTime(1000);

        expect(timer.getTimeRemaining()).toBe(1);

        vi.advanceTimersByTime(1000);

        expect(timer.getTimeRemaining()).toBe(0);
    });

    it("should return 0 if timer was never started", () => {
        expect(timer.getTimeRemaining()).toBe(0);
    });

    it("should return 0 if timer has expired", () => {
        timer.start();

        vi.advanceTimersByTime(2000);
        
        expect(timer.getTimeRemaining()).toBe(0);
    });
});
