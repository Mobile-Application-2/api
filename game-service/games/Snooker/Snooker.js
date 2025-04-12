/** @type {import("./snooker")} */

import Matter from "matter-js";
import SnookerUtils from "./SKUtils.js";

export default class Snooker {
    gameSize = {
        x: 1500,
        y: 825
    }

    cushionWidth = 57;

    ballRadius = 19; // diameter = 38

    engine = this.setupRoom();

    setupRoom() {
        const engine = Matter.Engine.create();
        const world = engine.world;

        engine.gravity.x = 0
        engine.gravity.y = 0

        this.createWalls(world);
        this.createPockets(world);
        this.createStick(world);
        this.createBalls(world);

        return engine;
    }

    listenToEvents(pbc) {
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            // console.log("starting collision", event.pairs.length);

            event.pairs.forEach((pair) => {
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;

                // console.log("collision A label", bodyA.label);
                // console.log("collision B label", bodyB.label);

                // Check if a ball hit a pocket
                if (
                    (bodyA.label === 'ball' && bodyB.label.startsWith('ball'))
                ) {
                    // console.log("ball ball collision");

                    // 1. Calculate overlap depth
                    const overlap = pair.collision.depth;

                    // 2. Minimum separation to prevent sticking (1-2% of ball radius)
                    const minSeparation = this.ballRadius * 0.02;

                    // 3. If balls are overlapping too much
                    if (overlap > minSeparation) {
                        // Calculate separation vector
                        const direction = Matter.Vector.normalise({
                            x: bodyB.position.x - bodyA.position.x,
                            y: bodyB.position.y - bodyA.position.y
                        });

                        // Apply slight separation
                        const separation = Matter.Vector.mult(direction, (overlap - minSeparation) * 0.5);

                        Matter.Body.setPosition(bodyA, {
                            x: bodyA.position.x - separation.x,
                            y: bodyA.position.y - separation.y
                        });

                        Matter.Body.setPosition(bodyB, {
                            x: bodyB.position.x + separation.x,
                            y: bodyB.position.y + separation.y
                        });
                    }
                }

                if (
                    (bodyA.label === 'pocket' && bodyB.label.startsWith('ball')) ||
                    (bodyB.label === 'pocket' && bodyA.label.startsWith('ball'))
                ) {
                    console.log("pocket ball collision");
                    const ball = bodyA.label.startsWith('ball') ? bodyA : bodyB;

                    Matter.Composite.remove(this.engine.world, ball);

                    pbc(ball);
                }
            });
        });

        Matter.Events.on(this.engine, 'collisionActive', (event) => {
            // console.log("starting collision", event.pairs.length);

            event.pairs.forEach((pair) => {
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;

                // console.log("collision A label", bodyA.label);
                // console.log("collision B label", bodyB.label);

                if (
                    (bodyA.label === 'pocket' && bodyB.label.startsWith('cue')) ||
                    (bodyB.label === 'pocket' && bodyA.label.startsWith('cue'))
                ) {
                    console.log("pocket cue collision");
                    const ball = bodyA.label.startsWith('cue') ? bodyA : bodyB;
                    const pocket = bodyA.label.startsWith('pocket') ? bodyA : bodyB;

                    // Calculate distance between centers
                    const distance = Matter.Vector.magnitude(
                        Matter.Vector.sub(ball.position, pocket.position)
                    );

                    // console.log(pocket.circleRadius, pocket.circleRadius - this.ballRadius);

                    // Only trigger if ball's CENTER is inside the pocket radius
                    if (pocket.circleRadius && distance <= pocket.circleRadius) { // pocket.circleRadius = 48
                        console.log("Ball CENTER entered pocket!");
                        Matter.Composite.remove(this.engine.world, ball);

                        // Matter.Body.setPosition(ball, {
                        //     x: 200,
                        //     y: 200
                        // })


                        pbc(ball);

                        const cueBall = Matter.Bodies.circle(413, 413, 19, {
                            restitution: 0.95,
                            label: 'cue'
                        });

                        Matter.Composite.add(this.engine.world, cueBall);
                    }
                }
            });
        });
    }

    /**
     * 
     * @param {Matter.Body} cueBall 
     * @param {number} stickAngle 
     * @param {World} world 
     */
    calculateProjectionLinesV2(cueBall, stickAngle, world) {
        // Create a ghost ball positioned at the cue ball's position
        const ghostBall = Matter.Bodies.circle(
            cueBall.position.x,
            cueBall.position.y,
            // @ts-ignore
            cueBall.circleRadius,
            {
                isSensor: true,
            },
        );

        Matter.Body.applyForce(ghostBall, ghostBall.position, {
            x: Math.cos(stickAngle) * 100 * 0.1, // Scale force down
            y: Math.sin(stickAngle) * 100 * 0.1
        })

        // Create velocity vector from stick angle
        const speed = 1; // A reasonable speed for projection
        const velX = Math.cos(stickAngle) * speed;
        const velY = Math.sin(stickAngle) * speed;

        // Project lines for several steps
        const cueLine = [{ x: cueBall.position.x, y: cueBall.position.y }];
        const objectLine = { hit: false, points: [] };
        let collisionBody = null;

        // Project ghost ball forward
        for (let step = 1; step <= 1500; step += 9) {
            // Move ghost ball
            const newX = cueBall.position.x + velX * step;
            const newY = cueBall.position.y + velY * step;
            Matter.Body.setPosition(ghostBall, { x: newX, y: newY });

            // Check for collisions with all bodies
            for (const body of world.bodies) {
                if (body.id === cueBall.id || !body.label.startsWith("ball")) continue;

                // Use Matter's native collision detection
                const collision = Matter.Collision.collides(ghostBall, body, undefined);
                if (collision) {
                    // console.log("collision");
                    collisionBody = body;
                    cueLine.push({ x: newX, y: newY });

                    // We found our collision, calculate object ball trajectory
                    if (body.label.startsWith("ball")) {
                        objectLine.hit = true;
                        console.log(collision.normal);
                        const pair = Matter.Pair.create(collision, 16.66)
                        // Matter.Pair.update(pair, collision, 16.66)
                        Matter.Resolver.solveVelocity([pair], 16.66)
                        const fb = pair.bodyA.id == cueBall.id ? pair.bodyB : pair.bodyA;
                        // console.log(fb.velocity);

                        const nx = Matter.Vector.normalise(fb.velocity).x
                        const ny = Matter.Vector.normalise(fb.velocity).y

                        objectLine.points = [
                            // @ts-ignore
                            { x: body.position.x, y: body.position.y },
                            // @ts-ignore
                            {
                                x: body.position.x + nx * 300,
                                y: body.position.y + ny * 300
                            }
                        ];
                    }

                    return { cueBall: { points: cueLine }, objectBall: objectLine };
                }
            }

            // If no collision was found yet, add this point to the path
            cueLine.push({ x: newX, y: newY });
            // console.log("no collision");
        }

        return { cueBall: { points: cueLine }, objectBall: objectLine };
    }

    /**
     * 
     * @param {Matter.Body} cueBall 
     * @param {number} stickAngle 
     * @param {number} power 
     * @param {World} world 
     */
    // @ts-ignore
    calculateProjectionLines(cueBall, stickAngle, power, world) {
        // Create the projection lines for both the cue ball and potential object ball
        const projectionLines = {
            cueBall: { points: [{ x: 0, y: 0 }] },
            objectBall: { points: [{ x: 0, y: 0 }], hit: false }
        };

        projectionLines.cueBall.points.splice(0);
        projectionLines.objectBall.points.splice(0);

        // Direction vector from stick angle
        const dirX = Math.cos(stickAngle);
        const dirY = Math.sin(stickAngle);

        // Starting point (cue ball center)
        const startX = cueBall.position.x;
        const startY = cueBall.position.y;

        // Add cue ball start position
        projectionLines.cueBall.points.push({ x: startX, y: startY });

        // Find closest ball collision along ray
        let closestBall = null;
        let closestDistance = Infinity;
        let closestPoint = null;
        let closestNormal = null;

        // Check all balls for collisions
        const balls = world.bodies.filter(body =>
            body.label.startsWith("ball") && body.id !== cueBall.id);

        for (const ball of balls) {
            if (!ball.circleRadius) continue;

            // Calculate if and where the ray hits this ball
            const collision = SnookerUtils.rayCircleIntersection(
                startX, startY, dirX, dirY,
                // @ts-ignore
                ball.position.x, ball.position.y, ball.circleRadius + cueBall.circleRadius
            );

            if (collision && collision.distance < closestDistance) {
                closestBall = ball;
                closestDistance = collision.distance;
                closestPoint = collision.point;

                // Calculate normal vector (from collision point to ball center)
                const nx = (ball.position.x - collision.point.x) / ball.circleRadius;
                const ny = (ball.position.y - collision.point.y) / ball.circleRadius;
                closestNormal = { x: nx, y: ny };
            }
        }

        // Check walls/cushions for collisions
        const cushions = world.bodies.filter(body => body.label.startsWith("wall"));

        for (const cushion of cushions) {
            if (!cushion.vertices || cushion.vertices.length < 2) continue;

            // Check each edge of the cushion
            for (let i = 0; i < cushion.vertices.length; i++) {
                const v1 = cushion.vertices[i];
                const v2 = cushion.vertices[(i + 1) % cushion.vertices.length];

                const collision = SnookerUtils.rayLineIntersection(
                    startX, startY, dirX, dirY,
                    v1.x, v1.y, v2.x, v2.y
                );

                if (collision && collision.distance < closestDistance) {
                    closestBall = null;
                    closestDistance = collision.distance;
                    closestPoint = collision.point;
                    closestNormal = collision.normal;
                }
            }
        }

        // If we hit something, calculate the reflection
        if (closestPoint) {
            // Add end point of cue ball trajectory
            projectionLines.cueBall.points.push({
                x: closestPoint.x,
                y: closestPoint.y
            });

            // If we hit a ball, calculate its projection line
            if (closestBall) {
                projectionLines.objectBall.hit = true;

                // Add starting point for object ball
                projectionLines.objectBall.points.push({
                    x: closestBall.position.x,
                    y: closestBall.position.y
                });

                // Calculate object ball direction from collision normal
                // @ts-ignore
                const objectDirX = closestNormal.x;
                // @ts-ignore
                const objectDirY = closestNormal.y;

                // Project object ball path (just a straight line)
                const distance = 300; // How far to project the line
                projectionLines.objectBall.points.push({
                    x: closestBall.position.x + objectDirX * distance,
                    y: closestBall.position.y + objectDirY * distance
                });
            } else {
                // Calculate reflection off cushion
                // @ts-ignore
                const reflectedDir = SnookerUtils.reflect(dirX, dirY, closestNormal.x, closestNormal.y);

                // Project reflected cue ball path
                const distance = 300; // How far to project the line
                projectionLines.cueBall.points.push({
                    x: closestPoint.x + reflectedDir.x * distance,
                    y: closestPoint.y + reflectedDir.y * distance
                });
            }
        } else {
            // No collision, just draw a straight line
            const distance = 500; // How far to project the line
            projectionLines.cueBall.points.push({
                x: startX + dirX * distance,
                y: startY + dirY * distance
            });
        }

        return projectionLines;
    }

    /**
     * @param {World} world
     */
    createWalls(world) {
        /** @type {Matter.IChamferableBodyDefinition} */
        const wallConfig = {
            isStatic: true,
            restitution: 0.9,
            label: 'wall',
        }
        // Top wall
        Matter.Composite.add(world, Matter.Bodies.rectangle(this.gameSize.x / 2, this.cushionWidth / 2, this.gameSize.x, this.cushionWidth, wallConfig));

        // Bottom wall
        Matter.Composite.add(world, Matter.Bodies.rectangle(this.gameSize.x / 2, this.gameSize.y - this.cushionWidth / 2, this.gameSize.x, this.cushionWidth, wallConfig));

        // Left wall
        Matter.Composite.add(world, Matter.Bodies.rectangle(this.cushionWidth / 2, this.gameSize.y / 2, this.cushionWidth, this.gameSize.y, wallConfig));

        // Right wall
        Matter.Composite.add(world, Matter.Bodies.rectangle(this.gameSize.x - this.cushionWidth / 2, this.gameSize.y / 2, this.cushionWidth, this.gameSize.y, wallConfig));
    }

    /**
     * @param {World} world
     */
    createPockets(world) {
        const pocketsPositions = [
            { x: 62, y: 62 }, { x: 750, y: 32 }, { x: 1435, y: 62 },
            { x: 62, y: 762 }, { x: 750, y: 794 }, { x: 1435, y: 762 }
        ];

        pocketsPositions.forEach(pos => {
            Matter.Composite.add(world, Matter.Bodies.circle(pos.x, pos.y, 48, {
                isStatic: true,
                isSensor: true, // Lets balls pass through but triggers collision events
                label: 'pocket'
            }));
        });
    }

    /**
     * @param {World} world
     */
    createStick(world) {
        Matter.Composite.add(world, Matter.Bodies.rectangle(413, 413, 938, 22, {
            isSensor: true, // Lets balls pass through but triggers collision events
            label: 'stick'
        }));
    }

    /**
     * @param {World} world
     */
    createBalls(world) {
        const ballRadius = this.ballRadius;
        const ballRestitution = 0.95;

        // Red Balls
        const redBalls = [
            { x: 1056, y: 433 }, { x: 1090, y: 374 }, { x: 1126, y: 393 },
            { x: 1126, y: 472 }, { x: 1162, y: 335 }, { x: 1162, y: 374 },
            { x: 1162, y: 452 }
        ].map(pos => Matter.Bodies.circle(pos.x, pos.y, ballRadius, {
            restitution: ballRestitution,
            label: 'ball red'
        }));

        // Yellow Balls
        // const yellowBalls = [
        //     { x: 1322, y: 80 },
        //     // { x: 1022, y: 80 }
        // ].map(pos => Matter.Bodies.circle(pos.x, pos.y, ballRadius, {
        //     restitution: ballRestitution,
        //     label: 'ball yellow'
        // }));
        const yellowBalls = [
            { x: 1022, y: 413 }, { x: 1056, y: 393 }, { x: 1090, y: 452 },
            { x: 1126, y: 354 }, { x: 1126, y: 433 }, { x: 1162, y: 413 },
            { x: 1162, y: 491 }
        ].map(pos => Matter.Bodies.circle(pos.x, pos.y, ballRadius, {
            restitution: ballRestitution,
            label: 'ball yellow'
        }));

        // Cue Ball
        const cueBall = Matter.Bodies.circle(413, 413, ballRadius, {
            restitution: ballRestitution,
            label: 'cue'
        });

        // const cueBall = Matter.Bodies.circle(413, 413, ballRadius, {
        //     restitution: ballRestitution,
        //     label: 'cue'
        // });

        // Eight Ball
        // const eightBall = Matter.Bodies.circle(1190, 80, ballRadius, {
        //     restitution: ballRestitution,
        //     label: 'ball eight'
        // });
        const eightBall = Matter.Bodies.circle(1090, 413, ballRadius, {
            restitution: ballRestitution,
            label: 'ball eight'
        });

        Matter.Composite.add(world, [...redBalls, ...yellowBalls, cueBall, eightBall]);
    }

    // Helper: Get current ball positions/colors
    /**
     * 
     * @param {Matter.World} world  
     */
    getBallStates(world) {
        return world.bodies
            .filter(body => body.label !== 'wall' && body.label !== 'pocket' && body.label !== 'stick')
            .map(body => ({
                id: body.id,
                x: body.position.x,
                y: body.position.y,
                label: body.label
            }));
    }

    /**
     * 
     * @param {Matter.World} world  
     */
    getStickState(world) {
        return world.bodies
            .filter(body => body.label == 'stick')
            .map(body => ({
                id: body.id,
                x: body.position.x,
                y: body.position.y,
                label: body.label,
                rotation: body.angle
            }));
    }

    /**
     * 
     * @param {Matter.World} world  
     */
    // Helper: Get current ball positions/colors
    getWallStates(world) {
        // console.log(world.bodies.filter(b => b.label == "wall"));

        return world.bodies
            .filter(body => body.label == 'wall')
            .map(body => ({
                id: body.id,
                x: body.position.x,
                y: body.position.y,
                width: 57,
                height: 825,
                label: body.label
            }));
    }

    /**
     * 
     * @param {Matter.World} world  
     */
    getPocketStates(world) {
        return world.bodies
            .filter(body => body.label == 'pocket')
            .map(body => ({
                id: body.id,
                x: body.position.x,
                y: body.position.y,
                label: body.label
            }));
    }
}