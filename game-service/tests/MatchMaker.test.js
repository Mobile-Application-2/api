import { describe, it, expect, vi } from 'vitest';
import MatchMaker from '../MatchMaker.js'; // Adjust the path as needed

describe('MatchMaker', () => {
    it('should match two players when added', () => {
        const matchMaker = new MatchMaker();
        const matchHandler = vi.fn();
        matchMaker.on('match', matchHandler);

        matchMaker.addPlayer('player1');
        matchMaker.addPlayer('player2');

        // Expect a match event to have been emitted once.
        expect(matchHandler).toHaveBeenCalledTimes(1);
        const { playerA, playerB } = matchHandler.mock.calls[0][0];
        expect([playerA, playerB]).toEqual(expect.arrayContaining(['player1', 'player2']));
    });

    it('should not rematch already matched players', () => {
        const matchMaker = new MatchMaker();
        const matchHandler = vi.fn();
        matchMaker.on('match', matchHandler);

        // Add three players. The first two will match immediately.
        matchMaker.addPlayer('player1');
        matchMaker.addPlayer('player2');
        matchMaker.addPlayer('player3');

        expect(matchHandler).toHaveBeenCalledTimes(1);
        const firstMatch = matchHandler.mock.calls[0][0];
        // "player3" should remain unmatched.
        expect(matchMaker.waitingPlayers).toContain('player3');

        // Add a new player so that player3 can be matched with someone new.
        matchMaker.addPlayer('player4');

        // A second match should be emitted.
        expect(matchHandler).toHaveBeenCalledTimes(2);
        const secondMatch = matchHandler.mock.calls[1][0];
        const pairKey1 = [firstMatch.playerA, firstMatch.playerB].sort().join('-');
        const pairKey2 = [secondMatch.playerA, secondMatch.playerB].sort().join('-');

        // Ensure the same pair isn't repeated.
        expect(pairKey1).not.toEqual(pairKey2);
    });

    it('should trigger tryMatch after a match has ended and 2 new players are added', async () => {
        const matchMaker = new MatchMaker();
        const matchHandler = vi.fn();
        matchMaker.on('match', matchHandler);

        // Add two players to create an initial match.
        matchMaker.addPlayer('player1');
        matchMaker.addPlayer('player2');
        expect(matchHandler).toHaveBeenCalledTimes(1);
        const firstMatch = matchHandler.mock.calls[0][0];

        // Simulate completing the match. This should return both players.
        matchMaker.emit('matchCompleted', firstMatch);
        // Now add two new players.
        matchMaker.addPlayer('player3');
        matchMaker.addPlayer('player4');

        // Allow a brief delay for async matching to complete.
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Now we expect a second match to be created.
        expect(matchHandler).toHaveBeenCalledTimes(3);
        const secondMatch = matchHandler.mock.calls[1][0];
        const thirdMatch = matchHandler.mock.calls[2][0];

        // Since "player1" and "player2" are already matched, the new match should be between player3 and player4.
        expect(new Set([secondMatch.playerA, secondMatch.playerB])).toEqual(new Set(['player1', 'player3']));
        expect(new Set([thirdMatch.playerA, thirdMatch.playerB])).toEqual(new Set(['player2', 'player4']));
    });

    it('should match everyone to themselves', async () => {
        const matchMaker = new MatchMaker();
        const matchHandler = vi.fn();
        matchMaker.on('match', matchHandler);

        // Add two players to create an initial match.
        matchMaker.addPlayer('player1');
        matchMaker.addPlayer('player2');
        expect(matchHandler).toHaveBeenCalledTimes(1);
        const firstMatch = matchHandler.mock.calls[0][0];

        // Simulate completing the match. This should return both players.
        matchMaker.emit('matchCompleted', firstMatch);
        // Now add two new players.
        matchMaker.addPlayer('player3');
        matchMaker.addPlayer('player4');

        // Allow a brief delay for async matching to complete.
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Now we expect a second match to be created.
        expect(matchHandler).toHaveBeenCalledTimes(3);
        const secondMatch = matchHandler.mock.calls[1][0];
        const thirdMatch = matchHandler.mock.calls[2][0];

        // Since "player1" and "player2" are already matched, the new match should be between player3 and player4.
        expect(new Set([secondMatch.playerA, secondMatch.playerB])).toEqual(new Set(['player1', 'player3']));
        expect(new Set([thirdMatch.playerA, thirdMatch.playerB])).toEqual(new Set(['player2', 'player4']));

        matchMaker.emit('matchCompleted', secondMatch);
        matchMaker.emit('matchCompleted', thirdMatch);

        expect(matchHandler).toHaveBeenCalledTimes(5);
        const fourthMatch = matchHandler.mock.calls[3][0];
        const fifthMatch = matchHandler.mock.calls[4][0];

        expect(new Set([fourthMatch.playerA, fourthMatch.playerB])).toEqual(new Set(['player3', 'player2']));
        expect(new Set([fifthMatch.playerA, fifthMatch.playerB])).toEqual(new Set(['player1', 'player4']));
    });
    
    it('after exhausting matches, should keep players in waiting', async () => {
        const matchMaker = new MatchMaker();
        const matchHandler = vi.fn();
        matchMaker.on('match', matchHandler);

        // Add two players to create an initial match.
        matchMaker.addPlayer('player1');
        matchMaker.addPlayer('player2');
        expect(matchHandler).toHaveBeenCalledTimes(1);
        const firstMatch = matchHandler.mock.calls[0][0];

        // Simulate completing the match. This should return both players.
        matchMaker.emit('matchCompleted', firstMatch);
        // Now add two new players.
        matchMaker.addPlayer('player3');
        matchMaker.addPlayer('player4');

        // Allow a brief delay for async matching to complete.
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Now we expect a second match to be created.
        expect(matchHandler).toHaveBeenCalledTimes(3);
        const secondMatch = matchHandler.mock.calls[1][0];
        const thirdMatch = matchHandler.mock.calls[2][0];

        // Since "player1" and "player2" are already matched, the new match should be between player3 and player4.
        expect(new Set([secondMatch.playerA, secondMatch.playerB])).toEqual(new Set(['player1', 'player3']));
        expect(new Set([thirdMatch.playerA, thirdMatch.playerB])).toEqual(new Set(['player2', 'player4']));

        matchMaker.emit('matchCompleted', secondMatch);
        matchMaker.emit('matchCompleted', thirdMatch);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(matchHandler).toHaveBeenCalledTimes(5);
        const fourthMatch = matchHandler.mock.calls[3][0];
        const fifthMatch = matchHandler.mock.calls[4][0];

        expect(new Set([fourthMatch.playerA, fourthMatch.playerB])).toEqual(new Set(['player3', 'player2']));
        expect(new Set([fifthMatch.playerA, fifthMatch.playerB])).toEqual(new Set(['player1', 'player4']));

        matchMaker.emit('matchCompleted', fourthMatch);
        matchMaker.emit('matchCompleted', fifthMatch);

        await new Promise((resolve) => setTimeout(resolve, 10));

        const sixthMatch = matchHandler.mock.calls[5][0];

        expect(new Set([sixthMatch.playerA, sixthMatch.playerB])).toEqual(new Set(['player3', 'player4']));

        matchMaker.emit("matchCompleted", sixthMatch);

        // await new Promise((resolve) => setTimeout(resolve, 1000));

        expect(matchMaker.waitingPlayers).toEqual(expect.arrayContaining(["player1", "player2", "player3", "player4"]));
    });
});
