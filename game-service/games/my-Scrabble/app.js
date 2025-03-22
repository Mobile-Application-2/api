// public/app.js - Client-side implementation

// DOM elements
const gameContainer = document.getElementById('game-container');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');
// const joinForm = document.getElementById('join-form');
const gameIdInput = document.getElementById('game-id');
const playerNameInput = document.getElementById('player-name');
const timerElement = document.getElementById('timer');
const letterRack = document.getElementById('letter-rack');
const wordArea = document.getElementById('word-area');
const submitBtn = document.getElementById('submit-word');
const playersList = document.getElementById('players-list');
const wordHistory = document.getElementById('word-history');
const gameStatus = document.getElementById('game-status');

// Game state
let socket;
let gameId;
let playerId;
let currentRack = [];
let currentWord = [];

// Connect to Socket.io server
function connectToServer(cb) {
    socket = io("/word");
    
    // Socket event handlers
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);

        cb()
    });
    
    socket.on('gameJoined', handleGameJoined);
    socket.on('gameState', handleGameState);
    socket.on('gameStarted', handleGameStarted);
    socket.on('timeUpdate', handleTimeUpdate);
    socket.on('wordAccepted', handleWordAccepted);
    socket.on('wordRejected', handleWordRejected);
    socket.on('gameEnded', handleGameEnded);
    socket.on('playerLeft', handlePlayerLeft);
    socket.on('you-won', () => {
        alert("you won")
    });

    socket.on('you-lost', () => {
        alert("you lost")
    });
    // socket.on('playerLeft', handlePlayerLeft);
    socket.on('gameError', handleGameError);
}

// Join or create a game
function joinGame(data) {
    // event.preventDefault();
    
    // gameId = gameIdInput.value.trim();
    // const playerName = playerNameInput.value.trim();
    const playerName = "player-" + data.playerId;
    
    // if (!gameId || !playerName) {
    //     alert('Please enter both game ID and your name');
    //     return;
    // }
    
    // Generate random game ID if not provided
    // if (gameId === '') {
    //     gameId = Math.random().toString(36).substring(2, 8);
    //     gameIdInput.value = gameId;
    // }
    
    socket.emit('joinGame', {
        ...data,
        gameId: data.lobbyCode,
        playerName
    });

    // waitingScreen.querySelector('.game-id-display').textContent = data.lobbyCode;
    // joinForm.style.display = 'none';
    waitingScreen.style.display = 'block';
}

// Handle successful game join
function handleGameJoined(data) {
    playerId = data.playerId;
    gameId = data.gameId;
    currentRack = data.rack;
    
    renderRack();
}

// Handle game state update
function handleGameState(data) {
    renderPlayers(data.players);
    
    if (data.lastWord) {
        addToWordHistory(data.lastWord);
    }
}

// Handle game started event
function handleGameStarted(data) {
    waitingScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    gameStatus.textContent = 'Game in progress';
    handleTimeUpdate(data);
}

// Handle time update
function handleTimeUpdate(data) {
    const minutes = Math.floor(data.timeRemaining / 60);
    const seconds = data.timeRemaining % 60;
    timerElement.textContent = `Time: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Handle word acceptance
function handleWordAccepted(data) {
    // Add the word to player's history
    const listItem = document.createElement('li');
    listItem.textContent = `${data.word} (${data.score} points)`;
    document.getElementById('my-words').appendChild(listItem);
    
    // Return letters to rack and clear word area
    currentRack = currentRack.concat(currentWord);
    currentWord = [];
    wordArea.innerHTML = '';
    
    renderRack();
}

// Handle word rejection
function handleWordRejected(data) {
    alert(`Word rejected: ${data.reason}`);
    
    // Return letters to rack
    returnLettersToRack();
}

// Handle game ended
function handleGameEnded(data) {
    gameStatus.textContent = 'Game Over';
    submitBtn.disabled = true;
    
    let resultMessage = '';
    if (data.isTie) {
        resultMessage = "It's a tie!";
    } else if (data.winner) {
        resultMessage = `Winner: ${data.winner.name} with ${data.winner.score} points!`;
    } else {
        resultMessage = 'Game ended: ' + data.reason;
    }
    
    const gameResult = document.createElement('div');
    gameResult.className = 'game-result';
    gameResult.textContent = resultMessage;
    gameScreen.appendChild(gameResult);
    
    // Show final words from all players
    const finalResults = document.createElement('div');
    finalResults.className = 'final-results';
    
    data.players.forEach(player => {
        const playerResult = document.createElement('div');
        playerResult.className = 'player-result';
        
        const playerHeader = document.createElement('h3');
        playerHeader.textContent = `${player.name}'s words (${player.score} points)`;
        playerResult.appendChild(playerHeader);
        
        const wordsList = document.createElement('ul');
        player.words.forEach(word => {
            const wordItem = document.createElement('li');
            wordItem.textContent = `${word.word} (${word.score} points)`;
            wordsList.appendChild(wordItem);
        });
        
        playerResult.appendChild(wordsList);
        finalResults.appendChild(playerResult);
    });
    
    gameScreen.appendChild(finalResults);
}

// Handle player left
function handlePlayerLeft(data) {
    console.log('Player left:', data.playerId);
}

