import { createQuickbooksItem } from "../handlers/create-quickbooks-item.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_item";
const toolDescription = "Create an item in QuickBooks Online.";

const toolSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  income_account_ref: z.string().min(1).optional(),
  expense_account_ref: z.string().optional(),
  asset_account_ref: z.string().optional(),
  quantity_on_hand: z.number().optional(),
  inv_start_date: z.string().min(1).optional(),
  purchase_cost: z.number().nonnegative().optional(),
  unit_price: z.number().optional(),
  description: z.string().optional(),
}).superRefine((value, context) => {
  if (value.type !== "Category" && !value.income_account_ref) {
    context.addIssue({ code: "custom", path: ["income_account_ref"], message: "Income account is required for sellable items" });
  }
  if (value.type === "Inventory") {
    for (const key of ["expense_account_ref", "asset_account_ref", "quantity_on_hand", "inv_start_date"] as const) {
      if (value[key] === undefined || value[key] === "") {
        context.addIssue({ code: "custom", path: [key], message: `${key} is required for Inventory items` });
      }
    }
  }
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksItem(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error creating item: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Item created successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const CreateItemTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
