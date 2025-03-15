import dotenv from "dotenv";

dotenv.config();

import winston from "winston";
import { Logtail } from "@logtail/node";
import { LogtailTransport } from "@logtail/winston";

const source = process.env.PROD_BETTERSTACK_SOURCE;

// Create a Logtail client
const logtail = new Logtail(source, {
    endpoint: 'https://s1236558.eu-nbg-2.betterstackdata.com',
});

// Create a Winston logger - passing in the Logtail transport
const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new LogtailTransport(logtail)],
});

console.log("logger created");

if (process.env.NODE_ENV == "production") {
    // Override console methods globally
    const stringifyArgs = (...args) => {
        return args.map(arg =>
            typeof arg === "object" && arg !== null ? JSON.stringify(arg, null, 2) : arg
        );
    };

    // Override console.log globally
    console.log = (...args) => logger.info(...stringifyArgs(...args));
    console.error = (...args) => logger.error(...stringifyArgs(...args));
    console.warn = (...args) => logger.warn(...stringifyArgs(...args));
    console.debug = (...args) => logger.debug(...stringifyArgs(...args));
}

export { logger, logtail }