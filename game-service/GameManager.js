import GameTimer from "./GameTimer.js";

/**
 * Represents a game instance that manages its own timer.
 */
export default class GameManager {
    /**
     * Creates a game timer.
     * 
     * @param {number} duration - The game timer duration in milliseconds.
     * @param {Function} onTimerEnd - Function to call when the timer ends.
     */
    createTimer(duration, onTimerEnd) {
        this.timer = new GameTimer(duration, onTimerEnd)
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
    cancelTimer() {
        this.timer.cancel();
    }

    /**
    * Gets the time remaining in seconds.
    * @returns {number} Remaining time in seconds.
    */
    getTimeRemaining() {
        return this.timer.getTimeRemaining();
    }
}