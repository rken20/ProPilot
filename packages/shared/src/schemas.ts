import { z } from "zod";
import { BUSINESS_ROLES } from "./permissions";

/** Shared input validation, used by web forms, mobile forms and API handlers. */

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters");

export const ACCOUNT_TYPES = ["agent", "buyer"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: emailSchema,
  password: passwordSchema,
  accountType: z.enum(ACCOUNT_TYPES).default("agent"),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const BUSINESS_TYPES = [
  "independent_agent",
  "brokerage",
  "developer",
  "property_management",
  "other",
] as const;

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(BUSINESS_TYPES),
  email: emailSchema.optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(BUSINESS_ROLES),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const PROPERTY_TYPES = [
  "condominium",
  "house_and_lot",
  "townhouse",
  "lot",
  "commercial",
  "other",
] as const;

export const PROPERTY_STATUSES = ["available", "reserved", "sold", "archived"] as const;

/** Money is always integer minor units (centavos) plus a currency code. */
export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).default("PHP"),
});

export const propertySchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(PROPERTY_TYPES),
  location: z.string().trim().min(2).max(300),
  price: moneySchema,
  reservationFee: moneySchema.optional(),
  status: z.enum(PROPERTY_STATUSES).default("available"),
  description: z.string().trim().max(5000).optional(),
  financing: z
    .object({
      downpaymentPercent: z.number().min(0).max(100).optional(),
      bankFinancing: z.boolean().optional(),
      pagIbig: z.boolean().optional(),
      inHouse: z.boolean().optional(),
      notes: z.string().max(1000).optional(),
    })
    .optional(),
});
export type PropertyInput = z.infer<typeof propertySchema>;

/** A buyer's request to view a listing. */
export const viewingRequestSchema = z.object({
  propertyId: z.string().uuid(),
  buyerName: z.string().trim().min(2, "Enter your name").max(120),
  buyerPhone: z
    .string()
    .trim()
    .regex(/^[+0-9][0-9\s-]{6,28}$/, "Enter a mobile number, e.g. 0917 123 4567"),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
    .optional(),
  budgetNote: z.string().trim().max(200).optional(),
  message: z.string().trim().max(1000).optional(),
});
export type ViewingRequestInput = z.infer<typeof viewingRequestSchema>;
