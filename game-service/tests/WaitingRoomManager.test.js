import { jest } from "@jest/globals"

// Mock dependencies
jest.unstable_mockModule("../models/tournament-fixtures.model.js", () => ({
    default: {
        findOne: jest.fn(), // Mock the findOne method
    },
}));

// jest.unstable_mockModule('../config/winston.config.js', () => ({
//     logger: {
//         info: jest.fn(),
//         warn: jest.fn(),
//         error: jest.fn()
//     }
// }));

// import WaitingRoomManager from "../WaitingRoomManager.js";
// import TOURNAMENTFIXTURES from '../models/tournament-fixtures.model.js';

// Dynamically import the modules after mocking
const WaitingRoomManager = (await import("../WaitingRoomManager.js")).default;
const TOURNAMENTFIXTURES = (await import("../models/tournament-fixtures.model.js")).default;


describe('WaitingRoomManager', () => {
    let waitingRoomManager;
    let mockIo;
    let mockSocket;
    let activePlayers;

    beforeEach(() => {
        // // Reset all mocks
        // jest.clearAllMocks();
        // jest.resetAllMocks();

        // Mock Socket.IO server
        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        };

        // Mock socket
        mockSocket = {
            id: 'socket-123',
            emit: jest.fn()
        };

        // Mock active players
        activePlayers = [
            { socketID: 'socket-123', userID: 'player-1' },
            { socketID: 'socket-456', userID: 'player-2' }
        ];

        // Create instance of WaitingRoomManager
        waitingRoomManager = new WaitingRoomManager(mockIo, activePlayers);
    });

    describe('constructor', () => {
        test('should initialize with proper properties', () => {
            expect(waitingRoomManager.io).toBe(mockIo);
            expect(waitingRoomManager.activePlayers).toEqual(activePlayers);
            expect(waitingRoomManager.lobbyCodeWaiting).toBeInstanceOf(Map);
            expect(waitingRoomManager.timers).toBeInstanceOf(Map);
        });
    });

    describe('getFixture', () => {
        test('should return fixture when found', async () => {
            const mockFixture = {
                _id: 'fixture-1',
                joiningCode: 'lobby-123',
                players: ['player-1', 'player-2']
            };

            TOURNAMENTFIXTURES.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockFixture)
            });

            const result = await waitingRoomManager.getFixture('lobby-123', 'player-1');

            expect(TOURNAMENTFIXTURES.findOne).toHaveBeenCalledWith({ joiningCode: 'lobby-123' });
            expect(result).toEqual(mockFixture);
        });

        test('should return null when error occurs', async () => {
            TOURNAMENTFIXTURES.findOne.mockReturnValue({
                lean: jest.fn().mockRejectedValue(new Error('Database error'))
            });

            const result = await waitingRoomManager.getFixture('lobby-123', 'player-1');

            expect(result).toBeNull();
        });
    });

    describe('isActivePlayer', () => {
        test('should return true when player is active', () => {
            const result = waitingRoomManager.isActivePlayer('player-1');
            expect(result).toBe(true);
        });

        test('should return false when player is not active', () => {
            const result = waitingRoomManager.isActivePlayer('non-existent-player');
            expect(result).toBe(false);
        });
    });

    describe('addPlayerToLobbyCodeWaiting', () => {
        test('should create new lobby when lobby does not exist', () => {
            waitingRoomManager.addPlayerToLobbyCodeWaiting('new-lobby', 'player-1', 'socket-123');

            expect(waitingRoomManager.lobbyCodeWaiting.get('new-lobby')).toEqual([
                { socketID: 'socket-123', userID: 'player-1' }
            ]);
        });

        test('should add player to existing lobby', () => {
            // Setup existing lobby
            waitingRoomManager.lobbyCodeWaiting.set('existing-lobby', [
                { socketID: 'socket-123', userID: 'player-1' }
            ]);

            waitingRoomManager.addPlayerToLobbyCodeWaiting('existing-lobby', 'player-2', 'socket-456');

            expect(waitingRoomManager.lobbyCodeWaiting.get('existing-lobby')).toEqual([
                { socketID: 'socket-123', userID: 'player-1' },
                { socketID: 'socket-456', userID: 'player-2' }
            ]);
        });
    });

    describe('getLobbyWaitingSocketsIds', () => {
        test('should return undefined when lobby does not exist', () => {
            const result = waitingRoomManager.getLobbyWaitingSocketsIds('non-existent-lobby');
            expect(result).toBeUndefined();
        });

        test('should return undefined when lobby has less than 2 players', () => {
            waitingRoomManager.lobbyCodeWaiting.set('lonely-lobby', [
                { socketID: 'socket-123', userID: 'player-1' }
            ]);

            const result = waitingRoomManager.getLobbyWaitingSocketsIds('lonely-lobby');
            expect(result).toBeUndefined();
        });

        test('should return array of socket IDs when lobby has at least 2 players', () => {
            waitingRoomManager.lobbyCodeWaiting.set('full-lobby', [
                { socketID: 'socket-123', userID: 'player-1' },
                { socketID: 'socket-456', userID: 'player-2' }
            ]);

            const result = waitingRoomManager.getLobbyWaitingSocketsIds('full-lobby');
            expect(result).toEqual(['socket-123', 'socket-456']);
        });
    });

    describe('startOpponentTimer', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.clearAllTimers(); // Clear all fake timers
            jest.useRealTimers(); // Restore real timers
        });

        test('should clear existing timer for opponent if one exists', () => {
            const mockTimeout = setTimeout(() => { }, 1000);
            waitingRoomManager.timers.set('player-2', mockTimeout);

            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            waitingRoomManager.startOpponentTimer(mockSocket, 'lobby-123', 'player-2');

            expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimeout);
        });

        test('should set timer for opponent', () => {
            waitingRoomManager.startOpponentTimer(mockSocket, 'lobby-123', 'player-2');

            expect(waitingRoomManager.timers.has('player-2')).toBe(true);
        });

        test('should send notification and clean up if opponent still not active after timeout', () => {
            // Mock isActivePlayer to return false
            jest.spyOn(waitingRoomManager, 'isActivePlayer').mockReturnValue(false);

            waitingRoomManager.startOpponentTimer(mockSocket, 'lobby-123', 'player-2');

            // Fast-forward time
            jest.advanceTimersByTime(120000);

            // expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id);
            expect(mockIo.emit).toHaveBeenCalledWith('opponent-not-available');
            expect(waitingRoomManager.timers.has('player-2')).toBe(false);
        });

        test('should clean up timer if opponent becomes active before timeout', () => {
            // Mock isActivePlayer to return true
            jest.spyOn(waitingRoomManager, 'isActivePlayer').mockReturnValue(true);

            waitingRoomManager.startOpponentTimer(mockSocket, 'lobby-123', 'player-2');

            // Fast-forward time
            jest.advanceTimersByTime(120000);

            expect(mockIo.emit).not.toHaveBeenCalled();
            expect(waitingRoomManager.timers.has('player-2')).toBe(false);
        });
    });

    describe('joinWaitingRoom', () => {
        beforeEach(() => {
            // jest.clearAllMocks();
            // jest.clearAllTimers();
            // Mock methods
            jest.spyOn(waitingRoomManager, 'getFixture');
            jest.spyOn(waitingRoomManager, 'addPlayerToLobbyCodeWaiting');
            jest.spyOn(waitingRoomManager, 'isActivePlayer');
            jest.spyOn(waitingRoomManager, 'startOpponentTimer');
            jest.spyOn(waitingRoomManager, 'getLobbyWaitingSocketsIds');
        });

        test('should emit error when fixture not found', async () => {
            waitingRoomManager.getFixture.mockResolvedValue(null);

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'non-existent-lobby');

            expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Fixture not found' });
            expect(waitingRoomManager.addPlayerToLobbyCodeWaiting).not.toHaveBeenCalled();
        });

        test('should start timer when opponent is not active', async () => {
            const mockFixture = {
                players: ['player-1', 'player-3'] // player-3 is not in activePlayers
            };

            waitingRoomManager.getFixture.mockResolvedValue(mockFixture);
            waitingRoomManager.isActivePlayer.mockReturnValue(false);

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            expect(waitingRoomManager.startOpponentTimer).toHaveBeenCalledWith(mockSocket.id, 'lobby-123', 'player-3');
            // expect(mockSocket.emit).toHaveBeenCalledWith('opponent-not-active', { message: 'Opponent Not Active, Starting Timer' });
            // expect(mockSocket.emit).toHaveBeenCalledWith('opponent-not-active', { message: 'Opponent Not Active, Starting Timer' });
        });

        test('should emit error when not enough players to start game', async () => {
            const mockFixture = {
                players: ['player-1', 'player-2']
            };
            waitingRoomManager.getFixture.mockResolvedValue(mockFixture);
            waitingRoomManager.isActivePlayer.mockReturnValue(true);
            waitingRoomManager.getLobbyWaitingSocketsIds.mockReturnValue(undefined);

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not enough players to start game' });
        });

        test('should start tournament fixture when all conditions met', async () => {
            const mockFixture = {
                players: ['player-1', 'player-2']
            };
            const socketIds = ['socket-123', 'socket-456'];

            waitingRoomManager.getFixture.mockResolvedValue(mockFixture);
            waitingRoomManager.isActivePlayer.mockReturnValue(true);
            waitingRoomManager.getLobbyWaitingSocketsIds.mockReturnValue(socketIds);

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            expect(mockIo.to).toHaveBeenCalledWith(socketIds);
            expect(mockIo.emit).toHaveBeenCalledWith('start-tournament-fixture');

            const lobby = waitingRoomManager.lobbyCodeWaiting.get('lobby-123');
            expect(lobby).toBeUndefined();
        });

        test('should handle exceptions gracefully', async () => {
            waitingRoomManager.getFixture.mockRejectedValue(new Error('Unexpected error'));

            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            // No unhandled exception should occur, and logger should be called
            // We're testing that the function completes without throwing
        });
    });

    describe('leaveWaitingRoom', () => {
        beforeEach(() => {
            // jest.clearAllMocks();
            // jest.clearAllTimers();
            // Mock methods
            jest.spyOn(waitingRoomManager, 'getFixture');
            jest.spyOn(waitingRoomManager, 'addPlayerToLobbyCodeWaiting');
            jest.spyOn(waitingRoomManager, 'isActivePlayer');
            jest.spyOn(waitingRoomManager, 'startOpponentTimer');
            jest.spyOn(waitingRoomManager, 'getLobbyWaitingSocketsIds');
        });

        test('should remove player from the lobby', async () => {
            // const mockFixture = {
            //     players: ['player-1', 'player-2']
            // };

            // waitingRoomManager.getFixture.mockResolvedValue(mockFixture);

            // Add a player to the lobby
            waitingRoomManager.addPlayerToLobbyCodeWaiting('lobby-123', 'player-1', 'socket-123');
            waitingRoomManager.addPlayerToLobbyCodeWaiting('lobby-123', 'player-2', 'socket-456');

            // Player leaves the lobby
            await waitingRoomManager.leaveWaitingRoom('player-1', 'lobby-123');

            // Check if the player is removed
            const lobby = waitingRoomManager.lobbyCodeWaiting.get('lobby-123');
            expect(lobby).toEqual([{ socketID: 'socket-456', userID: 'player-2' }]);
        });

        // test('should delete the lobby if it becomes empty', () => {
        //     // Add a player to the lobby
        //     waitingRoomManager.addPlayerToLobbyCodeWaiting('lobby-123', 'player-1', 'socket-123');

        //     // Player leaves the lobby
        //     waitingRoomManager.leaveWaitingRoom('player-1', 'lobby-123');

        //     // Check if the lobby is deleted
        //     const lobby = waitingRoomManager.lobbyCodeWaiting.get('lobby-123');
        //     expect(lobby).toBeUndefined();
        // });

        // @property {string} _id - The unique identifier of the fixture.
        // * @property {string} tournamentId - The ID of the tournament.
        // * @property {string[]} players - Array of player IDs.
        // * @property {string | null} winner - The ID of the winning player (if available).
        // * @property {string} joiningCode - The unique joining code for the fixture.
        // * @property {boolean} gameStarted - Indicates if the game has started.
        // * @property {string} createdAt - Timestamp when the fixture was created.
        // * @property {string} updatedAt - Timestamp when the fixture was last updated.

        test('should cancel the timer for the opponent if the player leaves', async () => {
            const mockFixture = {
                players: ['player-1', 'player-2']
            };

            waitingRoomManager.getFixture.mockResolvedValue(mockFixture);

            // Add a player to the lobby
            // waitingRoomManager.addPlayerToLobbyCodeWaiting('lobby-123', 'player-1', 'socket-123');
            await waitingRoomManager.joinWaitingRoom(mockSocket, 'player-1', 'lobby-123');

            // Player leaves the lobby
            waitingRoomManager.leaveWaitingRoom('player-1', 'lobby-123');

            // Check if the timer is canceled
            expect(waitingRoomManager.timers.has('player-2')).toBe(false);
        });

        test('should not throw an error if the lobby does not exist', () => {
            const mockFixture = {
                players: ['player-1', 'player-2']
            };

            waitingRoomManager.getFixture.mockResolvedValue(mockFixture);

            // Player leaves a non-existent lobby
            expect(() => {
                waitingRoomManager.leaveWaitingRoom('player-1', 'non-existent-lobby');
            }).not.toThrow();
        });
    });

    describe('emitNumbers', () => {
        test('should return a number that signifies amount of people in waiting room', () => {
            waitingRoomManager.lobbyCodeWaiting = new Map().set("12345", ["player-1", "player-2"]);

            waitingRoomManager.emitNumbers();

            expect(mockIo.emit).toHaveBeenCalledWith("total-players", 2); // Ensure the correct event is emitted
        });
    });

    // Legacy test for checkOpponentOnlineState which seems to be unused
    // describe('checkOpponentOnlineState', () => {
    //     test('should return true when opponent is active', () => {
    //         const result = waitingRoomManager.checkOpponentOnlineState('player-2');
    //         expect(result).toBe(true);
    //     });

    //     test('should return false when opponent is not active', () => {
    //         const result = waitingRoomManager.checkOpponentOnlineState('non-existent-player');
    //         expect(result).toBe(false);
    //     });
    // });
});


