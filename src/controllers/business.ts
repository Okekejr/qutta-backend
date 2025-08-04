import { Request, Response } from "express";
import { uploadToS3 } from "../lib/s3";
import { AuthRequest } from "../middleware/auth";
import { query } from "../config/db";

export const createBusinessProfile = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { name, tag, about, phone_number } = req.body;
    const coordinates =
      typeof req.body.coordinates === "string"
        ? JSON.parse(req.body.coordinates)
        : req.body.coordinates;
    const staff =
      typeof req.body.staff === "string"
        ? JSON.parse(req.body.staff)
        : req.body.staff;
    const categories =
      typeof req.body.categories === "string"
        ? JSON.parse(req.body.categories)
        : req.body.categories;

    const userId = req.user?.id;

    // 1. Insert into business_profiles
    const business = await query(
      `INSERT INTO business_profiles (user_id, name, location, latitude, longitude, tag, about, phone_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        userId,
        name,
        coordinates?.location,
        coordinates?.latitude,
        coordinates?.longitude,
        tag,
        about,
        phone_number,
      ]
    );

    const businessId = business[0].id;

    // 2. Upload and insert images (if any)
    const files = req.files as {
      images?: Express.Multer.File[];
      staffImages?: Express.Multer.File[];
    };

    if (files.images) {
      const imagePromises = files.images.map((file) =>
        uploadToS3(file, "businessImages", businessId)
      );
      const imageUrls = await Promise.all(imagePromises);

      for (const url of imageUrls) {
        await query(
          `INSERT INTO business_images (business_id, image) VALUES ($1, $2)`,
          [businessId, url]
        );
      }
    }

    const staffImages: string[] = [];

    if (files.staffImages) {
      const staffImageUploads = files.staffImages.map((file) =>
        uploadToS3(file, "staffImages", businessId)
      );
      const urls = await Promise.all(staffImageUploads);
      staffImages.push(...urls);
    }

    // 3. Insert staff
    for (let i = 0; i < staff.length; i++) {
      const member = staff[i];
      const imageUrl = staffImages[i] || null;

      if (!member.name) continue; // Skip if name missing

      await query(
        `INSERT INTO business_staff (business_id, name, image) VALUES ($1, $2, $3)`,
        [businessId, member.name, imageUrl]
      );
    }

    // 4. Insert categories and services
    for (const category of categories) {
      const categoryRes = await query(
        `INSERT INTO business_service_categories (business_id, title)
         VALUES ($1, $2) RETURNING id`,
        [businessId, category.title]
      );

      const categoryId = categoryRes[0].id;

      for (const service of category.services) {
        await query(
          `INSERT INTO business_services (category_id, title, time, price, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            categoryId,
            service.title,
            service.time,
            service.price,
            service.description || null,
          ]
        );
      }
    }

    res
      .status(201)
      .json({ success: true, message: "Business profile created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getBusinessesByUserId = async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    // Fetch all businesses by userId
    const businessRows = await query(
      `SELECT id, name, about, rating, tag, location, latitude, phone_number, longitude
       FROM business_profiles WHERE user_id = $1`,
      [userId]
    );

    // Map through each business to enrich with images, staff, and services
    const businesses = await Promise.all(
      businessRows.map(async (business) => {
        const businessId = business.id;

        const [images, staff, categories] = await Promise.all([
          query(`SELECT image FROM business_images WHERE business_id = $1`, [
            businessId,
          ]),
          query(
            `SELECT id, name, rating, image FROM business_staff WHERE business_id = $1`,
            [businessId]
          ),
          query(
            `SELECT id, title FROM business_service_categories WHERE business_id = $1`,
            [businessId]
          ),
        ]);

        const services: Record<number, { title: string; service: any[] }> = {};

        for (const category of categories) {
          const categoryServices = await query(
            `SELECT title, time, price, description 
             FROM business_services WHERE category_id = $1`,
            [category.id]
          );

          services[category.id] = {
            title: category.title,
            service: categoryServices,
          };
        }

        return {
          id: business.id,
          name: business.name,
          about: business.about,
          phone_number: business.phone_number,
          rating: Number(business.rating),
          tag: business.tag,
          closeTime: business.close_time || null,
          coordinates: {
            latitude: Number(business.latitude),
            longitude: Number(business.longitude),
            location: business.location,
          },
          image: images.map((img) => img.image),
          staff: staff.map((member) => ({
            id: member.id,
            name: member.name,
            rating: Number(member.rating),
            ...(member.image && { image: member.image }),
          })),
          services,
        };
      })
    );

    return res.json(businesses);
  } catch (err) {
    console.error("Error fetching businesses for user:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getBusinessById = async (req: Request, res: Response) => {
  const { id: businessId } = req.params;

  try {
    // Fetch the single business by id
    const businessRows = await query(
      `SELECT id, name, about, rating, tag, location, latitude, longitude, phone_number, user_id
       FROM business_profiles WHERE id = $1`,
      [businessId]
    );

    if (businessRows.length === 0) {
      return res.status(404).json({ message: "Business not found" });
    }

    const business = businessRows[0];

    // Fetch associated data
    const [images, staff, categories] = await Promise.all([
      query(`SELECT image FROM business_images WHERE business_id = $1`, [
        businessId,
      ]),
      query(
        `SELECT id, name, rating, image FROM business_staff WHERE business_id = $1`,
        [businessId]
      ),
      query(
        `SELECT id, title FROM business_service_categories WHERE business_id = $1`,
        [businessId]
      ),
    ]);

    const services: Record<number, { title: string; service: any[] }> = {};

    for (const category of categories) {
      const categoryServices = await query(
        `SELECT title, time, price, description 
         FROM business_services WHERE category_id = $1`,
        [category.id]
      );

      services[category.id] = {
        title: category.title,
        service: categoryServices,
      };
    }

    // Final structured response
    const result = {
      id: business.id,
      name: business.name,
      about: business.about,
      phone_number: business.phone_number,
      rating: Number(business.rating),
      tag: business.tag,
      coordinates: {
        latitude: Number(business.latitude),
        longitude: Number(business.longitude),
        location: business.location,
      },
      image: images.map((img) => img.image),
      staff: staff.map((member) => ({
        id: member.id,
        name: member.name,
        rating: Number(member.rating),
        ...(member.image && { image: member.image }),
      })),
      services,
      userId: business.user_id,
    };

    return res.json(result);
  } catch (err) {
    console.error("Error fetching business by ID:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllBusinesses = async (_req: Request, res: Response) => {
  try {
    const businessRows = await query(
      `SELECT id, name, about, rating, tag, location, latitude, longitude, user_id, phone_number
       FROM business_profiles`
    );

    const businesses = await Promise.all(
      businessRows.map(async (business) => {
        const businessId = business.id;

        const [images, staff, categories] = await Promise.all([
          query(`SELECT image FROM business_images WHERE business_id = $1`, [
            businessId,
          ]),
          query(
            `SELECT id, name, rating, image FROM business_staff WHERE business_id = $1`,
            [businessId]
          ),
          query(
            `SELECT id, title FROM business_service_categories WHERE business_id = $1`,
            [businessId]
          ),
        ]);

        const services: Record<number, { title: string; service: any[] }> = {};

        for (const category of categories) {
          const categoryServices = await query(
            `SELECT title, time, price, description 
             FROM business_services WHERE category_id = $1`,
            [category.id]
          );

          services[category.id] = {
            title: category.title,
            service: categoryServices,
          };
        }

        return {
          id: business.id,
          name: business.name,
          about: business.about,
          phone_number: business.phone_number,
          rating: Number(business.rating),
          tag: business.tag,
          coordinates: {
            latitude: Number(business.latitude),
            longitude: Number(business.longitude),
            location: business.location,
          },
          image: images.map((img) => img.image),
          staff: staff.map((member) => ({
            id: member.id,
            name: member.name,
            rating: Number(member.rating),
            ...(member.image && { image: member.image }),
          })),
          services,
          userId: business.user_id,
        };
      })
    );

    return res.json(businesses);
  } catch (err) {
    console.error("Error fetching all businesses:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
