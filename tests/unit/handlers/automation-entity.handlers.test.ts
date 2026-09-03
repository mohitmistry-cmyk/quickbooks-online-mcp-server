import { beforeEach, describe, expect, it, jest } from '@jest/globals';
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

const { lookupQuickbooksAutomationEntities } = await import(
  '../../../src/handlers/lookup-quickbooks-automation-entities.handler'
);
const { updateQuickbooksAutomationEntity } = await import(
  '../../../src/handlers/update-quickbooks-automation-entity.handler'
);

describe('automation entity lookup and update handlers', () => {
  beforeEach(() => resetAllMocks());

  it('gets one entity by ID', async () => {
    mockQuickBooksInstance.getCustomer.mockImplementation((_id: any, cb: any) => cb(null, { Id: '7' }));
    await expect(lookupQuickbooksAutomationEntities('customer', '7')).resolves.toMatchObject({
      isError: false,
      result: [{ Id: '7' }],
    });
  });

  it('returns an empty list when an ID lookup has no entity', async () => {
    mockQuickBooksInstance.getCustomer.mockImplementation((_id: any, cb: any) => cb(null, {}));
    const result = await lookupQuickbooksAutomationEntities('customer', 'missing');
    expect(result.result).toEqual([]);
  });

  it('fetches every entity for composite matching', async () => {
    mockQuickBooksInstance.findCustomers.mockImplementation((criteria: any, cb: any) => {
      expect(criteria).toEqual({ fetchAll: true });
      cb(null, { QueryResponse: { Customer: [{ Id: '1' }, { Id: '2' }] } });
    });
    const result = await lookupQuickbooksAutomationEntities('customer');
    expect(result.result).toHaveLength(2);
  });

  it.each([
    ['class', 'findClasses', 'Class'],
    ['journal_entry', 'findJournalEntries', 'JournalEntry'],
    ['time_activity', 'findTimeActivities', 'TimeActivity'],
  ])('uses the SDK irregular plural for %s', async (entityType, method, responseKey) => {
    (mockQuickBooksInstance as any)[method].mockImplementation((_criteria: any, cb: any) =>
      cb(null, { QueryResponse: { [responseKey]: [{ Id: '1' }] } }),
    );
    expect((await lookupQuickbooksAutomationEntities(entityType)).result).toEqual([{ Id: '1' }]);
  });

  it('normalizes missing query rows and reports lookup errors', async () => {
    mockQuickBooksInstance.findCustomers.mockImplementation((_criteria: any, cb: any) => cb(null, {}));
    expect((await lookupQuickbooksAutomationEntities('customer')).result).toEqual([]);
    mockQuickBooksInstance.findCustomers.mockImplementation((_criteria: any, cb: any) => cb(new Error('query failed')));
    expect((await lookupQuickbooksAutomationEntities('customer')).isError).toBe(true);
    expect((await lookupQuickbooksAutomationEntities('unsupported')).isError).toBe(true);
  });

  it('reports unavailable SDK methods and authentication failures', async () => {
    const original = mockQuickBooksInstance.getCustomer;
    (mockQuickBooksInstance as any).getCustomer = undefined;
    expect((await lookupQuickbooksAutomationEntities('customer', '7')).isError).toBe(true);
    (mockQuickBooksInstance as any).getCustomer = original;
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValueOnce(new Error('auth failed'));
    expect((await lookupQuickbooksAutomationEntities('customer', '7')).isError).toBe(true);
  });

  it('deep-merges sparse fields and refreshes SyncToken before update', async () => {
    mockQuickBooksInstance.getCustomer.mockImplementation((_id: any, cb: any) => cb(null, {
      Id: '7', SyncToken: '3', DisplayName: 'Old', PrimaryPhone: { FreeFormNumber: '111', Extension: '9' },
    }));
    mockQuickBooksInstance.updateCustomer.mockImplementation((payload: any, cb: any) => cb(null, payload));
    const result = await updateQuickbooksAutomationEntity({
      entity_type: 'customer', id: '7', patch: { PrimaryPhone: { FreeFormNumber: '222' } },
    });
    expect(result.result).toMatchObject({
      Id: '7', SyncToken: '3', sparse: true,
      PrimaryPhone: { FreeFormNumber: '222', Extension: '9' },
    });
    expect(result.result).not.toHaveProperty('DisplayName');
  });

  it('merge mode updates matched lines, adds new lines, and preserves unmatched lines', async () => {
    mockQuickBooksInstance.getInvoice.mockImplementation((_id: any, cb: any) => cb(null, {
      Id: '9', SyncToken: '1', Line: [
        { Id: '1', Amount: 10, Description: 'keep' },
        { Id: '2', Amount: 20, Description: 'old' },
        { Amount: 3, DetailType: 'SubTotalLineDetail' },
      ],
    }));
    mockQuickBooksInstance.updateInvoice.mockImplementation((payload: any, cb: any) => cb(null, payload));
    const result = await updateQuickbooksAutomationEntity({
      entity_type: 'invoice', id: '9',
      patch: { Line: [{ Id: '2', Amount: 25 }, { Amount: 5 }] },
      line_reconciliation: 'merge_only',
    });
    expect(result.result.Line).toEqual([
      { Id: '1', Amount: 10, Description: 'keep' },
      { Id: '2', Amount: 25, Description: 'old' },
      { Amount: 5 },
      { Amount: 3, DetailType: 'SubTotalLineDetail' },
    ]);
    expect(result.result.sparse).toBe(false);
  });

  it('preserves required Bill header references without re-sending lines on sparse update', async () => {
    mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, {
      Id: '12', SyncToken: '4', VendorRef: { value: '9' },
      Line: [{ Id: '1', DetailType: 'ItemBasedExpenseLineDetail' }],
    }));
    mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => cb(null, payload));
    const result = await updateQuickbooksAutomationEntity({
      entity_type: 'bill', id: '12', patch: { PrivateNote: 'changed' },
    });
    expect(result.result).toMatchObject({
      Id: '12', SyncToken: '4', sparse: true,
      VendorRef: { value: '9' }, PrivateNote: 'changed',
    });
    expect(result.result).not.toHaveProperty('Line');
  });

  it.each([
    ['vendor_credit', 'getVendorCredit', 'updateVendorCredit', {
      VendorRef: { value: '9' }, APAccountRef: { value: '33' },
    }],
    ['deposit', 'getDeposit', 'updateDeposit', {
      DepositToAccountRef: { value: '35' },
    }],
    ['transfer', 'getTransfer', 'updateTransfer', {
      FromAccountRef: { value: '35' }, ToAccountRef: { value: '36' }, Amount: 10,
    }],
    ['term', 'getTerm', 'updateTerm', {
      Type: 'DATE_DRIVEN', DayOfMonthDue: 15, DiscountDayOfMonth: 5,
    }],
    ['purchase', 'getPurchase', 'updatePurchase', {
      PaymentType: 'Cash', AccountRef: { value: '35' },
    }],
  ])('preserves required %s fields during a sparse header update', async (
    entityType, getMethod, updateMethod, required,
  ) => {
    (mockQuickBooksInstance as any)[getMethod].mockImplementation((_id: any, cb: any) => cb(null, {
      Id: '12', SyncToken: '4', ...required, Line: [{ Id: '1', DetailType: 'DescriptionOnly' }],
    }));
    (mockQuickBooksInstance as any)[updateMethod].mockImplementation((payload: any, cb: any) => cb(null, payload));
    const result = await updateQuickbooksAutomationEntity({
      entity_type: entityType, id: '12', patch: { PrivateNote: 'changed' },
    });
    expect(result.result).toMatchObject({
      Id: '12', SyncToken: '4', sparse: true, ...required, PrivateNote: 'changed',
    });
    expect(result.result).not.toHaveProperty('Line');
  });

  it('exact mirror removes unmatched lines', async () => {
    mockQuickBooksInstance.getInvoice.mockImplementation((_id: any, cb: any) => cb(null, {
      Id: '9', SyncToken: '1', Line: [{ Id: '1', Amount: 10 }, { Id: '2', Amount: 20 }],
    }));
    mockQuickBooksInstance.updateInvoice.mockImplementation((payload: any, cb: any) => cb(null, payload));
    const result = await updateQuickbooksAutomationEntity({
      entity_type: 'invoice', id: '9', patch: { Line: [{ Id: '2', Amount: 30 }] },
      line_reconciliation: 'exact_mirror',
    });
    expect(result.result.Line).toEqual([{ Id: '2', Amount: 30 }]);
  });

  it('returns errors for unsupported, missing, get, update, and auth failures', async () => {
    expect((await updateQuickbooksAutomationEntity({ entity_type: 'bad', id: '1', patch: {} })).isError).toBe(true);
    mockQuickBooksInstance.getCustomer.mockImplementation((_id: any, cb: any) => cb(null, {}));
    expect((await updateQuickbooksAutomationEntity({ entity_type: 'customer', id: '1', patch: {} })).isError).toBe(true);
    mockQuickBooksInstance.getCustomer.mockImplementation((_id: any, cb: any) => cb(new Error('get failed')));
    expect((await updateQuickbooksAutomationEntity({ entity_type: 'customer', id: '1', patch: {} })).isError).toBe(true);
    mockQuickBooksInstance.getCustomer.mockImplementation((_id: any, cb: any) => cb(null, { Id: '1', SyncToken: '0' }));
    mockQuickBooksInstance.updateCustomer.mockImplementation((_payload: any, cb: any) => cb(new Error('update failed')));
    expect((await updateQuickbooksAutomationEntity({ entity_type: 'customer', id: '1', patch: { DisplayName: 'A' } })).isError).toBe(true);
    const originalUpdate = mockQuickBooksInstance.updateCustomer;
    (mockQuickBooksInstance as any).updateCustomer = undefined;
    expect((await updateQuickbooksAutomationEntity({ entity_type: 'customer', id: '1', patch: { DisplayName: 'A' } })).isError).toBe(true);
    (mockQuickBooksInstance as any).updateCustomer = originalUpdate;
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValueOnce(new Error('auth failed'));
    expect((await updateQuickbooksAutomationEntity({ entity_type: 'customer', id: '1', patch: {} })).isError).toBe(true);
  });
});
