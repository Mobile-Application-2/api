const EventEmitter = require('events');

/**
 * A class representing a matchmaker for pairing players.
 */
class MatchMaker extends EventEmitter {
    constructor() {
        super();
        /** @type {Array<string>} */
        this.waitingPlayers = [];
        /** @type {Set<string>} */
        this.matchedPairs = new Set();
    }

    /**
     * Adds a player to the waiting pool.
     * @param {string} playerId - The unique identifier of the player.
     */
    addPlayer(playerId) {
        this.waitingPlayers.push(playerId);
        // Try matching as soon as a new player is added.
        this.tryMatch();
    }

    /**
     * Returns a standardized key for a pair of players.
     * Sorting ensures that the order doesn't matter.
     * @param {string} playerA 
     * @param {string} playerB 
     * @returns {string} - The key representing the pair.
     */
    getPairKey(playerA, playerB) {
        return [playerA, playerB].sort().join('-');
    }

    /**
     * Tries to match players in the waiting pool who haven't been matched before.
     * If a match is found, it is removed from the waiting pool and emitted.
     */
    tryMatch() {
        // We use a simple nested loop to check each pair.
        for (let i = 0; i < this.waitingPlayers.length; i++) {
            for (let j = i + 1; j < this.waitingPlayers.length; j++) {
                const playerA = this.waitingPlayers[i];
                const playerB = this.waitingPlayers[j];
                const pairKey = this.getPairKey(playerA, playerB);

                // If this pair hasn't been matched before, match them.
                if (!this.matchedPairs.has(pairKey)) {
                    // Remove both players from the waiting pool.
                    // (Remove the one with the higher index first so that the index doesn't shift)
                    this.waitingPlayers.splice(j, 1);
                    this.waitingPlayers.splice(i, 1);

                    // Record that this pair has been matched.
                    this.matchedPairs.add(pairKey);

                    // Emit an event to notify that a new match has been created.
                    this.emit('match', { playerA, playerB });
                    // Since we've modified the waitingPlayers array, start matching again.
                    // (We break out to restart our matching process.)
                    return this.tryMatch();
                }
            }
        }
        // If no match is possible at the moment, simply exit.
    }

    /**
     * When a match is completed and the players become available again,
     * add them back to the waiting pool.
     * @param {string} playerId 
     */
    returnPlayer(playerId) {
        // You can add additional logic here if needed.
        this.addPlayer(playerId);
    }
}

module.exports = MatchMaker;

/* ----- Example Usage -----
const matchMaker = new MatchMaker();

// Listen for new matches.
matchMaker.on('match', ({ playerA, playerB }) => {
  console.log(`Matched: ${playerA} with ${playerB}`);
  
  // Simulate match process then returning players back to the pool.
  setTimeout(() => {
    console.log(`Returning ${playerA} and ${playerB} to the waiting pool.`);
    matchMaker.returnPlayer(playerA);
    matchMaker.returnPlayer(playerB);
  }, 5000); // Assume match takes 5 seconds.
});

// Add players to the system.
['player1', 'player2', 'player3', 'player4'].forEach(playerId => {
  matchMaker.addPlayer(playerId);
});

// Later, new players can be added at any time.
setTimeout(() => {
  matchMaker.addPlayer('player5');
}, 3000);
-------------------------------- */