// <!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Word Game</title>
//     <style>
//         body {
//             font-family: Arial, sans-serif;
//             text-align: center;
//             margin: 20px;
//         }
//         .game-container {
//             display: flex;
//             justify-content: space-around;
//             margin-top: 30px;
//         }
//         .player-area {
//             width: 45%;
//             padding: 20px;
//             border: 2px solid #333;
//             border-radius: 10px;
//         }
//         .letter-rack {
//             display: flex;
//             justify-content: center;
//             margin: 20px 0;
//             min-height: 60px;
//         }
//         .word-area {
//             min-height: 60px;
//             margin: 20px 0;
//             padding: 10px;
//             border: 1px dashed #666;
//             border-radius: 5px;
//             display: flex;
//             justify-content: center;
//         }
//         .letter-tile {
//             width: 40px;
//             height: 40px;
//             margin: 0 5px;
//             background-color: #f5d742;
//             border-radius: 5px;
//             display: flex;
//             justify-content: center;
//             align-items: center;
//             font-weight: bold;
//             font-size: 20px;
//             cursor: grab;
//             box-shadow: 2px 2px 3px rgba(0,0,0,0.3);
//         }
//         .timer {
//             font-size: 24px;
//             font-weight: bold;
//             margin: 20px 0;
//         }
//         .submit-btn {
//             padding: 8px 16px;
//             background-color: #4CAF50;
//             color: white;
//             border: none;
//             border-radius: 5px;
//             cursor: pointer;
//             font-size: 16px;
//         }
//         .score {
//             font-size: 20px;
//             font-weight: bold;
//             margin: 10px 0;
//         }
//         .game-over {
//             font-size: 28px;
//             color: #d32f2f;
//             margin: 20px 0;
//             font-weight: bold;
//             display: none;
//         }
//         .word-history {
//             margin-top: 15px;
//             text-align: left;
//             padding-left: 20px;
//         }
//     </style>
// </head>
// <body>
//     <h1>Word Game</h1>
//     <p>Drag letters to form words and submit them for points. Player with most points after 2 minutes wins!</p>
    
