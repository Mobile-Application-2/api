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
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new LogtailTransport(logtail)],
});

console.log("logger created");

if(process.env.NODE_ENV == "production") {
    // Override console.log globally
    console.log = (...args) => logger.info(args.map(String).join(" "));
    console.error = (...args) => logger.error(args.map(String).join(" "));
    console.warn = (...args) => logger.warn(args.map(String).join(" "));
    console.debug = (...args) => logger.debug(args.map(String).join(" "));
}

export { logger, logtail }