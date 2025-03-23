import GameTimer from "./GameTimer.js";

/**
 * Represents a game instance that manages its own timer.
 */
export default class GameManager {
    /**
     * Creates a new Game instance.
     * @param {number} duration - The game timer duration in milliseconds.
     * @param {Function} onTimerEnd - Function to call when the timer ends.
     */
    constructor(duration, onTimerEnd) {
        this.timer = new GameTimer(duration, onTimerEnd);
    }

    /**
     * Starts the game timer.
     */
    startTimer() {
        this.timer.start();
    }

    /**
     * Cancels the game timer.
     */
    cancel() {
        this.timer.cancel();
    }
}