//     <div class="timer">Time: 2:00</div>
//     <div class="game-over">Game Over!</div>
    
//     <div class="game-container">
//         <div class="player-area">
//             <h2>Player 1</h2>
//             <div class="score">Score: 0</div>
//             <div class="letter-rack" id="rack1"></div>
//             <div class="word-area" id="word1"></div>
//             <button class="submit-btn" id="submit1">Submit Word</button>
//             <div class="word-history" id="history1">
//                 <h3>Words Created:</h3>
//                 <ul id="wordList1"></ul>
//             </div>
//         </div>
        
//         <div class="player-area">
//             <h2>Player 2</h2>
//             <div class="score">Score: 0</div>
//             <div class="letter-rack" id="rack2"></div>
//             <div class="word-area" id="word2"></div>
//             <button class="submit-btn" id="submit2">Submit Word</button>
//             <div class="word-history" id="history2">
//                 <h3>Words Created:</h3>
//                 <ul id="wordList2"></ul>
//             </div>
//         </div>
//     </div>

//     <script>
//         // Letter frequencies and point values (simplified Scrabble-like)
//         const letterPool = {
//             'A': { count: 9, value: 1 },
//             'B': { count: 2, value: 3 },
//             'C': { count: 2, value: 3 },
//             'D': { count: 4, value: 2 },
//             'E': { count: 12, value: 1 },
//             'I': { count: 9, value: 1 },
//             'L': { count: 4, value: 1 },
//             'M': { count: 2, value: 3 },
//             'N': { count: 6, value: 1 },
//             'O': { count: 8, value: 1 },
//             'P': { count: 2, value: 3 },
//             'R': { count: 6, value: 1 },
//             'S': { count: 4, value: 1 },
//             'T': { count: 6, value: 1 },
//             'U': { count: 4, value: 1 },
//             'V': { count: 2, value: 4 },
//             'W': { count: 2, value: 4 },
//             'X': { count: 1, value: 8 },
//             'Y': { count: 2, value: 4 },
//             'Z': { count: 1, value: 10 },
//             'F': { count: 2, value: 4 },
//             'G': { count: 3, value: 2 },
//             'H': { count: 2, value: 4 },
//             'J': { count: 1, value: 8 },
//             'K': { count: 1, value: 5 },
//             'Q': { count: 1, value: 10 }
//         };

