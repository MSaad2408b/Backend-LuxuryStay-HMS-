const Invoice = require("../models/Invoice");
const { logAudit } = require("../utils/auditLogger");
const { createInvoiceForBooking, addChargeToInvoice } = require("../services/invoiceService");
const { sendEmail, templates } = require("../utils/email");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const createInvoice = async (req, res) => {
  try {
    const { booking: bookingId, charges, tax, discount, notes } = req.body;
    const { invoice } = await createInvoiceForBooking({
      bookingId,
      charges: charges || [],
      tax,
      discount: discount || 0,
      notes: notes || "",
      createdBy: req.user._id,
    });

    await logAudit(req, {
      action: "CREATE_INVOICE",
      resource: "Invoice",
      resourceId: invoice._id,
      details: { invoiceNumber: invoice.invoiceNumber },
    });

    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate("guest", "name email contact")
      .populate({ path: "booking", populate: { path: "room", select: "roomNumber type" } });

    res.status(201).json({ message: "Invoice created successfully", invoice: populatedInvoice });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getInvoices = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === "guest") filter.guest = req.user._id;
    else if (req.query.guest) filter.guest = req.query.guest;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

    const invoices = await Invoice.find(filter)
      .populate("guest", "name email contact")
      .populate({ path: "booking", populate: { path: "room", select: "roomNumber type" } })
      .sort({ createdAt: -1 });

    res.status(200).json({ invoices });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch invoices", error: error.message });
  }
};

const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("guest", "name email contact")
      .populate({ path: "booking", populate: { path: "room", select: "roomNumber type" } });

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (req.user.role === "guest" && String(invoice.guest._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.status(200).json({ invoice });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch invoice", error: error.message });
  }
};

const addCharge = async (req, res) => {
  try {
    const invoice = await addChargeToInvoice(req.params.id, req.body);
    await logAudit(req, {
      action: "ADD_INVOICE_CHARGE",
      resource: "Invoice",
      resourceId: invoice._id,
      details: { charge: req.body },
    });
    res.status(200).json({ message: "Charge added successfully", invoice });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const Booking = require("../models/Booking");
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    invoice.paymentMethod = req.body.paymentMethod;
    invoice.paymentStatus = req.body.paymentStatus || "paid";
    invoice.paidAt = ["paid", "partially_paid"].includes(invoice.paymentStatus) ? new Date() : null;
    await invoice.save();

    const bookingPaymentMap = {
      paid: "paid",
      partially_paid: "partial",
      refunded: "refunded",
      unpaid: "pending",
    };
    await Booking.findByIdAndUpdate(invoice.booking, {
      paymentStatus: bookingPaymentMap[invoice.paymentStatus] || "pending",
    });

    await logAudit(req, {
      action: "UPDATE_INVOICE_PAYMENT",
      resource: "Invoice",
      resourceId: invoice._id,
      details: { paymentStatus: invoice.paymentStatus },
    });
    res.status(200).json({ message: "Payment status updated successfully", invoice });
  } catch (error) {
    res.status(500).json({ message: "Failed to update payment status", error: error.message });
  }
};

const printInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("guest", "name email contact address")
      .populate({ path: "booking", populate: { path: "room", select: "roomNumber type" } });

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (req.user.role === "guest" && String(invoice.guest._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const rows = invoice.charges
      .map(
        (c) => `<tr>
          <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(c.description)}</td>
          <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(c.type)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${Number(c.amount).toFixed(2)}</td>
        </tr>`
      )
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
</head>
<body style="font-family:Arial,sans-serif;margin:40px;color:#111;">
  <h1 style="margin-bottom:4px;">LuxuryStay HMS</h1>
  <p style="margin-top:0;color:#555;">Invoice ${escapeHtml(invoice.invoiceNumber)}</p>
  <hr />
  <p><strong>Guest:</strong> ${escapeHtml(invoice.guest?.name)} (${escapeHtml(invoice.guest?.email)})</p>
  <p><strong>Room:</strong> ${escapeHtml(invoice.booking?.room?.roomNumber || "-")} ${escapeHtml(invoice.booking?.room?.type || "")}</p>
  <p><strong>Date:</strong> ${escapeHtml(new Date(invoice.createdAt).toLocaleString())}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:20px;">
    <thead>
      <tr>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;">Description</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;">Type</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:20px;max-width:320px;margin-left:auto;">
    <p style="display:flex;justify-content:space-between;"><span>Subtotal</span><strong>${Number(invoice.subtotal).toFixed(2)}</strong></p>
    <p style="display:flex;justify-content:space-between;"><span>Tax</span><strong>${Number(invoice.tax).toFixed(2)}</strong></p>
    <p style="display:flex;justify-content:space-between;"><span>Discount</span><strong>${Number(invoice.discount).toFixed(2)}</strong></p>
    <p style="display:flex;justify-content:space-between;font-size:18px;"><span>Total</span><strong>${Number(invoice.totalAmount).toFixed(2)}</strong></p>
    <p style="display:flex;justify-content:space-between;"><span>Payment Status</span><strong>${escapeHtml(invoice.paymentStatus)}</strong></p>
  </div>
  <p style="margin-top:30px;color:#555;">Notes: ${escapeHtml(invoice.notes || "-")}</p>
  <script>window.print()</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (error) {
    res.status(500).json({ message: "Failed to generate printable invoice", error: error.message });
  }
};

const sendInvoiceEmail = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate("guest", "name email");
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (req.user.role === "guest" && String(invoice.guest._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const result = await sendEmail({
      to: req.body?.email || invoice.guest?.email,
      subject: `Invoice ${invoice.invoiceNumber}`,
      html: templates.invoice(invoice.guest?.name || "Guest", invoice.invoiceNumber, Number(invoice.totalAmount).toFixed(2)),
    });

    await logAudit(req, {
      action: "SEND_INVOICE_EMAIL",
      resource: "Invoice",
      resourceId: invoice._id,
      details: { to: invoice.guest?.email, delivered: result.delivered },
    });

    res.status(result.delivered || result.reason === "smtp_not_configured" ? 200 : 502).json({
      message: result.delivered ? "Invoice email sent successfully" : "Invoice email could not be delivered",
      invoiceId: invoice._id,
      recipient: invoice.guest?.email || null,
      delivery: result,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to send invoice email", error: error.message });
  }
};

module.exports = {
  createInvoice,
  getInvoices,
  getInvoiceById,
  addCharge,
  updatePaymentStatus,
  printInvoice,
  sendInvoiceEmail,
};
