import {z} from "zod";

const createProjectSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title is too long"),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  // Ensure dates are valid strings that can be parsed
  startDate: z.string().datetime({ offset: true }).optional().or(z.date()), 
  dueDate: z.string().datetime({ offset: true }).optional().or(z.date()),
});

export default createProjectSchema;