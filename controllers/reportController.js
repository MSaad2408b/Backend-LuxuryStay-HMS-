const Booking = require("../models/Booking");
const Room = require("../models/Room");
const Invoice = require("../models/Invoice");
const Feedback = require("../models/Feedback");
const MaintenanceRequest = require("../models/MaintenanceRequest");
const { parseDateRange: parseRange } = require("../utils/dateRange");

// Reports tolerate a malformed filter by ignoring it; audit logs reject it.
const parseDateRange = (query) => parseRange(query).range;

const toCsv = (rows, headers) => {
  const escape = (value) => {
    const str = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [headers.map((h) => escape(h.label)).join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((h) => escape(typeof h.value === "function" ? h.value(row) : row[h.value])).join(","));
  });
  return lines.join("\n");
};

const sendCsv = (res, filename, csv) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(csv);
};

const getDashboardSummary = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query);
    const bookingFilter = dateRange ? { createdAt: dateRange } : {};
    const invoiceFilter = { paymentStatus: { $in: ["paid", "partially_paid"] } };
    if (dateRange) invoiceFilter.createdAt = dateRange;

    const [totalRooms, availableRooms, occupiedRooms, totalBookings, activeBookings, pendingMaintenance] =
      await Promise.all([
        Room.countDocuments({ isActive: true }),
        Room.countDocuments({ isActive: true, status: "available" }),
        Room.countDocuments({ isActive: true, status: "occupied" }),
        Booking.countDocuments(bookingFilter),
        Booking.countDocuments({ ...bookingFilter, status: { $in: ["reserved", "checked_in"] } }),
        MaintenanceRequest.countDocuments({ status: { $in: ["pending", "in_progress"] } }),
      ]);

    const revenueResult = await Invoice.aggregate([
      { $match: invoiceFilter },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]);

    const feedbackFilter = dateRange ? { createdAt: dateRange } : {};
    const feedbackResult = await Feedback.aggregate([
      { $match: feedbackFilter },
      { $group: { _id: null, averageRating: { $avg: "$rating" }, totalFeedback: { $sum: 1 } } },
    ]);

    res.status(200).json({
      summary: {
        totalRooms,
        availableRooms,
        occupiedRooms,
        occupancyRate: totalRooms > 0 ? Number(((occupiedRooms / totalRooms) * 100).toFixed(2)) : 0,
        totalBookings,
        activeBookings,
        pendingMaintenance,
        totalRevenue: revenueResult[0]?.totalRevenue || 0,
        averageRating: feedbackResult[0] ? Number(feedbackResult[0].averageRating.toFixed(2)) : 0,
        totalFeedback: feedbackResult[0]?.totalFeedback || 0,
      },
      filters: {
        from: req.query.from || null,
        to: req.query.to || null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard summary", error: error.message });
  }
};

const getOccupancyReport = async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true }).select("roomNumber type status pricePerNight floor capacity");
    const statusCounts = rooms.reduce((acc, room) => {
      acc[room.status] = (acc[room.status] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      totalRooms: rooms.length,
      statusCounts,
      rooms,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch occupancy report", error: error.message });
  }
};

const getRevenueReport = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query);
    const match = { paymentStatus: { $in: ["paid", "partially_paid"] } };
    if (dateRange) match.createdAt = dateRange;

    const revenueByMonth = await Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: "$totalAmount" },
          invoices: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.status(200).json({
      revenueByMonth,
      filters: { from: req.query.from || null, to: req.query.to || null },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch revenue report", error: error.message });
  }
};

const getFeedbackReport = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query);
    const match = dateRange ? { createdAt: dateRange } : {};

    const breakdown = await Feedback.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$category",
          averageRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({
      breakdown,
      filters: { from: req.query.from || null, to: req.query.to || null },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch feedback report", error: error.message });
  }
};

const exportOccupancyReport = async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true }).select("roomNumber type status pricePerNight floor capacity").sort({ roomNumber: 1 });
    const csv = toCsv(rooms, [
      { label: "Room Number", value: "roomNumber" },
      { label: "Type", value: "type" },
      { label: "Status", value: "status" },
      { label: "Floor", value: "floor" },
      { label: "Capacity", value: "capacity" },
      { label: "Price Per Night", value: "pricePerNight" },
    ]);
    sendCsv(res, "occupancy-report.csv", csv);
  } catch (error) {
    res.status(500).json({ message: "Failed to export occupancy report", error: error.message });
  }
};