//         // Game state
//         let gameActive = true;
//         let scores = [0, 0];
//         let usedWords = [[], []];
//         let totalSeconds = 120;
//         let timerInterval;

//         // Generate a pool of letters based on frequency
//         function generateLetterPool() {
//             let pool = [];
//             for (const [letter, info] of Object.entries(letterPool)) {
//                 for (let i = 0; i < info.count; i++) {
//                     pool.push(letter);
//                 }
//             }
//             return pool;
//         }

//         // Shuffle array (Fisher-Yates algorithm)
//         function shuffleArray(array) {
//             for (let i = array.length - 1; i > 0; i--) {
//                 const j = Math.floor(Math.random() * (i + 1));
//                 [array[i], array[j]] = [array[j], array[i]];
//             }
//             return array;
//         }

//         // Deal 7 random letters to a player
//         function dealLetters(playerId) {
//             const rackElement = document.getElementById(`rack${playerId}`);
//             rackElement.innerHTML = '';
            
//             let pool = generateLetterPool();
//             pool = shuffleArray(pool);
            
//             for (let i = 0; i < 7; i++) {
//                 if (pool.length > 0) {
//                     const letter = pool.pop();
//                     const tile = createLetterTile(letter, playerId);
//                     rackElement.appendChild(tile);
//                 }
//             }
//         }

