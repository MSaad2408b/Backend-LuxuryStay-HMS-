const ServiceRequest = require("../models/ServiceRequest");
const { createNotification } = require("../utils/notification");
const { logAudit } = require("../utils/auditLogger");
const User = require("../models/UserSchema");
const { billCompletedServiceRequest } = require("../services/invoiceService");
const { sendEmail, templates } = require("../utils/email");

const createServiceRequest = async (req, res) => {
  try {
    const request = await ServiceRequest.create({
      ...req.body,
      guest: req.user._id,
    });

    await createNotification({
      recipientRole: "receptionist",
      title: "New Service Request",
      message: `A ${request.serviceType.replace(/_/g, " ")} request was submitted by a guest.`,
      type: "service",
      relatedId: request._id,
    });

    const populatedRequest = await ServiceRequest.findById(request._id)
      .populate("guest", "name email contact")
      .populate("booking", "confirmationCode")
      .populate("handledBy", "name email role");

    await logAudit(req, { action: "CREATE_SERVICE_REQUEST", resource: "ServiceRequest", resourceId: request._id });

    res.status(201).json({ message: "Service request created successfully", request: populatedRequest });
  } catch (error) {
    res.status(500).json({ message: "Failed to create service request", error: error.message });
  }
};

const getServiceRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;

    if (req.user.role === "guest") {
      filter.guest = req.user._id;
    }

    const requests = await ServiceRequest.find(filter)
      .populate("guest", "name email contact")
      .populate("booking", "confirmationCode")
      .populate("handledBy", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({ requests });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch service requests", error: error.message });
  }
};

const updateServiceRequest = async (req, res) => {
  try {
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Service request not found" });
    }

    if (request.billed && req.body.cost !== undefined && Number(req.body.cost) !== Number(request.cost)) {
      return res.status(400).json({ message: "Cost cannot change after the service has been billed" });
    }

    Object.assign(request, req.body);
    if (req.body.status === "in_progress" && !request.handledBy) {
      request.handledBy = req.user._id;
    }
    if (req.body.status === "completed" && !request.completedAt) {
      request.completedAt = new Date();
    }

    await request.save();

    if (req.body.status === "completed") {
      const billing = await billCompletedServiceRequest(request);
      const guest = await User.findById(request.guest).select("name email");
      if (guest?.email) {
        await sendEmail({
          to: guest.email,
          subject: `Service Request ${request.status}`,
          html: templates.generic(
            "Service Request Completed",
            `<p>Hello ${guest.name},</p><p>Your ${request.serviceType.replace(/_/g, " ")} request has been completed.</p>`
          ),
        });
      }
      await logAudit(req, {
        action: "COMPLETE_SERVICE_REQUEST",
        resource: "ServiceRequest",
        resourceId: request._id,
        details: { billed: billing.billed, cost: request.cost },
      });
    }

    const updatedRequest = await ServiceRequest.findById(request._id)
      .populate("guest", "name email contact")
      .populate("booking", "confirmationCode")
      .populate("handledBy", "name email role");

    await logAudit(req, { action: "UPDATE_SERVICE_REQUEST", resource: "ServiceRequest", resourceId: request._id, details: { status: request.status } });

    res.status(200).json({ message: "Service request updated successfully", request: updatedRequest });
  } catch (error) {
    res.status(500).json({ message: "Failed to update service request", error: error.message });
  }
};

module.exports = {
  createServiceRequest,
  getServiceRequests,
  updateServiceRequest,
};
