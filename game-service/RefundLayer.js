import GameManager from "./GameManager.js"
import MainServerLayer from "./MainServerLayer.js";

export default class RefundLayer {
    /**@type {Map<string, GameManager>} */
    static refundTimers = new Map()

    /**
     * @param {string} lobbyId 
     * @param {method} cb - Callback for elapsed timer
     */
    static createOrStopRefundTimer(lobbyId, cb) {
        if (!this.refundTimers.has(lobbyId)) {
            logger.info("creating timer (10mins)");

            const gameManager = new GameManager();

            gameManager.createTimer(1000 * 60 * 10, async () => {
                await MainServerLayer.refundPlayers(lobbyId);

                cb(lobbyId);
            })

            gameManager.startTimer();

            this.refundTimers.set(lobbyId, gameManager);

            logger.info("timer created and started (10mins)");
        }
        else {
            const gameManager = this.refundTimers.get(lobbyId);

            if (!gameManager) {
                logger.info(`game manager not present with lobbyId: ${lobbyId}`);

                return;
            }

            logger.info(`cancelling timer (10mins), time remaining: ${gameManager.getTimeRemaining()}`);

            gameManager.cancelTimer();

            logger.info("timer cancelled (10mins)");

            this.refundTimers.delete(lobbyId);
        }
    }

    /**
     * @param {string} lobbyId 
     * @param {method} cb - Callback for elapsed timer
     */
    static createRefundTimer(lobbyId, cb) {
        if (!this.refundTimers.has(lobbyId)) {
            logger.info("creating timer (10mins)");

            const gameManager = new GameManager();

            gameManager.createTimer(1000 * 60 * 10, async () => {
                await MainServerLayer.refundPlayers(lobbyId);

                cb(lobbyId);
            })

            gameManager.startTimer();

            this.refundTimers.set(lobbyId, gameManager);

            logger.info("timer created and started (10mins)");
        }
    }

    /**
     * @param {string} lobbyId 
     */
    static stopRefundTimer(lobbyId) {
        const gameManager = this.refundTimers.get(lobbyId);

        if (!gameManager) {
            logger.info(`game manager not present with lobbyId: ${lobbyId}`);

            return;
        }

        logger.info(`cancelling timer (10mins), time remaining: ${gameManager.getTimeRemaining()}`);

        gameManager.cancelTimer();

        logger.info("timer cancelled (10mins)");

        this.refundTimers.delete(lobbyId);
    }
}