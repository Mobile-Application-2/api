import amqplib from 'amqplib';
import dotenv from "dotenv"

dotenv.config();

// export interface IGameWon {
//     lobbyId: mongoose.Types.ObjectId;
//     winnerId: mongoose.Types.ObjectId;
// }

// export interface IStartTournamentNotification {
//     email: string;
//     message: string;
// }

// export interface ITournamentFixtureWon {
//     fixtureId: mongoose.Types.ObjectId;
//     winnerId: mongoose.Types.ObjectId;
// }


let channel;

const init = async (tries = 0) => {
    try {
        const connection = await amqplib.connect(process.env.RABBITMQ_URL);
        channel = await connection.createChannel();
        console.log("connected to channel");
    } catch (error) {
        if (error.code === 'ECONNREFUSED' && tries < 10) {
            console.log("trying again");

            setTimeout(() => init(tries + 1), 1500);
            
            return;
        }
    }
};

// type queueType =
//   | 'game-info-win'
//   | 'tournament-started-notification'
//   | 'tournament-info-win';

export const publish_to_queue = async (
    queueName/*:  queueType */,
    data/* : IGameWon | IStartTournamentNotification | ITournamentFixtureWon */,
    queueIsDurable/* : boolean */,
    options/* ?: amqplib.Options.Publish */
) => {
    if (!channel) {
        await init(); // Ensure the channel is initialized before trying to send a message
    }

    channel.assertQueue(queueName, { durable: queueIsDurable });

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)));
};

// Initialize the connection and channel when the module is loaded
init().catch(err =>
    console.log("error connecting: " + err)
);
