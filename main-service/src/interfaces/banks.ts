interface Bank {
  name: string;
  slug: string;
  code: string;
  longcode: string;
  gateway: any; // You can replace 'any' with a more specific type if needed
  pay_with_bank: boolean;
  active: boolean;
  is_deleted: boolean;
  country: string;
  currency: string;
  type: string;
  id: number;
  createdAt: string;
  updatedAt: string;
}

interface Meta {
  next: string | null;
  previous: string | null;
  perPage: number;
}

export interface BanksResponse {
  status: boolean;
  message: string;
  data: Bank[];
  meta: Meta;
}
