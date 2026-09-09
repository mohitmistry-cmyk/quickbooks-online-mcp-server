import { z } from "zod";
import { lookupQuickbooksAutomationEntities } from "../handlers/lookup-quickbooks-automation-entities.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";

const entityTypes = [
  "account", "attachable", "bill_payment", "bill", "class", "credit_memo",
  "customer", "department", "deposit", "employee", "estimate", "invoice",
  "item", "journal_entry", "payment_method", "payment", "purchase_order",
  "purchase", "refund_receipt", "sales_receipt", "term", "time_activity",
  "transfer", "vendor_credit", "vendor",
] as const;

const toolSchema = z.object({
  entity_type: z.enum(entityTypes),
  id: z.string().min(1).optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await lookupQuickbooksAutomationEntities(params.entity_type, params.id);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error looking up automation entities: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const LookupAutomationEntitiesTool: ToolDefinition<typeof toolSchema> = {
  name: "lookup_automation_entities",
  description: "Read one or fetch all entities for Salesforce-to-QuickBooks automation identity matching.",
  schema: toolSchema,
  handler: toolHandler,
};
