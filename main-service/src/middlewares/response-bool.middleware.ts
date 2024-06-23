import {Request, Response, NextFunction} from 'express';

export default function (_: Request, res: Response, next: NextFunction) {
  // Store the original res.status and res.json functions
  const originalStatus = res.status.bind(res);
  const originalJson = res.json.bind(res);

  // Initialize a variable to store the status code
  res.statusCodeCaptured = 200; // Default status code is 200

  // Override res.status
  res.status = function (statusCode) {
    res.statusCodeCaptured = statusCode;
    return originalStatus(statusCode);
  };

  // Override res.json
  res.json = function (data) {
    // Append new field based on status code
    data.success = res.statusCodeCaptured
      ? res.statusCodeCaptured.toString().startsWith('20')
      : false;

    // Call the original res.json with the modified data
    return originalJson(data);
  };

  next();
}
