declare namespace Express {
  export interface Request {
    userId?: string; // Adding a new property 'userId'
    isCelebrity?: string;
  }

  export interface Response {
    statusCodeCaptured?: number;
  }
}
