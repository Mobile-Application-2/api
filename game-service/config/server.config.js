import dotenv from "dotenv";

dotenv.config();

const node_env = process.env.NODE_ENV;

console.log(process.env.NODE_ENV);

const isDev = node_env == "development";
const isProd = node_env == "production";

export { isDev, isProd }