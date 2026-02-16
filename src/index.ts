import { config } from "dotenv";
config();

const required = ["JELLYFIN_HOST", "JELLYFIN_USERNAME", "JELLYFIN_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
}

import "./jellyfin"
import "./webserver"