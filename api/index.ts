// Vercel serverless entry point. Env is injected by the platform, so unlike the
// local bootstrap this must not load dotenv — it would shadow Vercel's values.
import { createApp } from '../backend/src/app';

export default createApp();
