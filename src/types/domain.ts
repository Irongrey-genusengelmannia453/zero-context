import { z } from 'zod';

export const AIHostPatternSchema = z.string()
  .min(1)
  .describe("A valid Chrome match pattern (e.g., '*://*.chatgpt.com/*')");

export const BuiltInDomainSchema = z.object({
  type: z.literal('BUILT_IN'),
  id: z.string(), // e.g., 'chatgpt', 'claude'
  pattern: AIHostPatternSchema,
  enabled: z.boolean(),
});

export const CustomDomainSchema = z.object({
  type: z.literal('CUSTOM'),
  id: z.string().uuid(),
  pattern: AIHostPatternSchema,
  enabled: z.boolean(),
  addedAt: z.number().describe("Unix timestamp of when the user added this domain"),
});

export const DomainEntrySchema = z.discriminatedUnion('type', [
  BuiltInDomainSchema,
  CustomDomainSchema,
]);

export type DomainEntry = z.infer<typeof DomainEntrySchema>;

export const DomainConfigStateSchema = z.object({
  version: z.literal(1).describe("Schema version for future migrations"),
  domains: z.array(DomainEntrySchema),
});

export type DomainConfigState = z.infer<typeof DomainConfigStateSchema>;

// The "Big 5" Default Domains Constant using satisfies
export const DEFAULT_AI_DOMAINS = [
  { type: 'BUILT_IN', id: 'chatgpt', pattern: '*://*.chatgpt.com/*', enabled: true },
  { type: 'BUILT_IN', id: 'claude', pattern: '*://*.claude.ai/*', enabled: true },
  { type: 'BUILT_IN', id: 'gemini', pattern: '*://*.gemini.google.com/*', enabled: true },
  { type: 'BUILT_IN', id: 'perplexity', pattern: '*://*.perplexity.ai/*', enabled: true },
  { type: 'BUILT_IN', id: 'deepseek', pattern: '*://chat.deepseek.com/*', enabled: true },
] satisfies DomainEntry[];

// --- UI & Permissions Types ---

export const HostnameInputSchema = z.string()
  .min(1, "Hostname cannot be empty")
  .refine(
    (val) => /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val),
    "Must be a valid hostname (e.g., custom-ai.corp)"
  );

export const AddDomainResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('SUCCESS'),
    domain: CustomDomainSchema
  }),
  z.object({
    status: z.literal('ERROR_PERMISSION_DENIED'),
    message: z.string()
  }),
  z.object({
    status: z.literal('ERROR_INVALID_HOSTNAME'),
    message: z.string()
  }),
  z.object({
    status: z.literal('ERROR_ALREADY_EXISTS'),
    message: z.string()
  })
]);

export type AddDomainResult = z.infer<typeof AddDomainResultSchema>;
