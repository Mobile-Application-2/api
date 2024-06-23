import {IMediaFromSocket} from './media';

export interface IMessageReceivedOrRead {
  messageId: string;
}

export interface ISendMessage {
  media?: IMediaFromSocket[];
  text?: string;
  recipientId?: string;
  roomId?: string;
}