//         // Create a draggable letter tile
//         function createLetterTile(letter, playerId) {
//             const tile = document.createElement('div');
//             tile.className = 'letter-tile';
//             tile.textContent = letter;
//             tile.dataset.letter = letter;
//             tile.dataset.value = letterPool[letter].value;
//             tile.draggable = true;
            
//             // Add drag events
//             tile.addEventListener('dragstart', (e) => {
//                 e.dataTransfer.setData('text/plain', JSON.stringify({
//                     letter: letter,
//                     value: letterPool[letter].value,
//                     id: tile.id,
//                     playerId: playerId
//                 }));
//                 setTimeout(() => {
//                     tile.style.opacity = '0.4';
//                 }, 0);
//             });
            
//             tile.addEventListener('dragend', () => {
//                 tile.style.opacity = '1';
//             });
            
//             return tile;
//         }

//         // Set up drop zones
//         function setupDropZones() {
//             const wordAreas = document.querySelectorAll('.word-area');
            
//             wordAreas.forEach(area => {
//                 area.addEventListener('dragover', (e) => {
//                     e.preventDefault();
//                 });
                
//                 area.addEventListener('drop', (e) => {
//                     e.preventDefault();
//                     if (!gameActive) return;
                    
//                     const data = JSON.parse(e.dataTransfer.getData('text/plain'));
//                     const playerId = parseInt(area.id.replace('word', ''));
                    
