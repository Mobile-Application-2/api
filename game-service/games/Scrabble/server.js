// server.js - Node.js server implementation with Socket.io
import express from 'express';
import http from 'http';
import {Server} from 'socket.io';
import path from 'path';

import livereload from "livereload";
import connectLivereload from "connect-livereload";
import { watch } from 'fs';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

export {io, server}

console.log(import.meta.dirname)

const testDirname = import.meta.dirname

// Enable livereload
const liveReloadServer = livereload.createServer();
liveReloadServer.watch(testDirname + "/public")

app.use(connectLivereload());

// Serve static files from the public directory
app.use(express.static(path.join(testDirname, 'public')));

// // Restart server when files change
// liveReloadServer.server.once("connection", () => {
//     console.log("rerfeshing");
//     setTimeout(() => {
//         liveReloadServer.refresh("/");
//     }, 100);
// });
watch(testDirname + "/public", {recursive: true}, () => {
    console.log("File changed, refreshing...");
    liveReloadServer.refresh("/");
})


/**
 * Game state
 * @type {Record<string, Game>}
 */
const games = {};
const letterPool = {
    'A': { count: 9, value: 1 },
    'B': { count: 2, value: 3 },
    'C': { count: 2, value: 3 },
    'D': { count: 4, value: 2 },
    'E': { count: 12, value: 1 },
    'I': { count: 9, value: 1 },
    'L': { count: 4, value: 1 },
    'M': { count: 2, value: 3 },
    'N': { count: 6, value: 1 },
    'O': { count: 8, value: 1 },
    'P': { count: 2, value: 3 },
    'R': { count: 6, value: 1 },
    'S': { count: 4, value: 1 },
    'T': { count: 6, value: 1 },
    'U': { count: 4, value: 1 },
    'V': { count: 2, value: 4 },
    'W': { count: 2, value: 4 },
    'X': { count: 1, value: 8 },
    'Y': { count: 2, value: 4 },
    'Z': { count: 1, value: 10 },
    'F': { count: 2, value: 4 },
    'G': { count: 3, value: 2 },
    'H': { count: 2, value: 4 },
    'J': { count: 1, value: 8 },
    'K': { count: 1, value: 5 },
    'Q': { count: 1, value: 10 }
};

// Generate letter pool
function generateLetterPool() {
    let pool = [];
    for (const [letter, info] of Object.entries(letterPool)) {
        for (let i = 0; i < info.count; i++) {
            pool.push({ letter, value: info.value });
        }
    }
    return pool;
}

// Shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Deal 7 random letters to a player
function dealLetters(gameId, playerId, count = 7) {
    const game = games[gameId];
    if (!game) return [];
    
    let letters = [];
    for (let i = 0; i < count; i++) {
        if (game.letterPool.length > 0) {
            const letterObj = game.letterPool.pop();
            letters.push(letterObj);
        }
    }
    
    return letters;
}

/**
 * Create a new game
 * @param {string} gameId 
 * @returns {Game}
 */
function createGame(gameId) {
    games[gameId] = {
        /**@type {Player} */
        players: {},
        letterPool: shuffleArray(generateLetterPool()),
        active: false,
        timeRemaining: 120,
        timer: null,
        usedWords: [],
        lobbyCode: null
    };
    return games[gameId];
}

/**
 * @typedef {Object} Tile
 * @property {string} letter - The letter on the tile.
 * @property {number} value - The point value of the tile.
 */

/**
 * @typedef {Object} WordScore
 * @property {string} word - The word played by the player.
 * @property {number} score - The score for the word.
 */

/**
 * @typedef {Object} Player
 * @property {string} id - The unique identifier for the player session.
 * @property {string} userId - The unique identifier of the user.
 * @property {string} name - The player's display name.
 * @property {Array<Tile>} rack - The set of letter tiles the player currently has.
 * @property {number} score - The player's total score.
 * @property {Array<WordScore>} words - The words the player has played and their scores.
 * @property {boolean} disconnected - Whether the player is disconnected.
 */

