const express = require("express");
const router = express.Router();

const {
  createInvoice,
  getInvoices,
  getInvoiceById,
  addCharge,
  updatePaymentStatus,
  printInvoice,
  sendInvoiceEmail,
} = require("../controllers/invoiceController");
const { protect, authorizeRoles } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const { createInvoiceSchema, addChargeSchema, paymentSchema } = require("../validation/invoiceSchema");

router.param("id", validateObjectIdParam);

router.use(protect);

router.post("/", authorizeRoles("admin", "manager", "receptionist"), validate(createInvoiceSchema), createInvoice);
router.get("/", getInvoices);
router.get("/:id/print", printInvoice);
router.post("/:id/send-email", authorizeRoles("admin", "manager", "receptionist"), sendInvoiceEmail);
router.get("/:id", getInvoiceById);
router.post("/:id/charges", authorizeRoles("admin", "manager", "receptionist"), validate(addChargeSchema), addCharge);
router.patch("/:id/payment", authorizeRoles("admin", "manager", "receptionist"), validate(paymentSchema), updatePaymentStatus);

module.exports = router;
