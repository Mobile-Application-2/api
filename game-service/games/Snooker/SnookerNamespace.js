import Snooker from './Snooker.js';
import { serverSnooker } from "./ServerSnooker.js";
import Matter from 'matter-js';

const {
    isValidPosition,
    pocketBallCollision,
    switchTurn
} = serverSnooker

/**
 * @typedef SKI
 * @property {string} lobbyCode
 * @property {Array<{userId: string, socketId: string, username: string, avatar: string}>} players
 * @property {GameRoom} room
 * 
 */

export default class SnookerNamespace {
    /**@type {import('socket.io').Namespace} */
    snookerNamespace

    /**@type {Map<string, SKI>} */
    snookerRooms = new Map()

    /**@param {import('socket.io').Namespace} snookerNamespace */
    constructor(snookerNamespace) {
        this.snookerNamespace = snookerNamespace;
    }

    setupLocalRoom(lobbyCode) {
        const game = new Snooker();

        /** @type {GameRoom} */
        const room = {
            lobbyCode: lobbyCode,
            game: game,
            player1: {
                color: "",
                player: 1,
            },
            player2: {
                color: "",
                player: 2,
            },
            currentPlayer: {
                color: "",
                player: 1,
            },
            engine: game.engine,
            world: game.engine.world,
            data: {
                turn: 1,
                stillMoving: false,
                firstPlay: true,
                validPocket: false,
                invalidCuePocket: false,
                foul: true,
            },
        }

        return room;
    }

    joinServerRoom(socket, lobbyCode) {
        socket.join(lobbyCode);
    }

    createOrJoinRoom(lobbyCode, playerId, socketId) {
        const room = this.snookerRooms.get(lobbyCode);

        if (!room) {
            /**@type {SKI} */
            const newInterface = {
                lobbyCode: lobbyCode,
                room: this.setupLocalRoom(lobbyCode),
                players: [{
                    userId: playerId,
                    socketId: socketId,
                    username: "",
                    avatar: ""
                }]
            }

            this.snookerRooms.set(lobbyCode, newInterface);

            return newInterface;
        }
        else {
            room.players.push({
                userId: playerId,
                socketId: socketId,
                username: "",
                avatar: ""
            })

            return room;
        }
    }

