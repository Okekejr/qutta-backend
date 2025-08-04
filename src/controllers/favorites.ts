import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { query } from "../config/db";

// Add favorite
export const addFavorite = async (req: AuthRequest, res: Response) => {
  const userId = req?.user?.id;
  const { businessId } = req.body;

  if (!userId || !businessId) {
    return res.status(400).json({ error: "Missing userId or businessId" });
  }

  try {
    await query(
      "INSERT INTO favorites (user_id, business_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, businessId]
    );
    res.status(200).json({ message: "Added to favorites" });
  } catch (error) {
    console.error("Add favorite error:", error);
    res.status(500).json({ error: "Failed to add favorite" });
  }
};

// Remove favorite
export const removeFavorite = async (req: AuthRequest, res: Response) => {
  const userId = req?.user?.id;
  const { businessId } = req.params;

  if (!userId || !businessId) {
    return res.status(400).json({ error: "Missing userId or businessId" });
  }

  try {
    await query(
      "DELETE FROM favorites WHERE user_id = $1 AND business_id = $2",
      [userId, businessId]
    );
    res.status(200).json({ message: "Removed from favorites" });
  } catch (error) {
    console.error("Remove favorite error:", error);
    res.status(500).json({ error: "Failed to remove favorite" });
  }
};

// Get user's favorites
export const getFavorites = async (req: AuthRequest, res: Response) => {
  const userId = req?.user?.id;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const rows = await query(
      `
      SELECT 
        b.id, 
        b.name, 
        b.rating, 
        b.tag, 
        b.latitude, 
        b.longitude, 
        b.location,
        ARRAY_AGG(i.image) AS image
      FROM favorites f
      JOIN business_profiles b ON f.business_id = b.id
      LEFT JOIN business_images i ON i.business_id = b.id
      WHERE f.user_id = $1
      GROUP BY b.id
      `,
      [userId]
    );

    const formatted = rows.map((business) => ({
      id: business.id,
      name: business.name,
      rating: Number(business.rating),
      tag: business.tag,
      image: business.image,
      coordinates: {
        latitude: Number(business.latitude),
        longitude: Number(business.longitude),
        location: business.location,
      },
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error("Get favorites error:", error);
    res.status(500).json({ error: "Failed to get favorites" });
  }
};
