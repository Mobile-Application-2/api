export default function generate_tournament_fixtures(
  players: string[],
  noOfGamesToPlay: number
): string[][][] {
  if (players.length % 2 !== 0) {
    throw new Error('Number of players must be even');
  }

  const fixtures: string[][][] = [];
  const half = players.length / 2;
  const leftPot = players.slice(0, half);
  const rightPot = players.slice(half);

  for (let i = 0; i < noOfGamesToPlay; i++) {
    const round: string[][] = [];

    for (let j = 0; j < half; j++) {
      round.push([leftPot[j], rightPot[j]]);
    }

    fixtures.push(round);

    // rotate the pots by 1 player anti-clockwise
    const lastLeftPotPlayer = leftPot.pop();
    const firstRightPotPlayer = rightPot.shift();

    if (!lastLeftPotPlayer || !firstRightPotPlayer) {
      throw new Error('Error rotating pots');
    }

    leftPot.unshift(firstRightPotPlayer);
    rightPot.push(lastLeftPotPlayer);
  }

  return fixtures;
}
