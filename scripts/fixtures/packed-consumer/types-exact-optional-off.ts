import {
  buildErrorResponseData,
  errorResponse,
  type ErrorResponseDataInput,
  type ErrorResponseInput,
} from '@vercel/error/server';

const dataInput: ErrorResponseDataInput = {
  name: undefined,
  public: { message: 'Approved' },
};
const httpInput: ErrorResponseInput = {
  stack: undefined,
  public: { message: 'Approved' },
};

buildErrorResponseData(dataInput);
errorResponse(dataInput);
buildErrorResponseData(httpInput);
errorResponse(httpInput);
