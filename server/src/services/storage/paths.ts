import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Absolute path to the on-disk uploads root. */
export const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");
