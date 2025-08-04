import { query } from "../config/db";
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth";

export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { business_id, staff_id, datetime, services, total_price } = req.body;

    if (!userId || !business_id || !datetime || !services || !total_price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get all services for this business
    const businessServices = await query(
      `SELECT id, title FROM business_services 
       WHERE category_id IN (
         SELECT id FROM business_service_categories 
         WHERE business_id = $1
       )`,
      [business_id]
    );

    const titleToIdMap = new Map<string, number>();
    businessServices.forEach((svc) => {
      titleToIdMap.set(svc.title.toLowerCase(), svc.id);
    });

    const bookingResult = await query(
      `INSERT INTO bookings (user_id, business_id, staff_id, datetime, status, total_price)
       VALUES ($1, $2, $3, $4, 'confirmed', $5)
       RETURNING id`,
      [userId, business_id, staff_id || null, datetime, total_price]
    );

    const bookingId = bookingResult[0].id;

    for (const service of services) {
      const serviceId = titleToIdMap.get(service.title.toLowerCase());
      if (!serviceId) {
        return res
          .status(400)
          .json({ error: `Service not found: ${service.title}` });
      }

      await query(
        `INSERT INTO booking_services (booking_id, service_id, price, duration)
         VALUES ($1, $2, $3, $4)`,
        [bookingId, serviceId, parseInt(service.price), service.time]
      );
    }

    return res.status(201).json({ success: true, bookingId });
  } catch (error) {
    console.error("Create booking error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getBookingDetailsById = async (req: Request, res: Response) => {
  const bookingId = req.params.id;

  if (!bookingId) {
    return res.status(400).json({ error: "Missing booking ID" });
  }

  try {
    // 1. Get main booking, business, staff, location
    const bookingQuery = await query(
      `
      SELECT
        b.id AS booking_id,
        b.datetime,
        b.status,
        b.total_price,
        
        bp.id AS business_id,
        bp.name AS business_name,
        bp.rating AS business_rating,
        bp.latitude,
        bp.longitude,
        bp.location,
        bp.phone_number,

        bs.id AS staff_id,
        bs.name AS staff_name,
        bs.rating AS staff_rating,
        bs.image AS staff_image

      FROM bookings b
      JOIN business_profiles bp ON bp.id = b.business_id
      LEFT JOIN business_staff bs ON bs.id = b.staff_id
      WHERE b.id = $1
      `,
      [bookingId]
    );

    if (bookingQuery.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const row = bookingQuery[0];

    // 2. Get business images
    const imagesQuery = await query(
      `SELECT image FROM business_images WHERE business_id = $1`,
      [row.business_id]
    );
    const imageList = imagesQuery.map((img) => img.image);

    // 3. Get booked services with details
    const servicesQuery = await query(
      `
      SELECT
        s.title,
        s.time,
        s.price,
        s.description
      FROM booking_services bs
      JOIN business_services s ON s.id = bs.service_id
      WHERE bs.booking_id = $1
      `,
      [bookingId]
    );

    const serviceList = servicesQuery;

    // 4. Assemble final object
    const bookingDetails = {
      business: {
        id: row.business_id,
        name: row.business_name,
        phone_number: row.phone_number,
        image: imageList,
        rating: Number(row.business_rating) || 0,
        coordinates: {
          latitude: row.latitude ? Number(row.latitude) : undefined,
          longitude: row.longitude ? Number(row.longitude) : undefined,
          location: row.location,
        },
      },
      service: serviceList,
      staff: row.staff_id
        ? {
            id: row.staff_id,
            name: row.staff_name,
            rating: row.staff_rating ? Number(row.staff_rating) : undefined,
            image: row.staff_image,
          }
        : undefined,
      dateTime: row.datetime,
      total: row.total_price ? Number(row.total_price) : null,
      status: row.status,
    };

    return res.status(200).json(bookingDetails);
  } catch (error) {
    console.error("Error fetching booking details:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getClientBookings = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const bookings = await query(
      `
      SELECT
        b.id as booking_id,
        b.datetime,
        b.status,
        b.total_price,
        b.created_at,
        bp.id as business_id,
        bp.name as business_name,
        bp.rating as business_rating,
        bp.location,
        bp.latitude,
        bp.longitude,
        bp.phone_number,
        json_agg(DISTINCT bi.image) as business_images,
        bs.id as staff_id,
        bs.name as staff_name,
        bs.rating as staff_rating,
        bs.image as staff_image,
        json_agg(
          DISTINCT jsonb_build_object(
            'title', s.title,
            'time', s.time,
            'price', s.price,
            'description', s.description
          )
        ) as services
      FROM bookings b
      JOIN business_profiles bp ON bp.id = b.business_id
      LEFT JOIN business_images bi ON bi.business_id = bp.id
      LEFT JOIN business_staff bs ON bs.id = b.staff_id
      LEFT JOIN booking_services bsrv ON bsrv.booking_id = b.id
      LEFT JOIN business_services s ON s.id = bsrv.service_id
      WHERE b.user_id = $1
        AND b.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY
        b.id,
        bp.id,
        bs.id
      ORDER BY b.created_at DESC
      `,
      [userId]
    );

    const formatted = bookings.map((booking) => ({
      business: {
        id: booking.business_id,
        name: booking.business_name,
        phone_number: booking.phone_number,
        image: booking.business_images?.filter(Boolean) || [],
        rating: Number(booking.business_rating),
        coordinates: {
          latitude: booking.latitude ? Number(booking.latitude) : undefined,
          longitude: booking.longitude ? Number(booking.longitude) : undefined,
          location: booking.location,
        },
      },
      service: booking.services || [],
      staff: booking.staff_id
        ? {
            id: booking.staff_id,
            name: booking.staff_name,
            rating: booking.staff_rating
              ? Number(booking.staff_rating)
              : undefined,
            image: booking.staff_image,
          }
        : undefined,
      dateTime: booking.datetime,
      createdAt: booking.created_at,
      total: booking.total_price ? Number(booking.total_price) : null,
      status: booking.status,
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("Error fetching client bookings:", error);
    return res.status(500).json({ error: "Failed to fetch bookings" });
  }
};

export const getOwnerBookings = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const bookings = await query(
      `
    SELECT
      b.id as booking_id,
      b.datetime,
      b.created_at,
      b.status,
      b.total_price,
      u.name as client_name,
      st.id as staff_id,
      st.name as staff_name,
      st.image as staff_image,
      bp.name as business_name,
      json_agg(
        DISTINCT jsonb_build_object(
          'title', s.title,
          'time', s.time,
          'price', s.price
        )
      ) as services
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN business_staff st ON st.id = b.staff_id
    LEFT JOIN booking_services bsrv ON bsrv.booking_id = b.id
    LEFT JOIN business_services s ON s.id = bsrv.service_id
    JOIN business_profiles bp ON bp.id = b.business_id
    WHERE bp.user_id = $1
    GROUP BY b.id, u.name, st.id, bp.name
    ORDER BY b.created_at DESC
  `,
      [userId]
    );
    const formatted = bookings.map((booking) => ({
      id: booking.booking_id,
      client: {
        name: booking.client_name,
      },
      business_name: booking.business_name,
      staff: booking.staff_id
        ? {
            id: booking.staff_id,
            name: booking.staff_name,
            image: booking.staff_image,
          }
        : null,
      status: booking.status,
      datetime: booking.datetime,
      created_at: booking.created_at,
      service: booking.services || [],
      total: booking.total_price ? Number(booking.total_price) : null,
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("Error fetching owner bookings:", error);
    return res.status(500).json({ error: "Failed to fetch bookings" });
  }
};

export const cancelBookingById = async (req: Request, res: Response) => {
  const bookingId = req.params.id;

  if (!bookingId) {
    return res.status(400).json({ error: "Missing booking ID" });
  }

  try {
    // 1. Update booking status
    const result = await query(
      `
      UPDATE bookings
      SET status = 'cancelled'
      WHERE id = $1
      RETURNING id, status
      `,
      [bookingId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    return res.status(200).json({
      id: result[0].id,
      status: result[0].status,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getClientsForBusiness = async (
  req: AuthRequest,
  res: Response
) => {
  const ownerId = req.user?.id;
  const businessId = req.params.businessId;

  if (!ownerId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!businessId) {
    return res.status(400).json({ error: "Missing businessId" });
  }

  try {
    const businessCheck = await query(
      `SELECT id FROM business_profiles WHERE id = $1 AND user_id = $2`,
      [businessId, ownerId]
    );

    if (businessCheck.length === 0) {
      return res.status(403).json({ error: "You do not own this business" });
    }

    const result = await query(
      `
      SELECT DISTINCT u.id, u.name, u."lastName", u.email
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      WHERE b.business_id = $1
      `,
      [businessId]
    );

    return res.status(200).json({ clients: result });
  } catch (error) {
    console.error("Error fetching clients for business:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
