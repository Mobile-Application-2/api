import Matter from "matter-js"
import Snooker from "./Snooker";

export { }

declare global {
    type World = Matter.World;

    type Player = {
        color: string,
        player: number,
        final?: boolean,
    }

    type GameRoom = {
        lobbyCode: string,
        game: Snooker,
        player1: Player,
        player2: Player,
        currentPlayer: Player,
        engine: Matter.Engine,
        world: Matter.World,
        data: {
            turn: number,
            firstPlay: boolean,
            winner?: Player,
            validPocket: boolean,
            invalidCuePocket: boolean,
            foul: boolean,
            stillMoving: boolean
        }
    }
}