const exportRevenueReport = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query);
    const match = { paymentStatus: { $in: ["paid", "partially_paid"] } };
    if (dateRange) match.createdAt = dateRange;

    const invoices = await Invoice.find(match)
      .populate("guest", "name email")
      .populate({ path: "booking", populate: { path: "room", select: "roomNumber" } })
      .sort({ createdAt: -1 });

    const csv = toCsv(invoices, [
      { label: "Invoice Number", value: "invoiceNumber" },
      { label: "Guest", value: (r) => r.guest?.name || "" },
      { label: "Email", value: (r) => r.guest?.email || "" },
      { label: "Room", value: (r) => r.booking?.room?.roomNumber || "" },
      { label: "Subtotal", value: "subtotal" },
      { label: "Tax", value: "tax" },
      { label: "Discount", value: "discount" },
      { label: "Total", value: "totalAmount" },
      { label: "Payment Status", value: "paymentStatus" },
      { label: "Created At", value: (r) => r.createdAt?.toISOString() || "" },
    ]);
    sendCsv(res, "revenue-report.csv", csv);
  } catch (error) {
    res.status(500).json({ message: "Failed to export revenue report", error: error.message });
  }
};

const exportFeedbackReport = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query);
    const match = dateRange ? { createdAt: dateRange } : {};
    const feedback = await Feedback.find(match)
      .populate("guest", "name email")
      .populate("repliedBy", "name")
      .sort({ createdAt: -1 });

    const csv = toCsv(feedback, [
      { label: "Guest", value: (r) => r.guest?.name || "" },
      { label: "Email", value: (r) => r.guest?.email || "" },
      { label: "Category", value: "category" },
      { label: "Rating", value: "rating" },
      { label: "Comment", value: "comment" },
      { label: "Admin Reply", value: "adminReply" },
      { label: "Replied By", value: (r) => r.repliedBy?.name || "" },
      { label: "Created At", value: (r) => r.createdAt?.toISOString() || "" },
    ]);
    sendCsv(res, "feedback-report.csv", csv);
  } catch (error) {
    res.status(500).json({ message: "Failed to export feedback report", error: error.message });
  }
};

const monthKey = (date) => `${new Date(date).getFullYear()}-${String(new Date(date).getMonth() + 1).padStart(2, "0")}`;

const getDemandForecast = async (req, res) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 3), 24);
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);

    const history = await Booking.aggregate([
      { $match: { createdAt: { $gte: from }, status: { $ne: "cancelled" } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          bookings: { $sum: 1 },
          roomNights: { $sum: { $max: [{ $subtract: ["$checkOutDate", "$checkInDate"] }, 0] } },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]).allowDiskUse(true);

    const series = history.map((row) => ({
      month: `${row._id.year}-${String(row._id.month).padStart(2, "0")}`,
      bookings: row.bookings,
      roomNights: Math.round(row.roomNights / (1000 * 60 * 60 * 24)),
    }));

    const values = series.map((row) => row.bookings);
    const windowSize = Math.min(3, Math.max(values.length, 1));
    const lastWindow = values.slice(-windowSize);
    const movingAverage = lastWindow.length
      ? Number((lastWindow.reduce((sum, value) => sum + value, 0) / lastWindow.length).toFixed(2))
      : 0;
    const trend = values.length > 1 ? values[values.length - 1] - values[0] : 0;
    const forecast = Math.max(Math.round(movingAverage + trend / values.length), 0);

    const next = new Date();
    next.setMonth(next.getMonth() + 1);

    res.status(200).json({
      method: "3-month moving average with linear trend",
      history: series,
      forecast: { month: monthKey(next), expectedBookings: forecast, confidence: "indicative" },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to build demand forecast", error: error.message });
  }
};

const getPricingInsights = async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true })
      .select("type pricePerNight status")
      .lean();
    const grouped = rooms.reduce((acc, room) => {
      acc[room.type] = acc[room.type] || { rooms: 0, occupied: 0, totalPrice: 0 };
      acc[room.type].rooms += 1;
      acc[room.type].totalPrice += room.pricePerNight;
      if (["occupied", "reserved"].includes(room.status)) acc[room.type].occupied += 1;
      return acc;
    }, {});

    const insights = Object.entries(grouped).map(([type, data]) => {
      const averagePrice = Number((data.totalPrice / data.rooms).toFixed(2));
      const occupancyRate = Number(((data.occupied / data.rooms) * 100).toFixed(1));
      const multiplier = occupancyRate > 75 ? 1.1 : occupancyRate < 40 ? 0.9 : 1;
      return {
        type,
        rooms: data.rooms,
        averagePrice,
        occupancyRate,
        suggestedPrice: Number((averagePrice * multiplier).toFixed(2)),
        recommendation: multiplier > 1 ? "increase" : multiplier < 1 ? "decrease" : "hold",
      };
    });

    res.status(200).json({ insights, generatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ message: "Failed to build pricing insights", error: error.message });
  }
};

