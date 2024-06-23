declare namespace Express {
  export interface Request {
    userId?: string; // Adding a new property 'userId'
  }

  export interface Response {
    statusCodeCaptured?: number;
  }
}