// Handle game error
function handleGameError(data) {
    alert('Game error: ' + data.message);
    joinForm.style.display = 'block';
    waitingScreen.style.display = 'none';
}

// Render the letter rack
function renderRack() {
    letterRack.innerHTML = '';
    
    currentRack.forEach((letterObj, index) => {
        const tile = createLetterTile(letterObj.letter, letterObj.value, index);
        letterRack.appendChild(tile);
    });
}

// Create a draggable letter tile
function createLetterTile(letter, value, index) {
    const tile = document.createElement('div');
    tile.className = 'letter-tile';
    tile.textContent = letter;
    tile.dataset.letter = letter;
    tile.dataset.value = value;
    tile.dataset.index = index;
    tile.draggable = true;
    
    // Add drag events
    tile.addEventListener('dragstart', handleDragStart);
    tile.addEventListener('dragend', handleDragEnd);
    
    return tile;
}

// Handle drag start
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', JSON.stringify({
        letter: e.target.dataset.letter,
        value: e.target.dataset.value,
        index: e.target.dataset.index
    }));
    
    setTimeout(() => {
        e.target.style.opacity = '0.4';
    }, 0);
}

// Handle drag end
function handleDragEnd(e) {
    e.target.style.opacity = '1';
}

// Set up drop zones
function setupDropZones() {
    // Word area drop zone
    wordArea.addEventListener('dragover', e => {
        e.preventDefault();
    });
    
    wordArea.addEventListener('drop', e => {
        e.preventDefault();
        
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        
        // Find the tile in the rack
        const rackIndex = currentRack.findIndex((_, i) => i.toString() === data.index);
        if (rackIndex !== -1) {
            const letterObj = currentRack[rackIndex];
            
            // Create a new tile in the word area
            const tile = createLetterTile(letterObj.letter, letterObj.value, 'word-' + currentWord.length);
            wordArea.appendChild(tile);
            
            // Add to current word
            currentWord.push(letterObj);
            
            // Remove from rack
            currentRack.splice(rackIndex, 1);
            renderRack();
        }
    });
    
    // Rack drop zone (for returning letters)
    letterRack.addEventListener('dragover', e => {
        e.preventDefault();
    });
    
    letterRack.addEventListener('drop', e => {
        e.preventDefault();
        
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        
        // Check if it's from the word area
        if (data.index.toString().startsWith('word-')) {
            const wordIndex = parseInt(data.index.split('-')[1]);
            
            if (wordIndex >= 0 && wordIndex < currentWord.length) {
                const letterObj = currentWord[wordIndex];
                
                // Add back to rack
                currentRack.push(letterObj);
                
                // Remove from current word
                currentWord.splice(wordIndex, 1);
                
                // Rerender
                renderRack();
                renderWord();
            }
        }
    });
}

// Render the current word
function renderWord() {
    wordArea.innerHTML = '';
    
    currentWord.forEach((letterObj, index) => {
        const tile = createLetterTile(letterObj.letter, letterObj.value, 'word-' + index);
        wordArea.appendChild(tile);
    });
}

// Return letters to rack
function returnLettersToRack() {
    currentRack = currentRack.concat(currentWord);
    currentWord = [];
    renderRack();
    renderWord();
}

// Submit the current word
function submitWord() {
    console.log("submit word");
    if (currentWord.length === 0) return;
    
    const word = currentWord.map(letterObj => letterObj.letter).join('');
    socket.emit('submitWord', { gameId, word });
}

// Render players list
function renderPlayers(players) {
    playersList.innerHTML = '';
    
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.textContent = `${player.name}: ${player.score} points`;
        
        if (player.id === playerId) {
            playerItem.classList.add('current-player');
        }
        
        playersList.appendChild(playerItem);
    });
}

// Add word to history
function addToWordHistory(wordData) {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.textContent = `${wordData.playerName}: "${wordData.word}" (${wordData.score} points)`;
    wordHistory.appendChild(historyItem);
    
    // Scroll to bottom
    wordHistory.scrollTop = wordHistory.scrollHeight;
}

function getSearchParams(searchParams) {
    const params = new URLSearchParams(searchParams);
    
    return {
        // gameId: params.get('gameId') || null,
        playerId: params.get('playerId') || null,
        opponentId: params.get('opponentId') || null,
        stakeAmount: params.get('stakeAmount') || null,
        tournamentId: params.get('tournamentId') || null,
        lobbyCode: params.get('lobbyCode') || null,
        gameName: params.get('gameName') || null
    };
}

// Initialize the app
async function init() {
    const url = new URL(window.location)

    const data = getSearchParams(url.search)

    connectToServer(() => joinGame(data));
    setupDropZones();


    // joinGame(data)
    // await new Promise(resolve => {
    //     setTimeout(() => {

    //         resolve()
    //     }, 5000)
    // })
    
    // Event listeners
    // joinForm.addEventListener('submit', joinGame);
    submitBtn.addEventListener('click', submitWord);
    
    // // Share game ID button
    // document.getElementById('share-game').addEventListener('click', () => {
    //     navigator.clipboard.writeText(gameId)
    //         .then(() => alert('Game ID copied to clipboard!'))
    //         .catch(err => console.error('Failed to copy:', err));
    // });
}

// Start the app when the page loads
window.addEventListener('load', init);