const getOccupancyByType = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query);
    const bookingFilter = dateRange ? { createdAt: dateRange, status: { $ne: "cancelled" } } : { status: { $ne: "cancelled" } };
    const [rooms, bookings] = await Promise.all([
      Room.find({ isActive: true }).select("type status roomNumber pricePerNight").lean(),
      Booking.find(bookingFilter).populate("room", "type").lean(),
    ]);

    const result = rooms.reduce((acc, room) => {
      acc[room.type] = acc[room.type] || { type: room.type, totalRooms: 0, occupiedRooms: 0, bookings: 0 };
      acc[room.type].totalRooms += 1;
      if (room.status === "occupied") acc[room.type].occupiedRooms += 1;
      return acc;
    }, {});

    bookings.forEach((booking) => {
      const type = booking.room?.type;
      if (type && result[type]) result[type].bookings += 1;
    });

    const report = Object.values(result).map((row) => ({
      ...row,
      occupancyRate: row.totalRooms ? Number(((row.occupiedRooms / row.totalRooms) * 100).toFixed(2)) : 0,
    }));

    res.status(200).json({ report, filters: { from: req.query.from || null, to: req.query.to || null } });
  } catch (error) {
    res.status(500).json({ message: "Failed to build occupancy-by-type report", error: error.message });
  }
};

const getRevenueByService = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query);
    const match = { paymentStatus: { $in: ["paid", "partially_paid"] } };
    if (dateRange) match.createdAt = dateRange;

    const rows = await Invoice.aggregate([
      { $match: match },
      { $unwind: "$charges" },
      {
        $group: {
          _id: "$charges.type",
          revenue: { $sum: "$charges.amount" },
          items: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]).allowDiskUse(true);

    res.status(200).json({
      revenueByService: rows.map((row) => ({ type: row._id, revenue: row.revenue, items: row.items })),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to build revenue-by-service report", error: error.message });
  }
};

const getCustomReport = async (req, res) => {
  try {
    const { metric = "bookings", groupBy = "month", format } = req.query;
    const dateRange = parseDateRange(req.query);
    const match = dateRange ? { createdAt: dateRange } : {};
    let rows = [];

    if (metric === "revenue") {
      const data = await Invoice.aggregate([
        { $match: { ...match, paymentStatus: { $in: ["paid", "partially_paid"] } } },
        {
          $group: {
            _id: groupBy === "status" ? "$paymentStatus" : { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            revenue: { $sum: "$totalAmount" },
            count: { $sum: 1 },
          },
        },
      ]).allowDiskUse(true);
      rows = data.map((row) => ({
        group: row._id?.year ? `${row._id.year}-${String(row._id.month).padStart(2, "0")}` : row._id,
        value: row.revenue,
        count: row.count,
      }));
    } else if (metric === "feedback") {
      const data = await Feedback.aggregate([
        { $match: match },
        {
          $group: {
            _id: groupBy === "month" ? { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } } : "$category",
            averageRating: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]).allowDiskUse(true);
      rows = data.map((row) => ({
        group: row._id?.year ? `${row._id.year}-${String(row._id.month).padStart(2, "0")}` : row._id,
        value: Number((row.averageRating || 0).toFixed(2)),
        count: row.count,
      }));
    } else {
      const data = await Booking.aggregate([
        { $match: match },
        {
          $group: {
            _id: groupBy === "status" ? "$status" : { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            count: { $sum: 1 },
            revenue: { $sum: "$totalAmount" },
          },
        },
      ]).allowDiskUse(true);
      rows = data.map((row) => ({
        group: row._id?.year ? `${row._id.year}-${String(row._id.month).padStart(2, "0")}` : row._id,
        value: row.count,
        revenue: row.revenue,
      }));
    }

    if (format === "csv") {
      const csv = toCsv(rows, [
        { label: "Group", value: "group" },
        { label: "Value", value: "value" },
        { label: "Count", value: "count" },
      ]);
      return sendCsv(res, `custom-${metric}-report.csv`, csv);
    }

    res.status(200).json({
      metric,
      groupBy,
      rows,
      filters: { from: req.query.from || null, to: req.query.to || null },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to build custom report", error: error.message });
  }
};

module.exports = {
  getDashboardSummary,
  getOccupancyReport,
  getRevenueReport,
  getFeedbackReport,
  exportOccupancyReport,
  exportRevenueReport,
  exportFeedbackReport,
  getDemandForecast,
  getPricingInsights,
  getOccupancyByType,
  getRevenueByService,
  getCustomReport,
};
