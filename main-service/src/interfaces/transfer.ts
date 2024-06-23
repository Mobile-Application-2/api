export default interface ITransferQueued {
  status: boolean;
  message: string;
  data: {
    reference: string;
    integration: number;
    domain: string;
    amount: number;
    currency: string;
    source: string;
    reason: string;
    recipient: number;
    status: 'success';
    transfer_code: string;
    id: number;
    createdAt: string;
    updatedAt: string;
  };
}