//                     // Only allow dropping in the player's own word area
//                     if (data.playerId === playerId) {
//                         const originalTile = document.querySelector(`.letter-tile[data-letter="${data.letter}"]`);
//                         if (originalTile && originalTile.parentNode.id === `rack${playerId}`) {
//                             const tile = createLetterTile(data.letter, playerId);
//                             area.appendChild(tile);
//                             originalTile.remove();
//                         }
//                     }
//                 });
                
//                 // Allow dropping back to rack
//                 const racks = document.querySelectorAll('.letter-rack');
//                 racks.forEach(rack => {
//                     rack.addEventListener('dragover', (e) => {
//                         e.preventDefault();
//                     });
                    
//                     rack.addEventListener('drop', (e) => {
//                         e.preventDefault();
//                         if (!gameActive) return;
                        
//                         const data = JSON.parse(e.dataTransfer.getData('text/plain'));
//                         const playerId = parseInt(rack.id.replace('rack', ''));
                        
//                         // Only allow dropping in the player's own rack
//                         if (data.playerId === playerId) {
//                             const originalTile = document.querySelector(`.letter-tile[data-letter="${data.letter}"]`);
//                             if (originalTile && originalTile.parentNode.id === `word${playerId}`) {
//                                 const tile = createLetterTile(data.letter, playerId);
//                                 rack.appendChild(tile);
//                                 originalTile.remove();
//                             }
//                         }
//                     });
//                 });
//             });
//         }

//         // Initialize game
//         function initGame() {
//             // Deal letters to both players
//             dealLetters(1);
//             dealLetters(2);
            
//             // Set up drop zones
//             setupDropZones();
            
