import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const database = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // only needed on Railway public connections
  },
});

export const query = async (text: string, params: any[] = []) => {
  const client = await database.connect();
  try {
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
};