/**
 * @typedef {Object} Game
 * @property {Object.<string, Player>} players - A dictionary of players, indexed by their player IDs.
 * @property {Array<Tile>} letterPool - The pool of available letter tiles.
 * @property {boolean} active - Whether the game is currently active.
 * @property {number} timeRemaining - Time left in the game (in seconds).
 * @property {NodeJS.Timeout} timer - The game timer object.
 * @property {Array<string> } usedWords - List of words that have already been played.
 * @property {string|null} lobbyCode - The code for joining the game, or null if not set.
 */



/**
 * @type {Record<string, Player>}
 */
const persistStore = {}

// http://localhost:3000?gameName=my-Word&lobbyCode=123456&playerId=21hjshdsj

const wordNamespace = io.of("/word")

// Socket.io connection handling
wordNamespace.on("connection", (socket) => {
    console.log('New client connected:', socket.id);
    
    // Create or join a game
    socket.on('joinGame', async ({ gameId, playerName, playerId: playerID, opponentId, stakeAmount, tournamentId, lobbyCode, gameName }) => {
        console.log("client emitted joinGame", {gameId, id: socket.id, playerName});

        let game = games[gameId];

        if (!game) {
            console.log("no game, creating...");

            game = createGame(gameId);
        }

        if (persistStore[playerID]) {
            console.log(`Restoring player ${playerID} to game ${gameId}`);

            const persistPlayer = persistStore[playerID]

            console.log(`Player data: `, {persistPlayer});
            
            delete game.players[persistPlayer.id];
            
            persistPlayer.disconnected = false;

            game.players[socket.id] = persistPlayer;

            game.players[socket.id].id = socket.id;

            delete persistStore[playerID];

            console.log("restored data: ", {data: game.players[socket.id]});

            socket.join(gameId);

            console.log("emitting reconnected");
            
            wordNamespace.to(socket.id).emit('reconnected', {
                gameId,
                playerId: socket.id,
                rack: game.players[socket.id].rack,
                gameState: {
                    players: Object.values(game.players).map(p => ({
                        id: p.id,
                        name: p.name,
                        score: p.score,
                        wordCount: p.words.length
                    })),
                    active: game.active,
                    timeRemaining: game.timeRemaining
                }
            });

            return;
        }
        
        // Check if game is full
        if (Object.keys(game.players).length >= 2) {
            console.log("game is full");

            socket.emit('gameError', { message: 'Game is full' });
            return;
        }
        
        // Check if game already started
        if (game.active) {
            console.log("game is active");

            socket.emit('gameError', { message: 'Game already in progress' });
            return;
        }
        
        // Add player to game
        const playerId = socket.id;

        game.players[playerId] = {
            id: playerId,
            userId: playerID,
            name: playerName,
            rack: [],
            score: 0,
            words: [],
            disconnected: false
        };
        
        // Join socket to game room
        socket.join(gameId);

        console.log("joined game room");
        
        // Deal initial letters
        game.players[playerId].rack = dealLetters(gameId, playerId);
        
        // Notify player
        socket.emit('gameJoined', {
            gameId,
            playerId,
            name: playerName,
            rack: game.players[playerId].rack
        });

        console.log("emitted gameJoined event");
        
        // Update all players in the game
        wordNamespace.to(gameId).emit('gameState', {
            players: Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                wordCount: p.words.length
            })),
            active: game.active,
            timeRemaining: game.timeRemaining
        });

        console.log("updated game state");
        
        // Start game if we have 2 players
        if (Object.keys(game.players).length === 2 && !game.active) {
            startGame(gameId);
            /* console.log("starting game due to 2 players");

            const lobbyID = await MainServerLayer.getLobbyID(gameId);

            await MainServerLayer.startGame(lobbyID); */
        }
    });
    
    // Submit a word
    socket.on('submitWord', ({ gameId, word }) => {
        console.log("client submitted word", {gameId, word});

        const game = games[gameId];
        if (!game || !game.active) {
            console.log("no game or game not active");
            return
        };
        
        const playerId = socket.id;
        const player = game.players[playerId];
        if (!player) {
            console.log("no player");

            return
        };
        
        // Check if word is valid (not already used and at least 2 letters)
        if (word.length < 2 || game.usedWords.includes(word.toLowerCase())) {
            console.log("client word rejected ");

            socket.emit('wordRejected', { word, reason: 'Word is too short or already used' });
            return;
        }
        
        // In a real game, you would verify against a dictionary here
        
        // Calculate word score
        let wordScore = 0;
        for (const letter of word) {
            const letterInfo = letterPool[letter.toUpperCase()];
            if (letterInfo) {
                wordScore += letterInfo.value;
            }
        }
        
        // Update player score
        player.score += wordScore;
        player.words.push({ word, score: wordScore });
        game.usedWords.push(word.toLowerCase());
        
        // Notify player of word acceptance
        socket.emit('wordAccepted', {
            word,
            score: wordScore,
            totalScore: player.score
        });
        
        // Update all players in the game
        wordNamespace.to(gameId).emit('gameState', {
            players: Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                wordCount: p.words.length
            })),
            active: game.active,
            timeRemaining: game.timeRemaining,
            lastWord: {
                playerId: playerId,
                playerName: player.name,
                word: word,
                score: wordScore
            }
        });
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected:', {sockerId: socket.id});
        
        // Find game with this player
        Object.keys(games).forEach(gameId => {
            const game = games[gameId];
            if (game.players[socket.id]) {
                // Remove player
                // delete game.players[socket.id];
                game.players[socket.id].disconnected = true;

                const pl = game.players[socket.id]

                persistStore[pl.userId] = { ...pl }

                console.log("saved to persist store: ", persistStore);
            }
        });
    });
})

