import { TransactionalService } from './transactional.service';
import type { SfmcHttpService } from '../sfmc/sfmc-http.service';
import type { CbService } from '../content-builder/cb.service';
import type { DeService } from '../data-extensions/de.service';

const http = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
} as unknown as SfmcHttpService;

const cb = {
  getAssetByCustomerKey: jest.fn(),
  getAsset: jest.fn(),
} as unknown as CbService;

const de = {
  getDeFields: jest.fn(),
  getDataExtension: jest.fn(),
} as unknown as DeService;

beforeEach(() => jest.clearAllMocks());

describe('TransactionalService', () => {
  let svc: TransactionalService;
  beforeEach(() => { svc = new TransactionalService(http, cb, de); });

  // ─── listDefinitions ────────────────────────────────────────────────────────

  describe('listDefinitions', () => {
    it.each(['email', 'sms', 'push'] as const)(
      'calls correct endpoint for %s channel with default pagination',
      async (channel) => {
        (http.get as jest.Mock).mockResolvedValue({ definitions: [], count: 0 });

        await svc.listDefinitions(channel);

        expect(http.get).toHaveBeenCalledWith(
          `/messaging/v1/${channel}/definitions`,
          { page: 1, pageSize: 50 },
        );
      },
    );

    it('includes status filter when provided', async () => {
      (http.get as jest.Mock).mockResolvedValue({ definitions: [], count: 0 });

      await svc.listDefinitions('email', { status: 'Active' });

      expect(http.get).toHaveBeenCalledWith(
        '/messaging/v1/email/definitions',
        expect.objectContaining({ status: 'Active' }),
      );
    });

    it('passes custom page and pageSize', async () => {
      (http.get as jest.Mock).mockResolvedValue({ definitions: [], count: 0 });

      await svc.listDefinitions('sms', { page: 2, pageSize: 10 });

      expect(http.get).toHaveBeenCalledWith(
        '/messaging/v1/sms/definitions',
        expect.objectContaining({ page: 2, pageSize: 10 }),
      );
    });
  });

  // ─── getDefinition ──────────────────────────────────────────────────────────

  describe('getDefinition', () => {
    it('calls GET with URL-encoded definitionKey', async () => {
      (http.get as jest.Mock).mockResolvedValue({ definitionKey: 'welcome email' });

      await svc.getDefinition('email', 'welcome email');

      expect(http.get).toHaveBeenCalledWith(
        '/messaging/v1/email/definitions/welcome%20email',
      );
    });
  });

  // ─── createEmailDefinition ──────────────────────────────────────────────────

  describe('createEmailDefinition', () => {
    it('calls POST /messaging/v1/email/definitions with body', async () => {
      (http.post as jest.Mock).mockResolvedValue({ definitionKey: 'welcome' });
      const body = {
        definitionKey: 'welcome',
        name: 'Welcome Email',
        content: { customerKey: 'WELCOME_TEMPLATE' },
        subscriptions: { dataExtension: 'Subscribers' },
      };

      await svc.createEmailDefinition(body);

      expect(http.post).toHaveBeenCalledWith('/messaging/v1/email/definitions', body);
    });
  });

  // ─── createSmsDefinition ────────────────────────────────────────────────────

  describe('createSmsDefinition', () => {
    it('calls POST /messaging/v1/sms/definitions with body', async () => {
      (http.post as jest.Mock).mockResolvedValue({ definitionKey: 'promo-sms' });
      const body = {
        definitionKey: 'promo-sms',
        name: 'Promo SMS',
        content: { message: 'Your promo code: {{code}}' },
        subscriptions: { shortCode: '12345', countryCode: 'US' },
      };

      await svc.createSmsDefinition(body);

      expect(http.post).toHaveBeenCalledWith('/messaging/v1/sms/definitions', body);
    });
  });

  // ─── createPushDefinition ───────────────────────────────────────────────────

  describe('createPushDefinition', () => {
    it('calls POST /messaging/v1/push/definitions with body', async () => {
      (http.post as jest.Mock).mockResolvedValue({ definitionKey: 'app-push' });
      const body = {
        definitionKey: 'app-push',
        name: 'App Push',
        content: { title: 'Hello', message: 'Check this out' },
      };

      await svc.createPushDefinition(body);

      expect(http.post).toHaveBeenCalledWith('/messaging/v1/push/definitions', body);
    });
  });

  // ─── updateDefinition ───────────────────────────────────────────────────────

  describe('updateDefinition', () => {
    it('calls PATCH with URL-encoded key and body', async () => {
      (http.patch as jest.Mock).mockResolvedValue({});

      await svc.updateDefinition('email', 'my key', { status: 'Inactive' });

      expect(http.patch).toHaveBeenCalledWith(
        '/messaging/v1/email/definitions/my%20key',
        { status: 'Inactive' },
      );
    });
  });

  // ─── deleteDefinition ───────────────────────────────────────────────────────

  describe('deleteDefinition', () => {
    it('calls DELETE with URL-encoded key', async () => {
      (http.delete as jest.Mock).mockResolvedValue('');

      await svc.deleteDefinition('sms', 'promo-sms');

      expect(http.delete).toHaveBeenCalledWith(
        '/messaging/v1/sms/definitions/promo-sms',
      );
    });
  });

  // ─── sendEmail ──────────────────────────────────────────────────────────────

  describe('sendEmail', () => {
    it('calls POST with messageKey in path and definitionKey + recipient in body', async () => {
      (http.post as jest.Mock).mockResolvedValue({ messageKey: 'msg-001' });
      const recipient = { contactKey: 'CK_001', to: 'user@example.com' };

      await svc.sendEmail('msg-001', 'welcome', recipient);

      expect(http.post).toHaveBeenCalledWith(
        '/messaging/v1/email/messages/msg-001',
        { definitionKey: 'welcome', recipient },
      );
    });

    it('URL-encodes messageKey in path', async () => {
      (http.post as jest.Mock).mockResolvedValue({});

      await svc.sendEmail('msg key/1', 'def', { contactKey: 'ck', to: 'x@y.com' });

      expect(http.post).toHaveBeenCalledWith(
        '/messaging/v1/email/messages/msg%20key%2F1',
        expect.any(Object),
      );
    });
  });

  // ─── sendEmailBatch ─────────────────────────────────────────────────────────

  describe('sendEmailBatch', () => {
    it('calls POST /messaging/v1/email/messages with definitionKey and recipients', async () => {
      (http.post as jest.Mock).mockResolvedValue({ requestId: 'batch-1' });
      const recipients = [
        { contactKey: 'CK_1', to: 'a@b.com' },
        { contactKey: 'CK_2', to: 'c@d.com' },
      ];

      await svc.sendEmailBatch('welcome', recipients);

      expect(http.post).toHaveBeenCalledWith(
        '/messaging/v1/email/messages',
        { definitionKey: 'welcome', recipients },
      );
    });
  });

  // ─── sendSms ────────────────────────────────────────────────────────────────

  describe('sendSms', () => {
    it('calls POST with messageKey in path', async () => {
      (http.post as jest.Mock).mockResolvedValue({});

      await svc.sendSms('msg-sms-1', 'promo-sms', { contactKey: 'CK', to: '+15551234' });

      expect(http.post).toHaveBeenCalledWith(
        '/messaging/v1/sms/messages/msg-sms-1',
        { definitionKey: 'promo-sms', recipient: { contactKey: 'CK', to: '+15551234' } },
      );
    });
  });

  // ─── sendSmsBatch ───────────────────────────────────────────────────────────

  describe('sendSmsBatch', () => {
    it('calls POST /messaging/v1/sms/messages with recipients array', async () => {
      (http.post as jest.Mock).mockResolvedValue({});

      await svc.sendSmsBatch('promo-sms', [{ contactKey: 'CK', to: '+15551234' }]);

      expect(http.post).toHaveBeenCalledWith(
        '/messaging/v1/sms/messages',
        { definitionKey: 'promo-sms', recipients: [{ contactKey: 'CK', to: '+15551234' }] },
      );
    });
  });

  // ─── sendPush ───────────────────────────────────────────────────────────────

  describe('sendPush', () => {
    it('calls POST with messageKey in path', async () => {
      (http.post as jest.Mock).mockResolvedValue({});

      await svc.sendPush('msg-push-1', 'app-push', { contactKey: 'CK' });

      expect(http.post).toHaveBeenCalledWith(
        '/messaging/v1/push/messages/msg-push-1',
        { definitionKey: 'app-push', recipient: { contactKey: 'CK' } },
      );
    });
  });

  // ─── getMessageStatus ───────────────────────────────────────────────────────

  describe('getMessageStatus', () => {
    it.each(['email', 'sms', 'push'] as const)(
      'calls GET for %s channel with URL-encoded messageKey',
      async (channel) => {
        (http.get as jest.Mock).mockResolvedValue({ status: 'Sent' });

        await svc.getMessageStatus(channel, 'msg/key');

        expect(http.get).toHaveBeenCalledWith(
          `/messaging/v1/${channel}/messages/msg%2Fkey`,
        );
      },
    );

    it('enriches response with statusDescription when statusCode is present', async () => {
      (http.get as jest.Mock).mockResolvedValue({ statusCode: 103, eventCategoryType: 'TransactionalSendEvents.EmailNotSent' });

      const result = await svc.getMessageStatus('email', 'msg-1') as Record<string, unknown>;

      expect(result.statusCode).toBe(103);
      expect(result.statusDescription).toBeDefined();
      expect(typeof result.statusDescription).toBe('string');
    });

    it('does not add statusDescription when statusCode is absent', async () => {
      (http.get as jest.Mock).mockResolvedValue({ eventCategoryType: 'TransactionalSendEvents.EmailSent' });

      const result = await svc.getMessageStatus('email', 'msg-1') as Record<string, unknown>;

      expect(result.statusDescription).toBeUndefined();
    });
  });

  // ─── listAllDefinitions deduplication ───────────────────────────────────────

  describe('listDefinitions (fetchAll deduplication)', () => {
    it('deduplicates definitions by definitionKey when fetchAll=true', async () => {
      const defs = [
        { definitionKey: 'key-a', name: 'A' },
        { definitionKey: 'key-b', name: 'B' },
        { definitionKey: 'key-a', name: 'A duplicate' },
      ];
      (http.get as jest.Mock).mockResolvedValue({ definitions: defs, count: 3 });

      const result = await svc.listDefinitions('email', { fetchAll: true });

      expect(result.definitions).toHaveLength(2);
      expect(result.definitions.map(d => d['definitionKey'])).toEqual(['key-a', 'key-b']);
    });
  });

  // ─── sendEmailAndCheck ──────────────────────────────────────────────────────

  describe('sendEmailAndCheck', () => {
    it('sends email and returns status after polling', async () => {
      (http.post as jest.Mock).mockResolvedValue({ requestId: 'req-1', errorcode: 0 });
      (http.get as jest.Mock).mockResolvedValue({ eventCategoryType: 'TransactionalSendEvents.EmailSent' });

      const result = await svc.sendEmailAndCheck('msg-1', 'def-1', { contactKey: 'CK', to: 'x@y.com' }, { maxAttempts: 1, intervalMs: 0 });

      expect(result.messageKey).toBe('msg-1');
      expect(result.send).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });

  // ─── preflightEmailSend ─────────────────────────────────────────────────────

  describe('preflightEmailSend', () => {
    const activeDefinition = {
      name: 'Test Email',
      status: 'Active',
      content: { customerKey: 'ck-123' },
      subscriptions: { dataExtension: 'DE_TEST' },
      fromEmail: 'from@test.com',
    };

    const mockAsset = {
      id: 42,
      name: 'My Template',
      views: { html: { content: '%%[ SET @name = AttributeValue("firstName") ]%% Hello %%=v(@name)=%%' } },
    };

    it('returns passed=false when definition is not found', async () => {
      (http.get as jest.Mock).mockRejectedValue(new Error('Not found'));

      const result = await svc.preflightEmailSend('missing-def', {});

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('missing-def');
    });

    it('returns passed=false when definition status is Inactive', async () => {
      (http.get as jest.Mock).mockResolvedValue({ ...activeDefinition, status: 'Inactive' });
      (cb.getAssetByCustomerKey as jest.Mock).mockResolvedValue(mockAsset);
      (de.getDeFields as jest.Mock).mockResolvedValue(['firstName']);

      const result = await svc.preflightEmailSend('def-key', {});

      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('Inactive'))).toBe(true);
    });

    it('returns passed=false when asset is not found in Content Builder', async () => {
      (http.get as jest.Mock).mockResolvedValue(activeDefinition);
      (cb.getAssetByCustomerKey as jest.Mock).mockResolvedValue(null);
      (de.getDeFields as jest.Mock).mockResolvedValue([]);

      const result = await svc.preflightEmailSend('def-key', {});

      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('ck-123'))).toBe(true);
    });

    it('returns passed=false when template has RaiseError guard and required attribute is missing', async () => {
      const assetWithGuard = {
        id: 42,
        name: 'Template With Guard',
        views: {
          html: {
            content: `%%[
              SET @name = AttributeValue("firstName")
              IF RowCount(@name) == 0 THEN
                RaiseError("firstName is required")
              ENDIF
            ]%%`,
          },
        },
      };
      (http.get as jest.Mock).mockResolvedValue(activeDefinition);
      (cb.getAssetByCustomerKey as jest.Mock).mockResolvedValue(assetWithGuard);
      (de.getDeFields as jest.Mock).mockResolvedValue(['firstName', 'lastName']);

      const result = await svc.preflightEmailSend('def-key', {});

      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('firstName'))).toBe(true);
    });

    it('auto-normalizes attribute case and adds warning', async () => {
      (http.get as jest.Mock).mockResolvedValue(activeDefinition);
      (cb.getAssetByCustomerKey as jest.Mock).mockResolvedValue(mockAsset);
      (de.getDeFields as jest.Mock).mockResolvedValue(['firstName']);

      const result = await svc.preflightEmailSend('def-key', { FIRSTNAME: 'John' });

      expect(result.passed).toBe(true);
      expect(result.normalizedAttributes).toEqual({ firstName: 'John' });
      expect(result.warnings.some(w => w.includes('FIRSTNAME') && w.includes('firstName'))).toBe(true);
    });

    it('returns warning (not error) for missing attribute when no RaiseError guards exist', async () => {
      (http.get as jest.Mock).mockResolvedValue(activeDefinition);
      (cb.getAssetByCustomerKey as jest.Mock).mockResolvedValue(mockAsset);
      (de.getDeFields as jest.Mock).mockResolvedValue(['firstName']);

      const result = await svc.preflightEmailSend('def-key', {});

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('firstName'))).toBe(true);
    });

    it('passes when all required attributes are provided', async () => {
      (http.get as jest.Mock).mockResolvedValue(activeDefinition);
      (cb.getAssetByCustomerKey as jest.Mock).mockResolvedValue(mockAsset);
      (de.getDeFields as jest.Mock).mockResolvedValue(['firstName']);

      const result = await svc.preflightEmailSend('def-key', { firstName: 'John' });

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.asset).toMatchObject({ id: 42, name: 'My Template', customerKey: 'ck-123' });
      expect(result.requiredAttributes).toContain('firstName');
      expect(result.deFields).toEqual(['firstName']);
    });
  });

  // ─── sendEmailWithPreflight ─────────────────────────────────────────────────

  describe('sendEmailWithPreflight', () => {
    it('returns sent=false and preflight report when definition is inactive', async () => {
      (http.get as jest.Mock).mockResolvedValue({
        name: 'T', status: 'Inactive', content: { customerKey: 'ck' }, subscriptions: {},
      });
      (cb.getAssetByCustomerKey as jest.Mock).mockResolvedValue({ id: 1, name: 'A', views: {} });
      (de.getDeFields as jest.Mock).mockResolvedValue([]);

      const result = await svc.sendEmailWithPreflight('msg-1', 'def-1', { contactKey: 'CK', to: 'x@y.com' });

      expect(result.sent).toBe(false);
      expect(result.preflight?.passed).toBe(false);
      expect(http.post).not.toHaveBeenCalled();
    });

    it('sends with normalized attributes when preflight passes', async () => {
      (http.get as jest.Mock).mockResolvedValue({
        name: 'T', status: 'Active', content: { customerKey: 'ck' }, subscriptions: { dataExtension: 'DE' },
      });
      (cb.getAssetByCustomerKey as jest.Mock).mockResolvedValue({ id: 1, name: 'A', views: {} });
      (de.getDeFields as jest.Mock).mockResolvedValue(['Email']);
      (http.post as jest.Mock).mockResolvedValue({ requestId: 'r1' });

      const result = await svc.sendEmailWithPreflight('msg-1', 'def-1', {
        contactKey: 'CK', to: 'x@y.com', attributes: { email: 'x@y.com' },
      });

      expect(result.sent).toBe(true);
      expect(result.preflight?.passed).toBe(true);
      expect(result.preflight?.normalizedAttributes).toEqual({ Email: 'x@y.com' });
      expect(http.post).toHaveBeenCalledWith(
        '/messaging/v1/email/messages/msg-1',
        expect.objectContaining({
          recipient: expect.objectContaining({ attributes: { Email: 'x@y.com' } }),
        }),
      );
    });

    it('skips preflight and sends directly when skipPreflight=true', async () => {
      (http.post as jest.Mock).mockResolvedValue({ requestId: 'r1' });

      const result = await svc.sendEmailWithPreflight(
        'msg-1', 'def-1', { contactKey: 'CK', to: 'x@y.com' }, { skipPreflight: true },
      );

      expect(result.sent).toBe(true);
      expect(result.preflight).toBeNull();
      expect(http.get).not.toHaveBeenCalled();
    });
  });
});
