/**
 * Shared zod schemas for customer + vehicle mutations.
 * Used by both Server Actions (enforcement) and client forms (UX).
 */
import { z } from "zod";

// ------------------------------------------------------------------
// Customers
// ------------------------------------------------------------------

export const createCustomerSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(200),
  phone: z.string().min(1, "Phone is required").max(30),
  email: z.string().email("Invalid email").max(254).optional().or(z.literal("")),
  addressLine1: z.string().max(200).optional().or(z.literal("")),
  addressLine2: z.string().max(200).optional().or(z.literal("")),
  postcode: z.string().max(10).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().min(1).max(30).optional(),
  email: z.string().email().max(254).optional().or(z.literal("")),
  addressLine1: z.string().max(200).optional().or(z.literal("")),
  addressLine2: z.string().max(200).optional().or(z.literal("")),
  postcode: z.string().max(10).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ------------------------------------------------------------------
// Vehicles
// ------------------------------------------------------------------

export const createVehicleSchema = z.object({
  customerId: z.string().uuid(),
  registration: z.string().min(1, "Registration is required").max(15),
  make: z.string().max(100).optional().or(z.literal("")),
  model: z.string().max(100).optional().or(z.literal("")),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  vin: z.string().max(17).optional().or(z.literal("")),
  colour: z.string().max(50).optional().or(z.literal("")),
  mileage: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = z.object({
  id: z.string().uuid(),
  registration: z.string().min(1).max(15).optional(),
  make: z.string().max(100).optional().or(z.literal("")),
  model: z.string().max(100).optional().or(z.literal("")),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  vin: z.string().max(17).optional().or(z.literal("")),
  colour: z.string().max(50).optional().or(z.literal("")),
  mileage: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
