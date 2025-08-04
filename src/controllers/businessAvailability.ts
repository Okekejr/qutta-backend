import { query } from "../config/db";
import { Request, Response } from "express";

const validDays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function isValidDay(day: string) {
  return validDays.includes(day.toLowerCase());
}

// Get availability for a business
export const getAvailability = async (req: Request, res: Response) => {
  const { businessId } = req.params;
  try {
    const rows = await query(
      `
      SELECT day, is_closed, open_time, close_time
      FROM business_availability
      WHERE business_id = $1
      ORDER BY
        CASE day
          WHEN 'monday' THEN 1
          WHEN 'tuesday' THEN 2
          WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4
          WHEN 'friday' THEN 5
          WHEN 'saturday' THEN 6
          WHEN 'sunday' THEN 7
          ELSE 8
        END
      `,
      [businessId]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching availability:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Bulk upsert availability for a business
export const upsertAvailability = async (req: Request, res: Response) => {
  const { businessId } = req.params;
  const availabilities = req.body;

  if (!Array.isArray(availabilities)) {
    return res.status(400).json({ error: "Request body must be an array" });
  }

  try {
    // Start transaction
    await query("BEGIN", []);

    for (const entry of availabilities) {
      const { day, is_closed, open_time, close_time } = entry;
      if (!isValidDay(day)) {
        await query("ROLLBACK", []);
        return res.status(400).json({ error: `Invalid day: ${day}` });
      }
      if (typeof is_closed !== "boolean") {
        await query("ROLLBACK", []);
        return res
          .status(400)
          .json({ error: `is_closed must be boolean for day: ${day}` });
      }
      if (!is_closed) {
        if (!open_time || !close_time) {
          await query("ROLLBACK", []);
          return res.status(400).json({
            error: `open_time and close_time required when not closed for day: ${day}`,
          });
        }
        if (open_time >= close_time) {
          await query("ROLLBACK", []);
          return res.status(400).json({
            error: `open_time must be before close_time for day: ${day}`,
          });
        }
      }

      await query(
        `
        INSERT INTO business_availability (business_id, day, is_closed, open_time, close_time)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (business_id, day) DO UPDATE SET
          is_closed = EXCLUDED.is_closed,
          open_time = EXCLUDED.open_time,
          close_time = EXCLUDED.close_time,
          updated_at = NOW()
        `,
        [
          businessId,
          day.toLowerCase(),
          is_closed,
          open_time || null,
          close_time || null,
        ]
      );
    }

    await query("COMMIT", []);
    res.json({ message: "Availability updated successfully" });
  } catch (error) {
    await query("ROLLBACK", []);
    console.error("Error upserting availability:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update a single day's availability
export const updateAvailabilityDay = async (req: Request, res: Response) => {
  const { businessId, day } = req.params;
  const { is_closed, open_time, close_time } = req.body;

  if (!isValidDay(day)) {
    return res.status(400).json({ error: `Invalid day: ${day}` });
  }
  if (typeof is_closed !== "boolean") {
    return res.status(400).json({ error: "is_closed must be boolean" });
  }
  if (!is_closed) {
    if (!open_time || !close_time) {
      return res
        .status(400)
        .json({ error: "open_time and close_time required when not closed" });
    }
    if (open_time >= close_time) {
      return res
        .status(400)
        .json({ error: "open_time must be before close_time" });
    }
  }

  try {
    const rows = await query(
      `
      UPDATE business_availability SET
        is_closed = $1,
        open_time = $2,
        close_time = $3,
        updated_at = NOW()
      WHERE business_id = $4 AND day = $5
      RETURNING *
      `,
      [
        is_closed,
        open_time || null,
        close_time || null,
        businessId,
        day.toLowerCase(),
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Availability entry not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error updating availability:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete a day's availability
export async function deleteAvailabilityDay(req: Request, res: Response) {
  const { businessId, day } = req.params;
  if (!isValidDay(day)) {
    return res.status(400).json({ error: `Invalid day: ${day}` });
  }

  try {
    const result = await query(
      `DELETE FROM business_availability WHERE business_id = $1 AND day = $2`,
      [businessId, day.toLowerCase()]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: "Availability entry not found" });
    }
    res.json({ message: "Availability deleted" });
  } catch (error) {
    console.error("Error deleting availability:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