//             // Set up submit buttons
//             document.getElementById('submit1').addEventListener('click', () => submitWord(1));
//             document.getElementById('submit2').addEventListener('click', () => submitWord(2));
            
//             // Start timer
//             startTimer();
//         }

//         // Submit word and calculate score
//         function submitWord(playerId) {
//             if (!gameActive) return;
            
//             const wordArea = document.getElementById(`word${playerId}`);
//             const tiles = wordArea.querySelectorAll('.letter-tile');
            
//             if (tiles.length === 0) return;
            
//             // Construct word and calculate score
//             let word = '';
//             let wordScore = 0;
            
//             tiles.forEach(tile => {
//                 word += tile.dataset.letter;
//                 wordScore += parseInt(tile.dataset.value);
//             });
            
//             // Check if word is valid (length > 1 and not used before)
//             if (word.length > 1 && !usedWords[playerId - 1].includes(word.toLowerCase())) {
//                 // In a real game, you would verify against a dictionary here
                
//                 // Add score
//                 scores[playerId - 1] += wordScore;
//                 document.querySelector(`.player-area:nth-child(${playerId}) .score`).textContent = `Score: ${scores[playerId - 1]}`;
                
//                 // Add to word history
//                 usedWords[playerId - 1].push(word.toLowerCase());
//                 const wordList = document.getElementById(`wordList${playerId}`);
//                 const listItem = document.createElement('li');
//                 listItem.textContent = `${word} (${wordScore} points)`;
//                 wordList.appendChild(listItem);
                
//                 // Clear word area
//                 wordArea.innerHTML = '';
                
//                 // Deal new letters
//                 const rackElement = document.getElementById(`rack${playerId}`);
//                 const currentLetters = rackElement.querySelectorAll('.letter-tile').length;
//                 const neededLetters = 7 - currentLetters;
                
//                 if (neededLetters > 0) {
//                     let pool = generateLetterPool();
//                     pool = shuffleArray(pool);
                    
//                     for (let i = 0; i < neededLetters; i++) {
//                         if (pool.length > 0) {
//                             const letter = pool.pop();
//                             const tile = createLetterTile(letter, playerId);
//                             rackElement.appendChild(tile);
//                         }
//                     }
//                 }
//             } else {
//                 // Return letters to rack
//                 const rackElement = document.getElementById(`rack${playerId}`);
//                 tiles.forEach(tile => {
//                     const letter = tile.dataset.letter;
//                     const newTile = createLetterTile(letter, playerId);
//                     rackElement.appendChild(newTile);
//                 });
//                 wordArea.innerHTML = '';
//             }
//         }

//         // Timer function
//         function startTimer() {
//             timerInterval = setInterval(() => {
//                 totalSeconds--;
                
//                 const minutes = Math.floor(totalSeconds / 60);
//                 const seconds = totalSeconds % 60;
                
//                 document.querySelector('.timer').textContent = `Time: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
                
//                 if (totalSeconds <= 0) {
//                     clearInterval(timerInterval);
//                     endGame();
//                 }
//             }, 1000);
//         }

//         // End game and determine winner
//         function endGame() {
//             gameActive = false;
//             document.querySelector('.game-over').style.display = 'block';
            
//             // Determine winner
//             if (scores[0] > scores[1]) {
//                 document.querySelector('.game-over').textContent = 'Game Over! Player 1 Wins!';
//             } else if (scores[1] > scores[0]) {
//                 document.querySelector('.game-over').textContent = 'Game Over! Player 2 Wins!';
//             } else {
//                 document.querySelector('.game-over').textContent = 'Game Over! It\'s a tie!';
//             }
            
//             // Disable submit buttons
//             document.getElementById('submit1').disabled = true;
//             document.getElementById('submit2').disabled = true;
//         }

//         // Initialize the game when the page loads
//         window.addEventListener('load', initGame);
//     </script>
// </body>
// </html>