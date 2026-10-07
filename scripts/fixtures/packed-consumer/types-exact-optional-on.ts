import type {
  ErrorResponseDataInput,
  ErrorResponseInput,
} from '@vercel/error/server';

// @ts-expect-error exact optional types rejects explicit undefined for name
export const dataInput: ErrorResponseDataInput = {
  name: undefined,
  public: { message: 'Approved' },
};
// @ts-expect-error exact optional types rejects explicit undefined for stack
export const httpInput: ErrorResponseInput = {
  stack: undefined,
  public: { message: 'Approved' },
};