// Start a game
function startGame(gameId) {
    const game = games[gameId];
    if (!game || game.active) return;
    
    game.active = true;
    game.timeRemaining = process.env.NODE_ENV == "production" ? 120 : 30; // 2 minutes
    
    // Start timer
    game.timer = setInterval(() => {
        game.timeRemaining--;
        
        // Update clients with time
        wordNamespace.to(gameId).emit('timeUpdate', { timeRemaining: game.timeRemaining });
        
        if (game.timeRemaining <= 0) {
            endGame(gameId, 'Time expired');
        }
    }, 1000);
    
    // Notify players that game started
    wordNamespace.to(gameId).emit('gameStarted', {
        timeRemaining: game.timeRemaining,
        players: Object.values(game.players).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
        }))
    });
}

/**
 * @typedef WordGameResult 
 * @property {Array<Player>} players
 * @property {string} winnerId
 */

// End a game
async function endGame(gameId, reason) {
    const game = games[gameId];
    if (!game) return;
    
    // Stop timer
    if (game.timer) {
        clearInterval(game.timer);
        game.timer = null;
    }

    console.log("game ended");
    
    game.active = false;
    
    // Determine winner
    let winner = null;
    let loser = null;
    let highestScore = -1;
    
    Object.values(game.players).forEach(player => {
        if (player.score > highestScore) {
            highestScore = player.score;
            winner = player;
        } else if (player.score === highestScore) {
            winner = null; // Tie
        }
    });

    console.log("winner", {winner});
    
    // Notify players of game end
    wordNamespace.to(gameId).emit('gameEnded', {
        reason,
        winner: winner ? {
            id: winner.id,
            name: winner.name,
            score: winner.score
        } : null,
        isTie: winner === null && highestScore > -1,
        players: Object.values(game.players).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            words: p.words
        }))
    });

    wordNamespace.to(winner.id).emit('you-won')

    Object.values(game.players).forEach(player => {
        if(player.id != winner.id) {
            wordNamespace.to(player.id).emit("you-lost")
            loser = player;
        }
    })

    /* console.log("loser", {loser});

    const winnerId = winner.userId;
    const loserId = loser.userId;

    MobileLayer.sendGameWon(io, newRooms, winnerId, loserId, gameId);

    const lobbyId = await MainServerLayer.getLobbyID(gameId);

    await MainServerLayer.wonGame(lobbyId, winnerId); */

    delete games[gameId];
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});