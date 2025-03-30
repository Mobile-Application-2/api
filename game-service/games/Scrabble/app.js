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

const playerImage = document.getElementById("player-avatar");

const playerWinnerImage = document.getElementById("player-winner-avatar");
const playerLoserImage = document.getElementById("player-loser-avatar");

const playerScore = document.querySelector('.player-score');

const myGameResult = document.querySelector(".my-game-result");

const winnerName = document.querySelector("#winner .result-name h2");
const winnerWords = document.querySelector("#winner .result-words");

const loserName = document.querySelector("#loser .result-name h2");
const loserWords = document.querySelector("#loser .result-words");

function addWinnerInfo(name, words) {
    winnerName.innerHTML = name;

    words.forEach(word => {
        winnerWords.innerHTML += `<p>${word.word}: ${word.score}</p>`
    })
}

function addLoserInfo(name, words) {
    loserName.innerHTML = name;

    words.forEach(word => {
        loserWords.innerHTML += `<p>${word.word}: ${word.score}</p>`
    })
}

// Game state
let socket;
let gameId;
let playerId;
let currentRack = [];
let currentWord = [];

const GlobalData = {
    socket: null,
    gameId: "",
    playerId: "",
    playerName: '',
    currentRack: [],
    currentWord: [],
    avatar: null
}

// Connect to Socket.io server
function connectToServer() {
    socket = io("/word");
    GlobalData.socket = socket;

    function removeAllListeners() {
        socket.off('gameJoined', handleGameJoined);
        socket.off('gameState', handleGameState);
        socket.off('gameStarted', handleGameStarted);
        socket.off('timeUpdate', handleTimeUpdate);
        socket.off('wordAccepted', handleWordAccepted);
        socket.off('wordRejected', handleWordRejected);
        socket.off('gameEnded', handleGameEnded);
        socket.off('playerLeft', handlePlayerLeft);
    
        socket.off('you-won', () => {
            alert("you won")
        });
    
        socket.off('you-lost', () => {
            alert("you lost")
        });
        
        socket.off('reconnected', handleReconnected);
    
        socket.off('gameError', handleGameError);
    }

    function addListeners() {
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
        
        socket.on('reconnected', handleReconnected);
    
        socket.on('gameError', handleGameError);
    }

    const url = new URL(window.location)

    const data = getSearchParams(url.search)
    
    // Socket event handlers
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);

        removeAllListeners();

        addListeners();

        joinGame(data);
    });

    // window.addEventListener("keydown", (e) => {
    //     // console.log(e.key);
    //     if(e.key == " ") {
    //         console.log("disconnected");
    //         socket.disconnect()
    //     }
    //     else if(e.key == "Enter") {
    //         console.log("connecting");
    //         socket.connect();
    //         // socket.emit("joinGame", {});
    //     }
    // })
}

function emitMessage(message, data) {
    GlobalData.socket.emit(message, data);
    // socket.emit(message, data);
}

function handleReconnected(data) {
    console.log("player reconnected: ", data);

    playerId = data.playerId;
    gameId = data.gameId;
    currentRack = data.rack;
    currentWord = []

    GlobalData.playerId = data.playerId;
    GlobalData.gameId = data.gameId;
    GlobalData.currentRack = [...data.rack];
    GlobalData.currentWord = []
    GlobalData.playerName = data.playerName;

    gameStatus.textContent = GlobalData.playerName;

    renderPlayers(data.gameState.players)

    returnLettersToRack();
}

// Join or create a game
async function joinGame(data) {
    try {
        const response = await fetch(`https://game-service-uny2.onrender.com/user-details/${data.playerId}`)

        if(!response.ok) {
            alert("error fetching avatar and username, default data used")

            const playerName = "player-" + data.playerId;

            emitMessage('joinGame', {
                ...data,
                gameId: data.lobbyCode,
                playerName,
                avatar: "https://game-service-uny2.onrender.com/game/Scrabble/a1.png"
            });

            console.log("emitting join game");

            return;
        }

        const json = await response.json();

        GlobalData.playerName = json.username;
        GlobalData.avatar = json.avatar;

        playerImage.src = GlobalData.avatar;
    
        emitMessage('joinGame', {
            ...data,
            gameId: data.lobbyCode,
            playerName: GlobalData.playerName,
            avatar: GlobalData.avatar
        });

        console.log("emitting join game");
    }
    catch(error) {
        alert("error fetching avatar and username, default data used")

        console.log(error);

        const playerName = "player-" + data.playerId;

        emitMessage('joinGame', {
            ...data,
            gameId: data.lobbyCode,
            playerName,
            avatar: "https://game-service-uny2.onrender.com/game/Scrabble/a1.png"
        });

        console.log("emitting join game");
    }
    
    // const playerName = "player-" + data.playerId;
    
    // // socket.emit('joinGame', {
    // //     ...data,
    // //     gameId: data.lobbyCode,
    // //     playerName
    // // });

    // emitMessage('joinGame', {
    //     ...data,
    //     gameId: data.lobbyCode,
    //     playerName
    // });

    // console.log("emitting join game");

}

