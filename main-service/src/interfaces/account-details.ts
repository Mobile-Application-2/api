interface AccountInfo {
  account_number: string;
  account_name: string;
  bank_id?: number;
  bank_name: string;
}

export interface AccountDetails {
  status: boolean;
  message: string;
  data: AccountInfo;
}
