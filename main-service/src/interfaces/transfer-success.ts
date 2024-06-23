export default interface ITransferSuccess {
  amount: number;
  currency: string;
  domain: string;
  failures: any; // Could be null or an array of failure objects
  id: number;
  integration: {
    id: number;
    is_live: boolean;
    business_name: string;
  };
  reason: string;
  reference: string;
  source: string;
  source_details: any; // Could be null or contain additional details
  status: string;
  titan_code: any; // Could be null or contain Titan code
  transfer_code: string;
  transferred_at: Date | null; // Could be null or contain a date
  recipient: {
    active: boolean;
    currency: string;
    description: string;
    domain: string;
    email: string | null; // Could be null or contain email address
    id: number;
    integration: number;
    metadata: any; // Could be null or contain metadata
    name: string;
    recipient_code: string;
    type: string;
    is_deleted: boolean;
    details: {
      account_number: string;
      account_name: string | null; // Could be null or contain account name
      bank_code: string;
      bank_name: string;
    };
    created_at: Date;
    updated_at: Date;
  };
  session: {
    provider: string | null; // Could be null or contain provider
    id: string | null; // Could be null or contain session ID
  };
  created_at: Date;
  updated_at: Date;
}
