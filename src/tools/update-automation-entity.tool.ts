import { z } from "zod";
import { updateQuickbooksAutomationEntity } from "../handlers/update-quickbooks-automation-entity.handler.js";
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
  id: z.string().min(1),
  patch: z.record(z.any()).refine((value) => Object.keys(value).length > 0, {
    message: "At least one QuickBooks field must be updated.",
  }),
  line_reconciliation: z.enum(["merge_only", "exact_mirror"]).optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksAutomationEntity(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error updating entity: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: "QuickBooks entity updated successfully:" },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const UpdateAutomationEntityTool: ToolDefinition<typeof toolSchema> = {
  name: "update_automation_entity",
  description: "Update any automation-supported QuickBooks entity using a fresh SyncToken and configurable child-line reconciliation.",
  schema: toolSchema,
  handler: toolHandler,
};
