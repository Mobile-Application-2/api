import MainServerLayer from "../MainServerLayer.js";
import { logger } from "../config/winston.config.js";
import initializeDeck from "./functions/initializeDeck.js"
import reverseState from "./functions/reverseState.js";
import GameModel from "./models/game.model.js";

export default class Whot {
  // static async addRoom(roomID, setup, ludoRooms) {
  //   const roomObject = {
  //       roomID: roomID,
  //       setup: setup
  //   }

  //   ludoRooms.push(roomObject);

  //   logger.info(roomObject);

  //   const gameModel = new GameModel({
  //       game_name: "Ludo",
  //       players: [],
  //       roomID: roomID
  //   });

  //   await gameModel.save();
  // }

  /**
   * @typedef {Object} GameData
   * @property {string} gameId - The unique identifier for the game.
   * @property {string} playerId - The unique identifier for the player.
   * @property {string} opponentId - The unique identifier for the opponent.
   * @property {string} stakeAmount - The amount staked in the game.
   * @property {string} tournamentId - The unique identifier for tournaments.
   * @property {string} lobbyCode - The unique lobby code for the game.
   * @property {string} gameName - The name of the game.
   * 
   */

  /**
   * Activates the game logic for handling WebSocket connections.
   * 
   * @param {import("socket.io").Server} io - The main Socket.IO server instance.
   * @param {import("socket.io").Namespace} whotNamespace - The specific namespace for the Whot game.
   * @param {Array<GameData>} mainRooms - A map of active game rooms.
   */
  static activate(io, whotNamespace, mainRooms) {
    let rooms = [];

    whotNamespace.on("connection", (socket) => {
      logger.info("a user connected to whot server");
      socket.on('disconnect', () => {
        logger.info("user disconnected from whot", socket.id);

        // if(rooms)

        // logger.info(rooms[0].players);

        logger.info(rooms, socket.id);

        const room = rooms.find(room => room.players.includes(room.players.find(player => player.socketId == socket.id)));

        logger.info(room);
        if (!room) return;

        io.emit('remove', 'whot', room.room_id);
      })

      socket.on("join_room", async ({ room_id, storedId, username, avatar, userId }) => {
        if (room_id?.length != 6) {
          whotNamespace.to(socket.id).emit(
            "error",
            "Sorry! Seems like this game link is invalid. Just go back and start your own game 🙏🏾."
          );
          return;
        }

        socket.join(room_id);
        let currentRoom = rooms.find((room) => room.room_id == room_id);
        logger.info("is there a room?", currentRoom);

        if (!currentRoom) {
          logger.info("no room, creating one");

          // Add room to store
          const { deck, userCards, usedCards, opponentCards, activeCard } = initializeDeck();

          const playerOneState = {
            deck,
            userCards,
            usedCards,
            opponentCards,
            activeCard,
            whoIsToPlay: "user",
            infoText: "It's your turn to make a move now",
            infoShown: true,
            stateHasBeenInitialized: true,
            player: "one",
          };

          rooms.push({
            room_id,
            players: [
              {
                storedId,
                socketId: socket.id,
                player: "one",
                username: username,
                avatar: avatar,
                userId: userId
              },
            ],
            playerOneState,
          });

          whotNamespace.to(socket.id).emit("dispatch", {
            type: "INITIALIZE_DECK",
            payload: playerOneState,
          });

          return;
        }

        logger.info("theres a room");

        let currentPlayers = currentRoom.players;

        logger.info("current players, ", currentPlayers);

        if (currentPlayers.length == 1) {
          // If I'm the only player in the room, get playerOneState, and update my socketId
          if (currentPlayers[0].storedId == storedId) {
            logger.info("maybe reconnecting, i dont know");
            whotNamespace.to(socket.id).emit("dispatch", {
              type: "INITIALIZE_DECK",
              payload: currentRoom.playerOneState,
            });

            rooms = rooms.map((room) => {
              if (room.room_id == room_id) {
                return {
                  ...room,
                  players: [{ storedId, socketId: socket.id, player: "one" }],
                };
              }
              return room;
            });
          }
          else {
            logger.info("joining already created game");
            rooms = rooms.map((room) => {
              if (room.room_id == room_id) {
                return {
                  ...room,
                  players: [
                    ...room.players,
                    { storedId, socketId: socket.id, player: "two", username: username, avatar: avatar, userId: userId },
                  ],
                };
              }
              return room;
            });

            currentRoom = rooms.find((room) => room.room_id == room_id);
            currentPlayers = currentRoom.players;

            logger.info("room after adding new player", currentRoom);
            logger.info("current players", currentPlayers);

            whotNamespace.to(socket.id).emit("dispatch", {
              type: "INITIALIZE_DECK",
              payload: reverseState(currentRoom.playerOneState),
            });

            // Check if my opponent is online
            socket.broadcast.to(room_id).emit("confirmOnlineState");

            const opponent = currentPlayers.find(player => player.storedId != storedId)
            logger.info("opponent", opponent);

            let opponentSocketId = opponent.socketId;
            whotNamespace.to(opponentSocketId).emit("opponentOnlineStateChanged", true);

            let playerOneInfo = currentPlayers[0];
            let playerTwoInfo = currentPlayers[1];

            currentRoom.turn = 1;

            whotNamespace.to(room_id).emit("start", playerOneInfo, playerTwoInfo, currentRoom.turn);

            logger.info("room id / lobby code: ", room_id);

            const lobbyID = await MainServerLayer.getLobbyID(room_id);

            logger.info("lobbyID: ", lobbyID);

            await MainServerLayer.startGame(lobbyID);

            logger.info("done sending info to main server");
          }
        }
        else {
          // // Check if player can actually join room, after joining, update his socketId
          // let currentPlayer = currentPlayers.find(
          //   (player) => player.storedId == storedId
          // );

          // if(!currentPlayer) {
          //   whotNamespace.to(socket.id).emit(
          //     "error",
          //     "Sorry! There are already two players on this game, just go back and start your own game 🙏🏾."
          //   );

          //   return;
          // }

          // whotNamespace.to(socket.id).emit("dispatch", {
          //   type: "INITIALIZE_DECK",
          //   payload:
          //     currentPlayer.player == "one"
          //       ? currentRoom.playerOneState
          //       : reverseState(currentRoom.playerOneState),
          // });

          // rooms = rooms.map((room) => {
          //   if (room.room_id == room_id) {
          //     return {
          //       ...room,
          //       players: [...room.players].map((player) => {
          //         if (player.storedId == storedId) {
          //           return {
          //             storedId,
          //             socketId: socket.id,
          //             player: currentPlayer.player,
          //           };
          //         }
          //         return player;
          //       }),
          //     };
          //   }
          //   return room;
          // });

          // let opponentSocketId = currentPlayers.find(
          //   (player) => player.storedId != storedId
          // ).socketId;

          // whotNamespace.to(opponentSocketId).emit("opponentOnlineStateChanged", true);

          // // Check if my opponent is online
          // socket.broadcast.to(room_id).emit("confirmOnlineState");

          // if (currentPlayer) {
          // }
          // else {

          // }
        }

        if (currentRoom) {
        }
        else {

        }
      });

      socket.on("sendUpdatedState", (updatedState, room_id) => {
        logger.info("update state", room_id, rooms);
        const playerOneState = updatedState.player === "one" ? updatedState : reverseState(updatedState);
        const playerTwoState = reverseState(playerOneState);
        rooms = rooms.map((room) => {
          if (room.room_id == room_id) {
            logger.info("room to update player state", room);
            return {
              ...room,
              playerOneState,
            };
          }
          return room;
        });

        logger.info("rooms after update state");

        socket.broadcast.to(room_id).emit("dispatch", {
          type: "UPDATE_STATE",
          payload: {
            playerOneState,
            playerTwoState,
          },
        });

        logger.info("dispatched update state");

        logger.info("rooms to find current room", rooms.map(room => room.room_id));

        const currentRoom = rooms.find((room) => room.room_id == room_id);

        if (!currentRoom) {
          logger.info(room_id, rooms);

          logger.info("no current room to broadcast too");

          return;
        }
        currentRoom.turn = playerOneState.infoText == "It's your opponent's turn to make a move now" ? 2 : 1
        // currentRoom.turn = currentRoom.turn == 1 ? 2 : 1;

        // logger.info(playerOneState.player, "p1")
        // logger.info(playerTwoState.player, "p2")

        whotNamespace.to(room_id).emit('change_turn', currentRoom.turn)
      });

      socket.on("game_over", async (room_id, isWinner) => {
        // rooms = rooms.filter((room) => room.room_id != room_id);

        if (isWinner) {
          try {
            logger.info(isWinner);
            
            // const 

            // io.to(mainRooms)

            const currentRoom = rooms.filter(room => room.room_id == room_id)[0];

            logger.info("winner current room", currentRoom);

            const winner = currentRoom.players.find(player => player.socketId == socket.id);
            const loser = currentRoom.players.find(player => player.socketId != socket.id);

            const winnerId = winner.userId;
            const loserId = loser.userId;

            const gameModel = new GameModel({
              game_name: "whot",
              roomID: room_id,
              players: [
                {
                  socketID: socket.id,
                  username: "kida",
                  winner: true,
                  userID: winnerId
                }
              ]
            })

            await gameModel.save();

            const mainFoundRooms = mainRooms.filter(room => room.lobbyCode == room_id);

            logger.info("main found rooms", mainFoundRooms);
            
            const gameResult = {
              winner: winnerId,
              loser: loserId
            }

            logger.info("result whot", gameResult);

            const mainServerRooms = mainFoundRooms.map(room => room.socketId);

            logger.info("main server rooms", mainServerRooms);
            

            io.to(mainServerRooms).emit("gameEnd", gameResult);

            const lobbyId = await MainServerLayer.getLobbyID(room_id);

            await MainServerLayer.wonGame(lobbyId, winnerId);
          }
          catch (error) {
            logger.error(error);
          }
        }
      });

      socket.on("disconnect", () => {
        // Find the room the player disconnected from
        let currentRoom = rooms.find((room) =>
          room.players.map((player) => player.socketId).includes(socket.id)
        );
        if (currentRoom) {
          let opponentSocketId = currentRoom.players.find(
            (player) => player.socketId != socket.id
          )?.socketId;
          if (!opponentSocketId) return;
          whotNamespace.to(opponentSocketId).emit("opponentOnlineStateChanged", false);
        }
      });

      socket.on("confirmOnlineState", (storedId, room_id) => {
        let currentRoom = rooms.find((room) => room.room_id == room_id);
        if (currentRoom) {
          let opponentSocketId = currentRoom.players.find(
            (player) => player.storedId != storedId
          ).socketId;
          whotNamespace.to(opponentSocketId).emit("opponentOnlineStateChanged", true);
        }
      });
    });
  }
}