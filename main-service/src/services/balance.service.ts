// JOSHUA
// SERVICE FOR BALANCE UPDATES

import { Server, Namespace } from 'socket.io';

let balanceNamespace: Namespace;

export const initBalanceSocketService = (io: Server) => {
  balanceNamespace = io.of('/balance');
};

export const getBalanceNamespace = (): Namespace => {
  if (!balanceNamespace) {
    throw new Error('Balance namespace not initialized!');
  }
  return balanceNamespace;
};

export const notifyUserBalanceUpdate = (userId: string, newBalance: number) => {
  const namespace = getBalanceNamespace();
  namespace.to(`user_${userId}`).emit('balance_updated', { balance: newBalance });
};