// Handle successful game join
function handleGameJoined(data) {
    console.log(data);

    playerId = data.playerId;
    gameId = data.gameId;
    currentRack = data.rack;

    GlobalData.playerId = data.playerId;
    GlobalData.gameId = data.gameId;
    GlobalData.currentRack = [...data.rack];
    
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
    gameStatus.textContent = GlobalData.playerId;
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

    // playerScore.innerHTML = `Points: ${data.score}`
    
    // Return letters to rack and clear word area
    currentRack = currentRack.concat(currentWord);
    GlobalData.currentRack = GlobalData.currentRack.concat(GlobalData.currentWord);

    currentWord = [];
    GlobalData.currentWord = [];

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
    myGameResult.style.display = "block"

    const playerWinner = data.players.find(p => p.id == data.winner.id)
    const playerLoser = data.players.find(p => p.id != data.winner.id)

    addWinnerInfo(playerWinner.name, playerWinner.words)
    addLoserInfo(playerLoser.name, playerLoser.words)

    playerWinnerImage.src = playerWinner.avatar;
    playerLoserImage.src = playerLoser.avatar;

    gameContainer.style.display = "none"
    // gameStatus.textContent = 'Game Over';
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
    // joinForm.style.display = 'block';
    waitingScreen.style.display = 'none';
}

// Render the letter rack
function renderRack() {
    letterRack.innerHTML = '';
    
    // currentRack.forEach((letterObj, index) => {
    //     const tile = createLetterTile(letterObj.letter, letterObj.value, index);
    //     letterRack.appendChild(tile);
    // });

    GlobalData.currentRack.forEach((letterObj, index) => {
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
    tile.dataset.inRack = true;
    tile.draggable = true;
    
    // Add drag events
    // tile.addEventListener('dragstart', handleDragStart);
    // tile.addEventListener('dragend', handleDragEnd);
    tile.addEventListener('click', handleDragStart);
    // tile.addEventListener('touch', handleDragEnd);
    
    return tile;
}

// Handle drag start
function handleDragStart(e) {
    console.log(e);

    if(e.target.dataset.inRack == true || e.target.dataset.inRack == "true") {
        const data = e.target.dataset;
        data.inRack = false;

        // Find the tile in the rack
        const rackIndex = currentRack.findIndex((_, i) => i.toString() === data.index);
        if (rackIndex !== -1) {
            const letterObj = currentRack[rackIndex];
    
            // console.log(letterObj);
            
            // Create a new tile in the word area
            const tile = createLetterTile(letterObj.letter, letterObj.value, 'word-' + currentWord.length);
            wordArea.appendChild(tile);
            
            // Add to current word
            currentWord.push(letterObj);
            GlobalData.currentWord.push(letterObj);
            
            // Remove from rack
            currentRack.splice(rackIndex, 1);
            GlobalData.currentRack.splice(rackIndex, 1);
            renderRack();
        }
    }
    else {
        const data = e.target.dataset;
        data.inRack = true;

        // Check if it's from the word area
        if (data.index.toString().startsWith('word-')) {
            const wordIndex = parseInt(data.index.split('-')[1]);
            
            if (wordIndex >= 0 && wordIndex < currentWord.length) {
                const letterObj = currentWord[wordIndex];
                
                // Add back to rack
                currentRack.push(letterObj);
                GlobalData.currentRack.push(letterObj);
                
                // Remove from current word
                currentWord.splice(wordIndex, 1);
                GlobalData.currentWord.splice(wordIndex, 1);
                
                // Rerender
                renderRack();
                renderWord();
            }
        }
    }
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

            // console.log(letterObj);
            
            // Create a new tile in the word area
            const tile = createLetterTile(letterObj.letter, letterObj.value, 'word-' + currentWord.length);
            wordArea.appendChild(tile);
            
            // Add to current word
            currentWord.push(letterObj);
            GlobalData.currentWord.push(letterObj);
            
            // Remove from rack
            currentRack.splice(rackIndex, 1);
            GlobalData.currentRack.splice(rackIndex, 1);
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
                GlobalData.currentRack.push(letterObj);
                
                // Remove from current word
                currentWord.splice(wordIndex, 1);
                GlobalData.currentWord.splice(wordIndex, 1);
                
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
    
    // currentWord.forEach((letterObj, index) => {
    //     const tile = createLetterTile(letterObj.letter, letterObj.value, 'word-' + index);
    //     wordArea.appendChild(tile);
    // });

    GlobalData.currentWord.forEach((letterObj, index) => {
        const tile = createLetterTile(letterObj.letter, letterObj.value, 'word-' + index);
        wordArea.appendChild(tile);
    });
}

// Return letters to rack
function returnLettersToRack() {
    currentRack = currentRack.concat(currentWord);
    GlobalData.currentRack = GlobalData.currentRack.concat(GlobalData.currentWord);

    currentWord = [];
    GlobalData.currentWord = [];

    renderRack();
    renderWord();
}

// Submit the current word
function submitWord() {
    // console.log("submit word");
    if (currentWord.length === 0) return;
    
    // const word = currentWord.map(letterObj => letterObj.letter).join('');
    // // socket.emit('submitWord', { gameId, word });
    // emitMessage('submitWord', { gameId, word });

    if (GlobalData.currentWord.length === 0) return;
    const word = GlobalData.currentWord.map(letterObj => letterObj.letter).join('');
    emitMessage('submitWord', { gameId: GlobalData.gameId, word });
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
            playerScore.innerHTML = `Points: ${player.score}`
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
    connectToServer();

    setupDropZones();

    waitingScreen.style.display = 'block';

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