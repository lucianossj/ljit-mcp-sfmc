import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { SfmcSoapService } from './sfmc-soap.service';
import type { AuthService } from '../auth/auth.service';

const mock = new MockAdapter(axios);

const SOAP_URL = 'https://mc.soap.marketingcloudapis.com';
const ENDPOINT = `${SOAP_URL}/Service.asmx`;
const TOKEN = 'bearer_token_123';

const authService = {
  getAccessToken: jest.fn().mockResolvedValue({ accessToken: TOKEN, soapBaseUrl: SOAP_URL }),
} as unknown as AuthService;

beforeEach(() => {
  mock.reset();
  jest.clearAllMocks();
  (authService.getAccessToken as jest.Mock).mockResolvedValue({ accessToken: TOKEN, soapBaseUrl: SOAP_URL });
});

const retrieveEnvelope = (status: string, names: string[], requestId = 'req-1') => `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <OverallStatus>${status}</OverallStatus>
      <RequestID>${requestId}</RequestID>
      ${names.map((n) => `<Results xsi:type="DataFolder"><ID>1</ID><Name>${n}</Name></Results>`).join('')}
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;

describe('SfmcSoapService.retrieve', () => {
  let svc: SfmcSoapService;
  beforeEach(() => { svc = new SfmcSoapService(authService); });

  it('reads Results nested under RetrieveResponseMsg', async () => {
    mock.onPost(ENDPOINT).reply(200, retrieveEnvelope('OK', ['A', 'B']));

    const { results, overallStatus, truncated } = await svc.retrieve('DataFolder', ['ID', 'Name']);

    expect(overallStatus).toBe('OK');
    expect(truncated).toBe(false);
    expect(results.map((r) => r['Name'])).toEqual(['A', 'B']);
  });

  it('follows ContinueRequest while MoreDataAvailable and concatenates results', async () => {
    mock
      .onPost(ENDPOINT)
      .replyOnce(200, retrieveEnvelope('MoreDataAvailable', ['A']))
      .onPost(ENDPOINT)
      .replyOnce(200, retrieveEnvelope('OK', ['B']));

    const { results } = await svc.retrieve('DataFolder', ['ID', 'Name']);

    expect(results.map((r) => r['Name'])).toEqual(['A', 'B']);
    expect(mock.history.post).toHaveLength(2);
    expect(mock.history.post[1].data).toContain('<ContinueRequest>req-1</ContinueRequest>');
  });

  it('throws when OverallStatus is an Error', async () => {
    mock.onPost(ENDPOINT).reply(200, retrieveEnvelope('Error: DataFolder is not valid', []));

    await expect(svc.retrieve('DataFolder', ['ID'])).rejects.toThrow('SOAP Retrieve falhou');
  });
});