    activate() {
        this.snookerNamespace.on('connection', (socket) => {
            console.log("user connected to snooker namespace", { socketId: socket.id });

            socket.on("disconnect", async () => {
                console.log("user disconnected to snooker namespace", { socketId: socket.id });

                this.removeSocketFromRoom(socket);
            })

            // socket.on("player_details", (lobbyCode, myPlayerNumber, username, avatar) => {
            //     const skyboardRoom = this.snookerRooms.get(lobbyCode);

            //     if (!skyboardRoom) return;

            //     skyboardRoom.players[myPlayerNumber - 1].username = username;
            //     skyboardRoom.players[myPlayerNumber - 1].avatar = avatar;
            // })

            socket.on("join_game", async (data) => {
                console.log("attempt to join game", { data });

                const skyboardRoom = this.createOrJoinRoom(data.lobbyCode, data.playerId, socket.id);
                this.joinServerRoom(socket, data.lobbyCode);

                skyboardRoom.players[skyboardRoom.players.length - 1].username = data.username;
                skyboardRoom.players[skyboardRoom.players.length - 1].avatar = data.avatar;

                const playerNumber = skyboardRoom.players.length == 1 ? 1 : 2

                socket.emit("get_player_number", playerNumber);

                if (skyboardRoom.players.length < 2) return;

                const game = skyboardRoom.room.game;

                game.listenToEvents((ball) => pocketBallCollision(ball, skyboardRoom.room, skyboardRoom.room.world))

                console.log("game starting...");

                const playerDetails = skyboardRoom.players.map(p => ({username: p.username, avatar: p.avatar}))

                this.snookerNamespace.to(data.lobbyCode).emit("players", playerDetails[0], playerDetails[1]);

                this.snookerNamespace.to(data.lobbyCode).emit("start_game");

                this.snookerNamespace.to(data.lobbyCode).emit("first_state",
                    game.getBallStates(skyboardRoom.room.world),
                    game.getWallStates(skyboardRoom.room.world),
                    game.getPocketStates(skyboardRoom.room.world),
                    game.getStickState(skyboardRoom.room.world)
                );
            })

            socket.on("rotate_stick", (lobbyCode, angle) => {
                const skyboardRoom = this.snookerRooms.get(lobbyCode);

                if (!skyboardRoom) return;

                const world = skyboardRoom.room.world;
                const game = skyboardRoom.room.game;

                const stick = world.bodies.find(body => body.label === 'stick');
                const cueBall = world.bodies.find(body => body.label === 'cue');

                if (!stick) {
                    console.warn("stick not found");

                    return;
                }

                if (!cueBall) {
                    console.warn("cue ball not found");

                    return;
                }

                Matter.Body.setAngle(stick, angle);

                // const lines = snooker.game.calculateProjectionLinesV2(cueBall, angle, world);
                const lines = game.calculateProjectionLines(cueBall, angle, 100, world);

                this.snookerNamespace.to(lobbyCode).emit("rotated_stick", game.getStickState(world), game.getBallStates(world), lines)
            })

            // Server should validate and broadcast new positions
            socket.on('move_cue', (lobbyCode, newPos) => {
                const skyboardRoom = this.snookerRooms.get(lobbyCode);

                if (!skyboardRoom) return;

                const world = skyboardRoom.room.world;
                const game = skyboardRoom.room.game;

                const cueBall = world.bodies.find(body => body.label === 'cue');
                const stick = world.bodies.find(body => body.label === 'stick');

                if (!cueBall) {
                    console.warn("cue ball not found");

                    return;
                }

                if (!stick) {
                    console.warn("stick not found");

                    return;
                }

                if (isValidPosition(cueBall, newPos, world)) {
                    Matter.Body.setPosition(cueBall, {
                        x: newPos.x,
                        y: newPos.y
                    });

                    Matter.Body.setPosition(stick, {
                        x: newPos.x,
                        y: newPos.y
                    });

                    this.snookerNamespace.to(lobbyCode).emit('cue_moved', cueBall.position, game.getBallStates(world), game.getStickState(world)); // Broadcast to all clients
                }
            });

            socket.on('strike', async (lobbyCode, data) => {
                const skyboardRoom = this.snookerRooms.get(lobbyCode);

                if (!skyboardRoom) return;

                const room = skyboardRoom.room;
                const game = room.game;
                const engine = room.engine;
                const world = room.world;

                if (room.data.stillMoving) {
                    return;
                }

                room.data.stillMoving = true;

                const { angle, force } = data;

                // 1. Find the cue ball (label: 'cue')
                const cueBall = world.bodies.find(body => body.label === 'cue');
                const stick = world.bodies.find(body => body.label === 'stick');


                if (!cueBall) {
                    console.warn("cue ball not found");

                    return;
                }

                if (!stick) {
                    console.warn("stick not found");

                    return;
                }

                // 2. Apply force to the cue ball
                Matter.Body.applyForce(cueBall, cueBall.position, {
                    x: Math.cos(angle) * force * 0.001, // Scale force down
                    y: Math.sin(angle) * force * 0.001
                });

                // 3. Simulate until balls stop moving
                let isMoving = true;

                await /** @type {Promise<void>} */(new Promise(resolve => {
                    const interval = setInterval(() => {
                        Matter.Engine.update(engine, 16); // 16ms timestep (~60fps)

                        // Check if all balls are nearly stopped
                        isMoving = world.bodies.some(body =>
                            body.label !== 'wall' &&
                            body.label !== 'pocket' &&
                            (Math.abs(body.velocity.x) > 0.01 || Math.abs(body.velocity.y) > 0.01)
                        );

                        // Broadcast updates to all clients
                        this.snookerNamespace.to(lobbyCode).emit('update', game.getBallStates(world));

                        if (!isMoving) {
                            Matter.Body.setPosition(stick, {
                                x: cueBall.position.x,
                                y: cueBall.position.y
                            });

                            room.data.stillMoving = false;

                            clearInterval(interval);

                            resolve()
                        }

                    }, 16);
                }))

                this.handleSwitchTurn(room)

                if (room.data.firstPlay) {
                    room.data.firstPlay = false;
                }
            });
        });
    }

    /**
     * @param {GameRoom} room 
     */
    handleSwitchTurn(room) {
        console.log("handle switch turn");
        if (room.data.winner) {
            console.log("winner", room.data.winner);

            this.snookerNamespace.to(room.lobbyCode).emit("winner", room.data.winner)
        }

        this.snookerNamespace.to(room.lobbyCode).emit('colors', room.player1, room.player2);

        this.snookerNamespace.to(room.lobbyCode).emit('foul', room.data.foul)

        const world = room.world

        const stick = world.bodies.find(body => body.label === 'stick');
        const cue = world.bodies.find(body => body.label === 'cue');

        if (!stick || !cue) {
            console.warn("no stick | cue");

            return;
        }

        Matter.Body.setPosition(stick, {
            x: cue.position.x,
            y: cue.position.y
        });

        
        // prevent turn switch if player netted
        if (room.data.validPocket) {
            console.log("continue");

            this.snookerNamespace.to(room.lobbyCode).emit("update_stick", {
                x: stick.position.x,
                y: stick.position.y,
                rotation: stick.angle,
                id: stick.id
            })
            room.data.validPocket = false;

            room.data.invalidCuePocket = false;
            room.data.foul = true;

            return;
        }

        switchTurn(room);

        this.snookerNamespace.to(room.lobbyCode).emit(
            'switch_turn',
            room.data.turn,
            room.data.invalidCuePocket ? true : false,
            room.game.getBallStates(world),
            room.game.getStickState(world)
        );

        // reset state
        room.data.invalidCuePocket = false;
        room.data.foul = true;
    }

    /**
     * 
     * @param {import('socket.io').Socket} socket 
     */
    removeSocketFromRoom(socket) {
        let keyToRemove = "";

        for (const [K, V] of this.snookerRooms) {
            const player = V.players.find(p => p.socketId == socket.id);

            if (player) {
                keyToRemove = K;

                break;
            }
        }

        if (keyToRemove) {

        }
    }
}