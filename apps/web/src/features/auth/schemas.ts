import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(12).max(128),
});

export const signupSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(1).max(200),
});
