import { CbService } from './cb.service';
import type { SfmcHttpService } from '../sfmc/sfmc-http.service';

const http = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
} as unknown as SfmcHttpService;

beforeEach(() => jest.clearAllMocks());

describe('CbService', () => {
  let svc: CbService;
  beforeEach(() => { svc = new CbService(http); });

  describe('listAssets', () => {
    it('calls correct endpoint with default pagination', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

      await svc.listAssets();

      expect(http.get).toHaveBeenCalledWith(
        '/asset/v1/content/assets',
        { $page: 1, $pageSize: 50 },
      );
    });

    it('passes custom page and pageSize', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

      await svc.listAssets({ page: 2, pageSize: 20 });

      expect(http.get).toHaveBeenCalledWith(
        '/asset/v1/content/assets',
        expect.objectContaining({ $page: 2, $pageSize: 20 }),
      );
    });

    it('adds $filter by assetTypeId when provided', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

      await svc.listAssets({ assetTypeId: 207 });

      expect(http.get).toHaveBeenCalledWith(
        '/asset/v1/content/assets',
        expect.objectContaining({ $filter: 'assetType.id eq 207' }),
      );
    });

    it('adds $filter by query name when provided', async () => {
      (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

      await svc.listAssets({ query: 'Welcome' });

      expect(http.get).toHaveBeenCalledWith(
        '/asset/v1/content/assets',
        expect.objectContaining({ $filter: "name like '%Welcome%'" }),
      );
    });
  });

  describe('getAsset', () => {
    it('calls GET with asset id in path', async () => {
      (http.get as jest.Mock).mockResolvedValue({ id: 42 });

      await svc.getAsset(42);

      expect(http.get).toHaveBeenCalledWith('/asset/v1/content/assets/42');
    });
  });

  describe('createAsset', () => {
    it('calls POST with body', async () => {
      (http.post as jest.Mock).mockResolvedValue({ id: 99 });
      const body = { name: 'Banner', assetType: { id: 207 }, content: '<p>hi</p>' };

      await svc.createAsset(body);

      expect(http.post).toHaveBeenCalledWith('/asset/v1/content/assets', body);
    });
  });

  describe('updateAsset', () => {
    it('calls PATCH with id and partial body', async () => {
      (http.patch as jest.Mock).mockResolvedValue({ id: 42 });

      await svc.updateAsset(42, { content: '<p>updated</p>' });

      expect(http.patch).toHaveBeenCalledWith(
        '/asset/v1/content/assets/42',
        { content: '<p>updated</p>' },
      );
    });
  });

  describe('deleteAsset', () => {
    it('calls DELETE with asset id in path', async () => {
      (http.delete as jest.Mock).mockResolvedValue('');

      await svc.deleteAsset(42);

      expect(http.delete).toHaveBeenCalledWith('/asset/v1/content/assets/42');
    });
  });

  describe('listCategories', () => {
    it('calls GET without filter when no parentId', async () => {
      (http.get as jest.Mock).mockResolvedValue([]);

      await svc.listCategories();

      expect(http.get).toHaveBeenCalledWith('/asset/v1/content/categories', {});
    });

    it('adds $filter when parentId is provided', async () => {
      (http.get as jest.Mock).mockResolvedValue([]);

      await svc.listCategories(10);

      expect(http.get).toHaveBeenCalledWith(
        '/asset/v1/content/categories',
        { $filter: 'parentId eq 10' },
      );
    });
  });

  describe('createCategory', () => {
    it('calls POST with name only when no parentId', async () => {
      (http.post as jest.Mock).mockResolvedValue({ id: 5 });

      await svc.createCategory('My Folder');

      expect(http.post).toHaveBeenCalledWith(
        '/asset/v1/content/categories',
        { name: 'My Folder' },
      );
    });

    it('includes parentId when provided', async () => {
      (http.post as jest.Mock).mockResolvedValue({ id: 6 });

      await svc.createCategory('Sub Folder', 5);

      expect(http.post).toHaveBeenCalledWith(
        '/asset/v1/content/categories',
        { name: 'Sub Folder', parentId: 5 },
      );
    });
  });
});
