import GameManager from "./GameManager.js";

/**
 * Manages multiple game sessions, each identified by a unique lobby code.
 */
export default class GameSessionManager {
    constructor() {
        this.games = new Map([["test", new GameManager(1, () => console.log("test log"))]]); // Stores GameManager instances with lobby codes as keys
    }

    /**
     * Creates a new game session.
     * @param {string} lobbyCode - Unique lobby code for the game.
     * @param {number} duration - Duration of the game timer in milliseconds.
     * @param {Function} onTimerEnd - Function to call when the timer ends.
     */
    createGame(lobbyCode, duration, onTimerEnd) {
        if (this.games.has(lobbyCode)) {
            throw new Error(`Game with lobby code ${lobbyCode} already exists.`);
        }

        const game = new GameManager(duration, () => {
            onTimerEnd();
            this.removeGame(lobbyCode); // Remove game when timer ends
        });

        this.games.set(lobbyCode, game);
    }

    /**
     * Starts the game associated with the given lobby code.
     * @param {string} lobbyCode - The lobby code of the game.
     */
    startGame(lobbyCode) {
        const game = this.games.get(lobbyCode);
        if (!game) throw new Error(`No game found with lobby code ${lobbyCode}.`);
        game.startTimer();
    }

    /**
     * Cancels the game associated with the given lobby code.
     * @param {string} lobbyCode - The lobby code of the game.
     */
    cancelGame(lobbyCode) {
        const game = this.games.get(lobbyCode);
        if (!game) throw new Error(`No game found with lobby code ${lobbyCode}.`);
        game.cancel();
        this.games.delete(lobbyCode);
    }

    /**
     * Removes a game from the manager.
     * @param {string} lobbyCode - The lobby code of the game to remove.
     */
    removeGame(lobbyCode) {
        this.games.delete(lobbyCode);
    }
}