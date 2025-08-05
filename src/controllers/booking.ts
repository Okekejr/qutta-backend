import { query } from "../config/db";
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { sendPushNotification } from "../utils/sendPushNotification";

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

    const userResult = await query(
      `SELECT push_token FROM users WHERE id = $1`,
      [userId]
    );
    const pushToken = userResult[0]?.push_token;

    const businessResult = await query(
      `SELECT name FROM business_profiles WHERE id = $1`,
      [business_id]
    );
    const businessName = businessResult[0]?.name || "your appointment";

    try {
      if (pushToken) {
        const title = `Booking at ${businessName} confirmed!`;
        const body = `You're booked for ${datetime}. We'll see you soon!`;
        await sendPushNotification(pushToken, title, body);
      }
    } catch (err) {
      console.error("Failed to send push notification to client:", err);
    }

    const ownerResult = await query(
      `SELECT u.push_token, bp.name AS business_name
        FROM business_profiles bp
        JOIN users u ON bp.user_id = u.id
        WHERE bp.id = $1`,
      [business_id]
    );

    const ownerPushToken = ownerResult[0]?.push_token;
    const ownersBusinessName = ownerResult[0]?.business_name;

    try {
      if (ownerPushToken) {
        const title = "New Booking Received";
        const body = `You have a new booking at ${ownersBusinessName} for ${datetime}`;
        await sendPushNotification(ownerPushToken, title, body);
      }
    } catch (err) {
      console.error("Failed to send push notification to owner:", err);
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

export const cancelBookingById = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const bookingId = req.params.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!bookingId) {
    return res.status(400).json({ error: "Missing booking ID" });
  }

  try {
    // Check user exists
    const userResult = await query("SELECT id FROM users WHERE id = $1", [
      userId,
    ]);
    if (userResult.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // ✅ Fetch booking to check status before updating
    const bookingCheck = await query(
      "SELECT id, status, user_id, business_id FROM bookings WHERE id = $1",
      [bookingId]
    );

    if (bookingCheck.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingCheck[0];

    // ❌ Already cancelled
    if (booking.status === "cancelled") {
      return res.status(400).json({ error: "Booking is already cancelled" });
    }

    // ✅ Update to cancelled
    const result = await query(
      `
      UPDATE bookings
      SET status = 'cancelled'
      WHERE id = $1
      RETURNING id, status, user_id, business_id
      `,
      [bookingId]
    );

    const { user_id: clientId, business_id: businessId } = result[0];

    // 📦 3. Fetch push tokens and business name
    const [clientData, businessData] = await Promise.all([
      query(`SELECT push_token FROM users WHERE id = $1`, [clientId]),
      query(
        `SELECT users.push_token, business_profiles.name FROM users
         JOIN business_profiles ON users.id = business_profiles.user_id
         WHERE business_profiles.id = $1`,
        [businessId]
      ),
    ]);

    const clientPushToken = clientData[0]?.push_token;
    const ownerPushToken = businessData[0]?.push_token;
    const businessName = businessData[0]?.name || "A business";

    if (clientPushToken) {
      const title = "Booking Cancelled";
      const body = `Your appointment with ${businessName} has been cancelled.`;
      await sendPushNotification(clientPushToken, title, body);
    }

    if (ownerPushToken) {
      const title = "Appointment Cancelled";
      const body = `A client has cancelled their appointment at ${businessName}.`;
      await sendPushNotification(ownerPushToken, title, body);
    }

    return res.status(200).json({
      id: result[0].id,
      status: result[0].status,
      message: "Booking cancelled and notifications sent",
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
