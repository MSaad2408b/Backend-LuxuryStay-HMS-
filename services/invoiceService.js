const Invoice = require("../models/Invoice");
const Booking = require("../models/Booking");
const ServiceRequest = require("../models/ServiceRequest");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");
const { getTaxRate } = require("../utils/settings");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const calculateTotals = (charges, tax = 0, discount = 0) => {
  const subtotal = charges.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalAmount = Math.max(Number(subtotal) + Number(tax) - Number(discount), 0);
  return {
    subtotal: Number(subtotal.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
  };
};

const calculateNights = (checkInDate, checkOutDate) => {
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(Math.ceil((end - start) / (1000 * 60 * 60 * 24)), 1);
};

const collectUnbilledServiceCharges = async (bookingId) => {
  if (!bookingId) return [];
  const requests = await ServiceRequest.find({
    booking: bookingId,
    status: "completed",
    billed: false,
    cost: { $gt: 0 },
  }).lean();
  return requests.map((request) => ({
    description: `${request.serviceType.replace(/_/g, " ")} (completed)`,
    amount: Number(request.cost),
    type: "service",
    serviceRequest: request._id,
  }));
};

/**
 * Single source of truth for invoice creation (manual, auto-checkout, or API).
 */
const createInvoiceForBooking = async ({
  bookingId,
  charges = [],
  tax,
  discount = 0,
  notes = "",
  createdBy = null,
}) => {
  const booking = await Booking.findById(bookingId)
    .populate("room")
    .populate("guest", "name email contact");
  if (!booking) throw httpError("Booking not found", 404);

  const existing = await Invoice.findOne({ booking: bookingId });
  if (existing) throw httpError("Invoice already exists for this booking", 409);

  const nights = calculateNights(booking.checkInDate, booking.checkOutDate);
  const serviceCharges = await collectUnbilledServiceCharges(bookingId);
  const baseCharges = [
    {
      description: `Room charges (${nights} night${nights > 1 ? "s" : ""})`,
      amount: Number(booking.totalAmount),
      type: "room",
    },
    ...serviceCharges,
    ...charges,
  ];

  const subtotal = baseCharges.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const taxAmount =
    tax === undefined || tax === null
      ? Number((subtotal * (Number(await getTaxRate()) || 0) / 100).toFixed(2))
      : Number(tax);

  const totals = calculateTotals(baseCharges, taxAmount, discount);

  const invoice = await Invoice.create({
    invoiceNumber: generateInvoiceNumber(),
    booking: booking._id,
    guest: booking.guest?._id || booking.guest,
    charges: baseCharges,
    subtotal: totals.subtotal,
    tax: taxAmount,
    discount: Number(discount) || 0,
    totalAmount: totals.totalAmount,
    notes: notes || "",
  });

  await Booking.findByIdAndUpdate(booking._id, { invoice: invoice._id });
  if (serviceCharges.length) {
    await ServiceRequest.updateMany(
      { _id: { $in: serviceCharges.map((charge) => charge.serviceRequest) } },
      { $set: { billed: true } }
    );
  }

  return { invoice, booking, nights };
};

const addChargeToInvoice = async (invoiceId, charge) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw httpError("Invoice not found", 404);
  invoice.charges.push(charge);
  const totals = calculateTotals(invoice.charges, invoice.tax, invoice.discount);
  invoice.subtotal = totals.subtotal;
  invoice.totalAmount = totals.totalAmount;
  await invoice.save();
  return invoice;
};

const billCompletedServiceRequest = async (serviceRequest) => {
  if (!serviceRequest.booking || serviceRequest.billed || Number(serviceRequest.cost) <= 0) {
    return { billed: false, reason: "not_billable" };
  }
  const invoice = await Invoice.findOne({ booking: serviceRequest.booking });
  if (!invoice) return { billed: false, reason: "no_invoice_yet" };

  await addChargeToInvoice(invoice._id, {
    description: `${serviceRequest.serviceType.replace(/_/g, " ")} (completed)`,
    amount: Number(serviceRequest.cost),
    type: "service",
  });
  serviceRequest.billed = true;
  await serviceRequest.save();
  return { billed: true, invoice };
};

module.exports = {
  calculateTotals,
  calculateNights,
  createInvoiceForBooking,
  addChargeToInvoice,
  billCompletedServiceRequest,
};
