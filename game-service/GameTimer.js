/**
 * @typedef {() => void} TimerCallback
 */

/**
 * A class representing a game timer.
 */
export default class GameTimer {
    /**
     * @type {NodeJS.Timeout | null}
     */
    timeout = null;

    /**
     * @type {number}
     */
    duration;

    /**
     * @type {TimerCallback}
     */
    callback;

    /**
     * Creates a new GameTimer instance.
     * @param {number} duration - The duration of the timer in milliseconds.
     * @param {TimerCallback} callback - The callback function to execute when the timer finishes.
     */
    constructor(duration, callback) {
        this.duration = duration;
        this.callback = callback;
        this.startTime = null; // Store when the timer starts
    }

    /**
     * Starts the timer. If the timer is already running, this method does nothing.
     */
    start() {
        if (this.timeout) return; // Prevent multiple starts

        this.startTime = Date.now();

        this.timeout = setTimeout(() => {
            this.callback();
            this.timeout = null; // Reset after execution
            this.startTime = null;
        }, this.duration);

        this.timeout.unref();
    }

    /**
     * Cancels the timer if it is running.
     */
    cancel() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
            this.startTime = null;
        }
    }

    /**
     * Gets the remaining time in seconds.
     * @returns {number} Remaining time in seconds, or 0 if expired.
     */
    getTimeRemaining() {
        if (!this.startTime) return 0; // Timer not started or already ended

        const elapsed = Date.now() - this.startTime;

        const remaining = Math.max(0, this.duration - elapsed);

        return Math.floor(remaining / 1000); // Convert ms to seconds
    }
}