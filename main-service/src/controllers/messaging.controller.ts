import {Server, Socket} from 'socket.io';
import redisClient from '../utils/redis';
import {handle_messaging_error} from '../utils/handle-error';
import {ISendMessage, IMessageReceivedOrRead} from '../interfaces/message';
import mongoose, {isValidObjectId} from 'mongoose';
import USER from '../models/user.model';
import MESSAGEROOMS from '../models/message-rooms.model';
import MESSAGE from '../models/message.model';
import {processAndUpload} from '../utils/media-processing';
import NOTIFICATION from '../models/notification.model';

const ObjectId = mongoose.Types.ObjectId;

export async function handle_socket_disconnection(socket: Socket) {
  try {
    // remove socket data from redis which marks socket as offline
    const userId = await redisClient.get(socket.id);

    if (userId) {
      await redisClient.del(userId + '_messaging');
    }

    await redisClient.del(socket.id);
  } catch (error) {
    handle_messaging_error(error, socket);
  }
}

export async function send_message(
  socket: Socket,
  server: Server,
  args: ISendMessage
) {
  try {
    const {media} = args;
    let {text, recipientId, roomId} = args;
    const senderId = await redisClient.get(socket.id);

    if (senderId === null) {
      console.log("sender id not found");
      
      socket.emit('sender_id_not_found', 'Reconnect to re-save the user Id');
      return;
    }

    if (
      isValidObjectId(recipientId) === false &&
      isValidObjectId(roomId) === false
    ) {
      console.log("invalid id(s)");

      socket.emit(
        'invalid_request',
        'Please specify a valid recipient or room Id'
      );
      return;
    }

    // either the media is specified or a text must be specified
    if (
      typeof media === 'undefined' ||
      Array.isArray(media) === false ||
      media.length === 0
    ) {
      if (typeof text !== 'string' || text.trim().length === 0) {
        socket.emit(
          'invalid_request',
          'Text must be a string and can not be empty, if a media file is not sent'
        );
        return;
      }

      text = text.trim();
    }

    // start a session
    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: {w: 'majority'},
        readConcern: {level: 'local'},
      },
    });

    await session.withTransaction(async session => {
      try {
        // check if the roomId is valid and set
        if (isValidObjectId(roomId) === false) {
          console.log("not valid room id");
          
          // check if the recipientId belongs to any user first
          const recipientInfo = await USER.findOne({
            _id: new ObjectId(recipientId),
          });

          if (recipientInfo === null) {
            console.log("rec no exist");
            throw Error('The specified recipient does not exist');
          }

          // check if a room for this two users exists previously
          const room = await MESSAGEROOMS.findOne(
            {
              participants: {
                $size: 2,
                $all: [new ObjectId(recipientId), new ObjectId(senderId)],
              },
            },
            {},
            {session}
          );

          if (room !== null) {
            roomId = room._id.toString();
          } else {
            // create a new room
            const room = await MESSAGEROOMS.create(
              [
                {
                  participants: [recipientId, senderId],
                },
              ],
              {session}
            );

            roomId = room[0]._id.toString();
          }
        } else {
          const roomInfo = await MESSAGEROOMS.findOne({_id: roomId});

          // if I belong in this room and who the other member is
          if (roomInfo === null) {
            console.log("room not found");
            throw Error('Room not found');
          }

          const {participants} = roomInfo;
          const participantsIdAsStrings = participants.map(participant =>
            participant.toString()
          );

          if (participantsIdAsStrings.includes(senderId) === false) {
            console.log("You can not send messages here as you are not a participant in this conversation");
            throw Error(
              'You can not send messages here as you are not a participant in this conversation'
            );
          }

          // find the first match for the sender and assume the second as the receiver, helps when you are texting yourself
          // and can not use filter here
          const senderIdx = participantsIdAsStrings.indexOf(senderId);
          recipientId = participantsIdAsStrings.find(
            (_, idx) => idx !== senderIdx
          );
        }

        // process media using cloudinary and get the fields needed to save in the database
        const processedMedia = await processAndUpload(media);

        // save message
        const messageInfo = await MESSAGE.create(
          [
            {
              senderId,
              recipientId,
              roomId,
              text,
              media: processedMedia,
              sent: true,
              sentAt: new Date(),
            },
          ],
          {session}
        );

        // send back the message info to the client, remember the message just shows up as sending so it doesn't matter if the content is same
        // the client doesn't mark it as sent till emit this event, so now the client will have access to the messageId
        socket.emit('message_sent', messageInfo[0]);

        // check if the other client is online and emit the message to them
        const recipientSocketId = await redisClient.get(
          recipientId + '_messaging'
        );

        // TODO: push notification later
        if (recipientSocketId === null) {
          console.log("offline");
          const senderInfo = await USER.findOne({_id: senderId});

          if (senderInfo) {
            await NOTIFICATION.create(
              [
                {
                  userId: recipientId,
                  image: senderInfo.avatar || "https://game-service-uny2.onrender.com/game/Scrabble/a1.png",
                  title: 'New Message',
                  body: messageInfo[0].text
                    ? messageInfo[0].text
                    : `${senderInfo.username} sent you a new media`,
                },
              ],
              {session}
            );
          }

          await session.commitTransaction();
          return;
        }

        const allActiveSockets = await server.fetchSockets();

        const recipientSocket = allActiveSockets.find(
          socket => socket.id === recipientSocketId
        );

        // TODO: push notification later
        if (typeof recipientSocket === 'undefined') {
          console.log("undefined, push later");
          const senderInfo = await USER.findOne({_id: senderId});

          if (senderInfo) {
            await NOTIFICATION.create(
              [
                {
                  userId: recipientId,
                  image: senderInfo.avatar || "https://game-service-uny2.onrender.com/game/Scrabble/a1.png",
                  title: 'New Message',
                  body: messageInfo[0].text
                    ? messageInfo[0].text
                    : `${senderInfo.username} sent you a new media`,
                },
              ],
              {session}
            );
          }

          await session.commitTransaction();
          return;
        }

        console.log("pushing...");

        recipientSocket.emit('incoming_message', messageInfo[0]);

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();

        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_messaging_error(error, socket);
  }
}

export async function handle_message_received(
  socket: Socket,
  server: Server,
  args: IMessageReceivedOrRead
) {
  try {
    const currentUser = await redisClient.get(socket.id);
    const {messageId} = args;

    if (isValidObjectId(messageId) === false) {
      socket.emit('invalid_request', 'Message ID must be valid');
      return;
    }

    if (currentUser === null) {
      socket.emit('sender_id_not_found', 'Reconnect to resave the user Id');
      return;
    }

    const messageInfo = await MESSAGE.findOne({_id: messageId});

    if (messageInfo === null) {
      socket.emit('invalid_request', 'Message not found');
      return;
    }

    if (messageInfo.recipientId.toString() !== currentUser) {
      socket.emit(
        'invalid_request',
        'You are not the recipient of this message, you cannot send an ACK for it'
      );
      return;
    }

    // update the message to delivered
    const updatedMessageInfo = await MESSAGE.findOneAndUpdate(
      {_id: messageId},
      {delivered: true, deliveredAt: new Date()},
      {returnDocument: 'after'}
    );

    const {senderId} = messageInfo;

    // check if the other client is online and emit the message_delivered to them
    const senderSocketId = await redisClient.get(senderId + '_messaging');

    // sender is not online, do nothing they will see when they come back
    if (senderSocketId === null) {
      return;
    }

    const allActiveSockets = await server.fetchSockets();

    const senderSocket = allActiveSockets.find(
      socket => socket.id === senderSocketId
    );

    // recipient is not online, do nothing they will see when they come back
    if (typeof senderSocket === 'undefined') {
      return;
    }

    senderSocket.emit('message_delivered', updatedMessageInfo);
  } catch (error) {
    handle_messaging_error(error, socket);
  }
}

export async function handle_message_read(
  socket: Socket,
  server: Server,
  args: IMessageReceivedOrRead
) {
  try {
    const currentUser = await redisClient.get(socket.id);
    const {messageId} = args;

    if (isValidObjectId(messageId) === false) {
      socket.emit('invalid_request', 'Message ID must be valid');
      return;
    }

    if (currentUser === null) {
      socket.emit('sender_id_not_found', 'Reconnect to resave the user Id');
      return;
    }

    const messageInfo = await MESSAGE.findOne({_id: messageId});

    if (messageInfo === null) {
      socket.emit('invalid_request', 'Message not found');
      return;
    }

    if (messageInfo.recipientId.toString() !== currentUser) {
      socket.emit(
        'invalid_request',
        'You are not the recipient of this message, you cannot send an ACK for it'
      );
      return;
    }

    // if it's not delivered yet, update it to delivered then update to read
    let update = {};
    if (messageInfo.delivered === false) {
      update = {delivered: true, deliveredAt: new Date()};
    }

    // update the message to delivered
    const updatedMessageInfo = await MESSAGE.findOneAndUpdate(
      {_id: messageId},
      {read: true, readAt: new Date(), ...update},
      {returnDocument: 'after'}
    );

    const {senderId} = messageInfo;

    // check if the other client is online and emit the message_read to them
    const senderSocketId = await redisClient.get(senderId + '_messaging');

    // sender is not online, do nothing they will see when they come back
    if (senderSocketId === null) {
      return;
    }

    const allActiveSockets = await server.fetchSockets();

    const senderSocket = allActiveSockets.find(
      socket => socket.id === senderSocketId
    );

    // recipient is not online, do nothing they will see when they come back
    if (typeof senderSocket === 'undefined') {
      return;
    }

    senderSocket.emit('message_read', updatedMessageInfo);
  } catch (error) {
    handle_messaging_error(error, socket);
  }
}
