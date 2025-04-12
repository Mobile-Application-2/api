class ServerSnooker {

    /**
     * @param {GameRoom} room 
     */
    switchTurn(room) {
        room.data.turn = room.data.turn == 1 ? 2 : 1
        room.currentPlayer = room.data.turn == 1 ? room.player1 : room.player2
    }
    /**
     * @param {Matter.Body} ball 
     * @param {GameRoom} room
     * @param {World} world
     */
    pocketBallCollision(ball, room, world) {
        console.log("pocketed");
        room.data.validPocket = true;
        room.data.foul = false;

        if (!world) return;

        if (room.data.firstPlay) {
            // const currentPlayer = room.currentPlayer;
            const ballStates = room.game.getBallStates(world);

            const invalidCuePocketed = ballStates.filter(b => b.label == "cue").length < 1;

            if (invalidCuePocketed) {
                console.log("invalid cue pocket first play");

                room.data.invalidCuePocket = true;
                room.data.validPocket = false;
                room.data.foul = true;

                return
            }


            const player1 = room.data.turn == 1 ? room.player1 : room.player2;
            const player2 = room.data.turn == 1 ? room.player2 : room.player1;

            player1.color = ball.label.split(" ")[1];
            player2.color = player1.color == "red" ? "yellow" : "red";

            return;
        }

        const ballStates = room.game.getBallStates(world);

        const invalidCuePocketed = ballStates.filter(b => b.label == "cue").length < 1;

        if (invalidCuePocketed) {
            console.log("invalid cue pocket");

            room.data.invalidCuePocket = true;

            room.data.validPocket = false;

            room.data.foul = true;

            // io.emit('invalid_pocket', ball);

            return;
        }

        const currentPlayer = room.currentPlayer;

        if (!currentPlayer.color) {
            const playerC = currentPlayer.player == 1 ? room.player1 : room.player2;
            const playerD = currentPlayer.player == 1 ? room.player2 : room.player1;

            playerC.color = ball.label.split(" ")[1];
            playerD.color = playerC.color == "red" ? "yellow" : "red";
        }

        const invalidEightPocketed = ballStates.filter(b => b.label.split(" ")[1] == "eight").length < 1;

        if (!currentPlayer.final && invalidEightPocketed) {
            console.log("invalid eight pocket");

            const winner = room.data.turn == 1 ? room.player2 : room.player1;

            room.data.winner = winner;

            return;
        }

        // console.log(ballStates.filter(b => b.label.split(" ")[1] == currentPlayer.color));

        const inFinalStage = ballStates.filter(b => b.label.split(" ")[1] == currentPlayer.color).length < 1;

        if (inFinalStage) {
            console.log("in final");
            currentPlayer.final = true;
        }

        if (currentPlayer.final) {
            const eightPocketed = ballStates.filter(b => b.label.split(" ")[1] == "eight").length < 1;

            if (eightPocketed) {
                console.log("done");

                room.data.winner = { ...currentPlayer };
            }

            return;
        }
    }


    /**
     * @param {Matter.Body} cueBall 
     * @param {{x: number, y: number}} pos 
     * @param {World} world 
     */
    isValidPosition(cueBall, pos, world) {
        // 1. Check if within table boundaries (with cushion margin)
        const margin = 60; // pixels from edge
        if (pos.x - 19 < margin ||
            pos.x + 19 > 1500 - margin ||
            pos.y - 19 < margin ||
            pos.y + 19 > 825 - margin) {
            return false;
        }

        // 2. Check if not inside any pocket
        const pockets = [
            { x: 62, y: 62, r: 48 }, { x: 750, y: 32, r: 48 }, { x: 1435, y: 62, r: 48 },
            { x: 62, y: 762, r: 48 }, { x: 750, y: 794, r: 48 }, { x: 1435, y: 762, r: 48 }
        ];

        for (const pocket of pockets) {
            const distance = Math.sqrt(
                Math.pow(pos.x - pocket.x, 2) +
                Math.pow(pos.y - pocket.y, 2)
            );
            if (distance < pocket.r) {
                return false; // Inside a pocket
            }
        }

        // 3. (Optional) Check if overlapping other balls
        const ballRadius = 19;
        for (const body of world.bodies) {
            if (body.label.includes('ball') && body.id !== cueBall.id) {
                const distance = Math.sqrt(
                    Math.pow(pos.x - body.position.x, 2) +
                    Math.pow(pos.y - body.position.y, 2)
                );
                if (distance < ballRadius * 2) {
                    return false; // Overlapping another ball
                }
            }
        }

        return true; // All checks passed
    }
}

const serverSnooker = new ServerSnooker();

export { serverSnooker };