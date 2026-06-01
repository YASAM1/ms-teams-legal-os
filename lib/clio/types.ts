export type ClioClient = {
  id: number;
  name: string;
  first_name?: string;
  last_name?: string;
  primary_email_address?: string;
  primary_phone_number?: string;
  type: 'Person' | 'Company';
  created_at: string;
  updated_at: string;
};

export type ClioMatter = {
  id: number;
  display_number: string;
  description?: string;
  status: 'open' | 'pending' | 'closed';
  client?: { id: number; name: string };
  practice_area?: { id: number; name: string };
  custom_field_values?: ClioCustomFieldValue[];
  created_at: string;
  updated_at: string;
};

export type ClioCustomFieldValue = {
  id: number;
  field_name: string;
  field_type: string;
  value: string | number | boolean | null;
  custom_field?: { id: number; name: string };
};

export type ClioCustomField = {
  id: number;
  name: string;
  parent_type: 'Matter' | 'Contact';
  field_type: string;
  displayed: boolean;
  required: boolean;
};

export type ClioNote = {
  id: number;
  subject?: string;
  detail: string;
  date: string;
  type: 'Matter' | 'Contact';
  matter?: { id: number };
  contact?: { id: number };
};

export type ClioCommunication = {
  id: number;
  subject?: string;
  body?: string;
  type: 'EmailCommunication' | 'PhoneCommunication' | 'Communication';
  date: string;
  matter?: { id: number };
};

export type ClioActivity = {
  id: number;
  type: 'TimeEntry' | 'ExpenseEntry';
  date: string;
  quantity: number;
  price: number;
  total: number;
  note?: string;
  matter?: { id: number };
};
