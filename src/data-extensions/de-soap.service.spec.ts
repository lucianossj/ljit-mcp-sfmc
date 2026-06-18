import { DeSoapService } from './de-soap.service';
import type { SfmcSoapService } from '../sfmc/sfmc-soap.service';

const soap = {
  retrieve: jest.fn(),
  soapRequest: jest.fn(),
} as unknown as SfmcSoapService;

const retrieveMock = soap.retrieve as jest.Mock;
const soapRequestMock = soap.soapRequest as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('DeSoapService', () => {
  let svc: DeSoapService;
  beforeEach(() => {
    svc = new DeSoapService(soap);
    retrieveMock.mockResolvedValue({ results: [], overallStatus: 'OK', truncated: false });
  });

  describe('listDataExtensions', () => {
    it('uses ObjectType DataExtension with no Filter when no options', async () => {
      await svc.listDataExtensions();
      const [objectType, props, filterXml] = retrieveMock.mock.calls[0];
      expect(objectType).toBe('DataExtension');
      expect(props).toContain('CustomerKey');
      expect(filterXml).toBe('');
    });

    it('builds a SimpleFilterPart for categoryId only', async () => {
      await svc.listDataExtensions({ categoryId: 50782 });
      const filterXml = retrieveMock.mock.calls[0][2] as string;
      expect(filterXml).toContain('xsi:type="SimpleFilterPart"');
      expect(filterXml).toContain('<Property>CategoryID</Property>');
      expect(filterXml).toContain('<Value>50782</Value>');
      expect(filterXml).not.toContain('ComplexFilterPart');
    });

    it('builds a "like" contains filter for nameFilter only', async () => {
      await svc.listDataExtensions({ nameFilter: 'RECEITA' });
      const filterXml = retrieveMock.mock.calls[0][2] as string;
      expect(filterXml).toContain('<Property>Name</Property>');
      expect(filterXml).toContain('<SimpleOperator>like</SimpleOperator>');
      expect(filterXml).toContain('<Value>%RECEITA%</Value>');
    });

    it('combines categoryId AND nameFilter into a ComplexFilterPart', async () => {
      await svc.listDataExtensions({ categoryId: 50782, nameFilter: 'RECEITA' });
      const filterXml = retrieveMock.mock.calls[0][2] as string;
      expect(filterXml).toContain('xsi:type="ComplexFilterPart"');
      expect(filterXml).toContain('<LogicalOperator>AND</LogicalOperator>');
      expect(filterXml).toContain('CategoryID');
      expect(filterXml).toContain('%RECEITA%');
    });

    it('normalizes results and surfaces count/truncated', async () => {
      retrieveMock.mockResolvedValue({
        truncated: true,
        overallStatus: 'MoreDataAvailable',
        results: [
          { Name: 'DEX_A', CustomerKey: 'KEY_A', CategoryID: '50782', IsSendable: 'true', IsTestable: 'false' },
        ],
      });
      const out = await svc.listDataExtensions({ categoryId: 50782 });
      expect(out.count).toBe(1);
      expect(out.truncated).toBe(true);
      expect(out.items[0]).toEqual({
        name: 'DEX_A',
        externalKey: 'KEY_A',
        categoryId: 50782,
        description: undefined,
        isSendable: true,
        isTestable: false,
      });
    });
  });

  describe('listDataExtensionFolders', () => {
    it('retrieves DataFolder (not Folder) filtered by ContentType when no parentId', async () => {
      await svc.listDataExtensionFolders();
      const [objectType, , filterXml] = retrieveMock.mock.calls[0];
      expect(objectType).toBe('DataFolder');
      expect(filterXml).toContain('<Property>ContentType</Property>');
      expect(filterXml).toContain('<Value>dataextension</Value>');
    });

    it('filters by ParentFolder.ID when parentId is given', async () => {
      await svc.listDataExtensionFolders(50782);
      const filterXml = retrieveMock.mock.calls[0][2] as string;
      expect(filterXml).toContain('<Property>ParentFolder.ID</Property>');
      expect(filterXml).toContain('<Value>50782</Value>');
    });

    it('normalizes folder results including nested ParentFolder.ID', async () => {
      retrieveMock.mockResolvedValue({
        truncated: false,
        overallStatus: 'OK',
        results: [
          { ID: 50782, Name: 'Transacionais', ContentType: 'dataextension', ParentFolder: { ID: 43792 } },
        ],
      });
      const folders = await svc.listDataExtensionFolders();
      expect(folders[0]).toEqual({
        id: 50782,
        name: 'Transacionais',
        contentType: 'dataextension',
        parentId: 43792,
        description: undefined,
      });
    });
  });
});
