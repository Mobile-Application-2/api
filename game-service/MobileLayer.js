import { logger } from "./config/winston.config.js";

export default class MobileLayer {
    static async sendGameWon(io, mainRooms, winnerId, loserId, room_id) {
        const mainFoundRooms = mainRooms.filter(room => room.lobbyCode == room_id);
        
        logger.info("main found rooms", {mainFoundRooms});
        
        const gameResult = {
            winner: winnerId,
            loser: loserId
        }
        
        logger.info("result", gameResult);
        
        const mainServerRooms = mainFoundRooms.map(room => room.socketId);
        
        logger.info("main server rooms", {mainServerRooms});
        
        io.to(mainServerRooms).emit("gameEnd", gameResult);

        logger.info("emitted game end event")
    }
}