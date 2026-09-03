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

const { LookupAutomationEntitiesTool } = await import('../../../src/tools/lookup-automation-entities.tool');
const { UpdateAutomationEntityTool } = await import('../../../src/tools/update-automation-entity.tool');
const lookup = LookupAutomationEntitiesTool.handler as (args: any) => Promise<any>;
const update = UpdateAutomationEntityTool.handler as (args: any) => Promise<any>;

describe('automation entity MCP tools', () => {
  beforeEach(() => resetAllMocks());

  it('validates lookup and update inputs', () => {
    expect(LookupAutomationEntitiesTool.schema.safeParse({ entity_type: 'invoice', id: '1' }).success).toBe(true);
    expect(LookupAutomationEntitiesTool.schema.safeParse({ entity_type: 'unknown' }).success).toBe(false);
    expect(UpdateAutomationEntityTool.schema.safeParse({ entity_type: 'invoice', id: '1', patch: {} }).success).toBe(false);
    expect(UpdateAutomationEntityTool.schema.safeParse({ entity_type: 'invoice', id: '1', patch: { PrivateNote: 'A' }, line_reconciliation: 'exact_mirror' }).success).toBe(true);
  });

  it('returns lookup results and errors', async () => {
    mockQuickBooksInstance.getCustomer.mockImplementation((_id: any, cb: any) => cb(null, { Id: '7' }));
    const success = await lookup({ params: { entity_type: 'customer', id: '7' } });
    expect(success.content[0].text).toContain('"Id":"7"');

    mockQuickBooksInstance.getCustomer.mockImplementation((_id: any, cb: any) => cb(new Error('failed')));
    const failure = await lookup({ params: { entity_type: 'customer', id: '7' } });
    expect(failure.content[0].text).toContain('Error looking up automation entities');
  });

  it('returns update results and errors', async () => {
    mockQuickBooksInstance.getCustomer.mockImplementation((_id: any, cb: any) => cb(null, { Id: '7', SyncToken: '0' }));
    mockQuickBooksInstance.updateCustomer.mockImplementation((payload: any, cb: any) => cb(null, payload));
    const success = await update({ params: { entity_type: 'customer', id: '7', patch: { DisplayName: 'A' } } });
    expect(success.content[0].text).toContain('updated successfully');
    expect(success.content[1].text).toContain('"DisplayName": "A"');

    mockQuickBooksInstance.updateCustomer.mockImplementation((_payload: any, cb: any) => cb(new Error('failed')));
    const failure = await update({ params: { entity_type: 'customer', id: '7', patch: { DisplayName: 'A' } } });
    expect(failure.content[0].text).toContain('Error updating entity');
  });
});
