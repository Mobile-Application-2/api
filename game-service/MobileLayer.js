import { logger } from "./config/winston.config.js";

export default class MobileLayer {
    static async sendGameWon(io, mainRooms, winnerId, loserId, room_id) {
        logger.info("main rooms before sending", { mainRooms });

        const mainFoundRooms = mainRooms.filter(room => room.lobbyCode == room_id);

        logger.info("main found rooms", { mainFoundRooms });

        const gameResult = {
            winner: winnerId,
            loser: loserId
        }

        logger.info("result", gameResult);

        const mainServerRooms = mainFoundRooms.map(room => room.socketId);

        logger.info("main server rooms", { mainServerRooms });

        logger.info("sending in 5 seconds...")

        setTimeout(() => {
            io.to(mainServerRooms).emit("gameEnd", gameResult);

            logger.info("emitted game end event")
        }, 5000)

        // Mutate the original array by removing elements
        for (let i = mainRooms.length - 1; i >= 0; i--) {
            if (mainRooms[i].lobbyCode === room_id) {
                mainRooms.splice(i, 1);
            }
        }
    }
}