import { Request, Response } from "express";
import { query } from "../config/db";
import { AuthRequest } from "../middleware/auth";

// Save a recent search
export const saveSearch = async (req: AuthRequest, res: Response) => {
  try {
    const {
      from,
      to,
      fromEntityId,
      toEntityId,
      fromSkyId,
      toSkyId,
      departure,
      return: returnDate,
      cabinClass,
      passengers,
      bookType,
    } = req.body;

    const userId = req.user?.id || null;

    const result = await query(
      `
      INSERT INTO recent_searches (
        user_id,
        from_city,
        to_city,
        from_entity_id,
        to_entity_id,
        from_sky_id,
        to_sky_id,
        departure_date,
        return_date,
        cabin_class,
        adults,
        children,
        infants,
        book_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT ON CONSTRAINT unique_search_per_user
      DO UPDATE SET created_at = CURRENT_TIMESTAMP
      RETURNING *;
      `,
      [
        userId,
        from,
        to,
        fromEntityId,
        toEntityId,
        fromSkyId,
        toSkyId,
        departure,
        returnDate || null,
        cabinClass,
        passengers.adult,
        passengers.child,
        passengers.infant,
        bookType,
      ]
    );

    res.status(201).json(result[0]);
  } catch (err) {
    console.error("Error saving search:", err);
    res.status(500).json({ error: "Failed to save recent search" });
  }
};

// Retrieve recent searches for a user
export const getRecentSearches = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await query(
      `
        SELECT *
        FROM recent_searches
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10;
      `,
      [userId]
    );

    res.status(200).json(result);
  } catch (err) {
    console.error("Error fetching recent searches:", err);
    res.status(500).json({ error: "Failed to fetch recent searches" });
  }
};

// Delete a specific recent search
export const deleteRecentSearch = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { searchId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await query(
      `
      DELETE FROM recent_searches
      WHERE id = $1 AND user_id = $2
      RETURNING *;
      `,
      [searchId, userId]
    );

    if (result.length === 0) {
      return res
        .status(404)
        .json({ error: "Search not found or already deleted" });
    }

    res
      .status(200)
      .json({ message: "Search deleted successfully", deleted: result[0] });
  } catch (err) {
    console.error("Error deleting search:", err);
    res.status(500).json({ error: "Failed to delete recent search" });
  }
};
