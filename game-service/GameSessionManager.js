import GameManager from "./GameManager.js";

/**
 * Manages multiple game sessions, each identified by a unique lobby code.
 */
class GameSessionManager {
    constructor() {
        this.games = new Map([["test", new GameManager(1, () => console.log("test log"))]]); // Stores GameManager instances with lobby codes as keys
    }

    /**
     * Creates a new game session.
     * @param {string} lobbyCode - Unique lobby code for the game.
     * @param {number} duration - Duration of the game timer in milliseconds.
     * @param {Function} onTimerEnd - Function to call when the timer ends.
     */
    createGame(lobbyCode) {
        if (this.games.has(lobbyCode)) {
            throw new Error(`Game with lobby code ${lobbyCode} already exists.`);
        }

        const game = new GameManager();

        this.games.set(lobbyCode, game);

        return game;
    }

    /**
     * 
     * @param {string} lobbyCode - Unique lobby code for the game
     */
    getGame(lobbyCode) {
        return this.games.get(lobbyCode)
    }

    // /**
    //  * Starts the game associated with the given lobby code.
    //  * @param {string} lobbyCode - The lobby code of the game.
    //  */
    // startGame(lobbyCode) {
    //     const game = this.games.get(lobbyCode);

    //     if (!game) throw new Error(`No game found with lobby code ${lobbyCode}.`);

    //     game.startTimer();
    // }

    // /**
    //  * Cancels the game associated with the given lobby code.
    //  * @param {string} lobbyCode - The lobby code of the game.
    //  */
    // cancelGame(lobbyCode) {
    //     const game = this.games.get(lobbyCode);

    //     if (!game) throw new Error(`No game found with lobby code ${lobbyCode}.`);

    //     game.cancelTimer();

    //     this.games.delete(lobbyCode);
    // }

    /**
     * Removes a game from the manager.
     * @param {string} lobbyCode - The lobby code of the game to remove.
     */
    removeGame(lobbyCode) {
        this.games.delete(lobbyCode);
    }
}

const gameSessionManager = new GameSessionManager();

export { gameSessionManager }