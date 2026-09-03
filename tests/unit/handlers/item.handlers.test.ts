import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  mockQuickbooksClient,
  mockQuickbooksClientClass,
  mockQuickBooksInstance,
  resetAllMocks,
} from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { createQuickbooksItem } = await import('../../../src/handlers/create-quickbooks-item.handler');

describe('Item Handlers', () => {
  beforeEach(() => resetAllMocks());

  it('passes required inventory tracking fields to QuickBooks', async () => {
    mockQuickBooksInstance.createItem.mockImplementation((payload: any, cb: any) => cb(null, { Id: '44' }));

    const result = await createQuickbooksItem({
      name: 'Automation Inventory',
      type: 'Inventory',
      income_account_ref: '79',
      expense_account_ref: '80',
      asset_account_ref: '81',
      quantity_on_hand: 5,
      inv_start_date: '2026-08-31',
      purchase_cost: 10,
    });

    expect(result.isError).toBe(false);
    const payload = (mockQuickBooksInstance.createItem.mock.calls[0] as any)[0];
    expect(payload).toMatchObject({
      Type: 'Inventory',
      IncomeAccountRef: { value: '79' },
      ExpenseAccountRef: { value: '80' },
      AssetAccountRef: { value: '81' },
      TrackQtyOnHand: true,
      QtyOnHand: 5,
      InvStartDate: '2026-08-31',
      PurchaseCost: 10,
    });
  });

  it('creates a category without posting accounts', async () => {
    mockQuickBooksInstance.createItem.mockImplementation((payload: any, cb: any) => cb(null, { Id: '43' }));

    const result = await createQuickbooksItem({ name: 'Automation Category', type: 'Category' });

    expect(result.isError).toBe(false);
    const payload = (mockQuickBooksInstance.createItem.mock.calls[0] as any)[0];
    expect(payload.Type).toBe('Category');
    expect(payload.IncomeAccountRef).toBeUndefined();
  });
});
