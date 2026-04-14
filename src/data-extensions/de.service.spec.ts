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
    it('calls POST /data/v1/customobjectdata with body', async () => {
      (http.post as jest.Mock).mockResolvedValue({ requestId: 'abc' });
      const body = {
        name: 'TestDE',
        fields: [{ name: 'Id', fieldType: 'Text', isPrimaryKey: true }],
      };

      await svc.createDataExtension(body);

      expect(http.post).toHaveBeenCalledWith('/data/v1/customobjectdata', body);
    });
  });

  describe('getDataExtension', () => {
    it('calls GET with encoded external key', async () => {
      (http.get as jest.Mock).mockResolvedValue({ name: 'TestDE' });

      await svc.getDataExtension('MY/KEY');

      expect(http.get).toHaveBeenCalledWith(
        '/data/v1/customobjectdata/key/MY%2FKEY',
      );
    });
  });
});
