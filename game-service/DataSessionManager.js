/**
 * @template T
 * Manages session data for disconnected users across different games.
 */
export default class DataSessionManager {
    constructor() {
        /** @type {Map<string, { data: T, timestamp: number }>} */
        this.sessions = new Map();
    }

    /**
     * Store session data when a player disconnects.
     * @param {string} userId - Unique identifier for the player
     * @param {T} data - Game-specific session data
     */
    store(userId, data) {
        this.sessions.set(userId, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Restore session data when a player reconnects.
     * @param {string} userId - Unique identifier for the player
     * @returns {T | null} - Restored session data or null
     */
    restore(userId) {
        const session = this.sessions.get(userId);
        if (!session) return null;

        this.sessions.delete(userId);
        return session.data;
    }

    /**
     * Cleanup sessions older than a certain time.
     * @param {number} expiryMs - Expiry duration in milliseconds (default 5 minutes)
     */
    cleanup(expiryMs = 5 * 60 * 1000) {
        const now = Date.now();
        for (const [userId, session] of this.sessions.entries()) {
            if (now - session.timestamp > expiryMs) {
                this.sessions.delete(userId);
            }
        }
    }
}
