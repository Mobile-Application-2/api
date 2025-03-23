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
    }

    /**
     * Starts the timer. If the timer is already running, this method does nothing.
     */
    start() {
        if (this.timeout) return; // Prevent multiple starts
        this.timeout = setTimeout(() => {
            this.callback();
            this.timeout = null; // Reset after execution
        }, this.duration);
    }

    /**
     * Cancels the timer if it is running.
     */
    cancel() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }
}