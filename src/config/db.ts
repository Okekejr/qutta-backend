import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const database = new Pool({
  user: process.env.USER_DB,
  host: process.env.HOST,
  database: process.env.NAME,
  password: process.env.PASS,
  port: 5432,
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
