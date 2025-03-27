import GameTimer from "./GameTimer.js";
import { logger } from "./config/winston.config.js";

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
        if(!this.timer) {
            logger.warn("no timer created");

            return;
        }

        this.timer.start();
    }

    /**
     * Cancels the game timer.
     */
    cancelTimer() {
        if(!this.timer) {
            logger.warn("no timer created");

            return;
        }

        this.timer.cancel();
    }

    /**
    * Gets the time remaining in seconds.
    * @returns {number | null} Remaining time in seconds.
    */
    getTimeRemaining() {
        if(!this.timer) {
            logger.warn("no timer created");

            return null;
        }

        return this.timer.getTimeRemaining();
    }
}