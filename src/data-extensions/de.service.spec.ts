import { DeService } from './de.service';
import type { SfmcHttpService } from '../sfmc/sfmc-http.service';

const http = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
} as unknown as SfmcHttpService;

beforeEach(() => jest.clearAllMocks());

describe('DeService', () => {
  let svc: DeService;
  beforeEach(() => { svc = new DeService(http); });

  describe('listDataExtensions', () => {
    it('calls GET /data/v1/customobjects with $search when nameFilter is provided', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, page: 1, pageSize: 50, items: [] });

      await svc.listDataExtensions({ nameFilter: 'CMP_' });

      expect(http.get).toHaveBeenCalledWith(
        '/data/v1/customobjects',
        { $page: 1, $pageSize: 50, $search: 'CMP_' },
      );
    });

    it('passes custom page and pageSize', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, page: 2, pageSize: 25, items: [] });

      await svc.listDataExtensions({ nameFilter: 'TEST', page: 2, pageSize: 25 });

      expect(http.get).toHaveBeenCalledWith(
        '/data/v1/customobjects',
        expect.objectContaining({ $page: 2, $pageSize: 25 }),
      );
    });

    it('throws when nameFilter is not provided', async () => {
      await expect(svc.listDataExtensions()).rejects.toThrow('nameFilter é obrigatório');
    });

    it('normalizes response mapping key to externalKey', async () => {
      (http.get as jest.Mock).mockResolvedValue({
        count: 1, page: 1, pageSize: 50,
        items: [{ id: 'uuid-1', name: 'TestDE', key: 'TEST_KEY', isSendable: true }],
      });

      const result = await svc.listDataExtensions({ nameFilter: 'Test' });

      expect(result.items[0]).toMatchObject({ externalKey: 'TEST_KEY', name: 'TestDE' });
    });
  });

  describe('listRows', () => {
    it('calls correct endpoint with default pagination', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

      await svc.listRows('MY_KEY');

      expect(http.get).toHaveBeenCalledWith(
        '/data/v1/customobjectdata/key/MY_KEY/rowset',
        { $page: 1, $pageSize: 50 },
      );
    });

    it('passes custom page and pageSize', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

      await svc.listRows('MY_KEY', { page: 3, pageSize: 25 });

      expect(http.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ $page: 3, $pageSize: 25 }),
      );
    });

    it('includes $filter when filter option is provided', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

      await svc.listRows('MY_KEY', { filter: 'status eq "active"' });

      expect(http.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ $filter: 'status eq "active"' }),
      );
    });

    it('does not include $filter when filter option is absent', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

      await svc.listRows('MY_KEY');

      const params = (http.get as jest.Mock).mock.calls[0][1];
      expect(params.$filter).toBeUndefined();
    });

    it('URL-encodes the external key', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

      await svc.listRows('KEY WITH SPACES');

      expect(http.get).toHaveBeenCalledWith(
        '/data/v1/customobjectdata/key/KEY%20WITH%20SPACES/rowset',
        expect.any(Object),
      );
    });
  });

  describe('upsertRows', () => {
    it('calls POST with items array', async () => {
      (http.post as jest.Mock).mockResolvedValue({ upsertedRows: 2 });
      const items = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }];

      await svc.upsertRows('MY_KEY', items);

      expect(http.post).toHaveBeenCalledWith(
        '/data/v1/customobjectdata/key/MY_KEY/rowset',
        items,
      );
    });
  });

  describe('createDataExtension', () => {
    it('calls POST /data/v1/customobjects with mapped body', async () => {
      (http.post as jest.Mock).mockResolvedValue({ requestId: 'abc' });
      const body = {
        name: 'TestDE',
        fields: [{ name: 'Id', fieldType: 'Text', isPrimaryKey: true }],
      };

      await svc.createDataExtension(body);

      expect(http.post).toHaveBeenCalledWith('/data/v1/customobjects', expect.objectContaining({ name: 'TestDE' }));
    });

    it('maps externalKey to key in request payload', async () => {
      (http.post as jest.Mock).mockResolvedValue({ requestId: 'abc' });

      await svc.createDataExtension({ name: 'TestDE', externalKey: 'MY_KEY', fields: [] });

      expect(http.post).toHaveBeenCalledWith(
        '/data/v1/customobjects',
        expect.objectContaining({ key: 'MY_KEY' }),
      );
    });
  });

  describe('getDataExtension', () => {
    it('searches by key and fetches by ID', async () => {
      (http.get as jest.Mock)
        .mockResolvedValueOnce({ items: [{ id: 'uuid-1', key: 'MY/KEY', name: 'TestDE' }] })
        .mockResolvedValueOnce({ id: 'uuid-1', name: 'TestDE' });

      await svc.getDataExtension('MY/KEY');

      expect(http.get).toHaveBeenNthCalledWith(1, '/data/v1/customobjects', expect.objectContaining({ $search: 'MY/KEY' }));
      expect(http.get).toHaveBeenNthCalledWith(2, '/data/v1/customobjects/uuid-1');
    });

    it('throws when DE is not found', async () => {
      (http.get as jest.Mock).mockResolvedValue({ items: [] });

      await expect(svc.getDataExtension('UNKNOWN')).rejects.toThrow("não encontrada");
    });
  });

  describe('getDeFieldsWithMetadata', () => {
    const mockDE = {
      id: 'uuid-1', name: 'TestDE',
      fields: [
        { name: 'SubscriberKey', fieldType: 'Text', isPrimaryKey: true, isRequired: true },
        { name: 'NomeCliente', fieldType: 'Text', isPrimaryKey: false, isRequired: true },
        { name: 'Status', fieldType: 'Text', isPrimaryKey: false, isRequired: true, defaultValue: 'Ativo' },
        { name: 'Observacao', fieldType: 'Text', isPrimaryKey: false, isRequired: false },
      ],
    };

    beforeEach(() => {
      (http.get as jest.Mock)
        .mockResolvedValueOnce({ items: [{ id: 'uuid-1', key: 'TEST_KEY' }] })
        .mockResolvedValueOnce(mockDE);
    });

    it('returns field metadata with correct types', async () => {
      const result = await svc.getDeFieldsWithMetadata('TEST_KEY');

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ name: 'SubscriberKey', fieldType: 'Text', isPrimaryKey: true, isRequired: true, defaultValue: undefined });
      expect(result[1]).toEqual({ name: 'NomeCliente', fieldType: 'Text', isPrimaryKey: false, isRequired: true, defaultValue: undefined });
      expect(result[2]).toMatchObject({ name: 'Status', defaultValue: 'Ativo', isRequired: true });
      expect(result[3]).toMatchObject({ name: 'Observacao', isRequired: false });
    });

    it('getDeFields delegates to getDeFieldsWithMetadata returning names only', async () => {
      const result = await svc.getDeFields('TEST_KEY');
      expect(result).toEqual(['SubscriberKey', 'NomeCliente', 'Status', 'Observacao']);
    });
  });
});
