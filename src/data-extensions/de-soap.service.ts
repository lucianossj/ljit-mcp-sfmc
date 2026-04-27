import { Injectable } from '@nestjs/common';
import { SfmcSoapService, escapeXml } from '../sfmc/sfmc-soap.service';
import { SfmcApiError } from '../sfmc/sfmc-api.error';

export type DeSoapFieldType =
  | 'Text'
  | 'Number'
  | 'Date'
  | 'Boolean'
  | 'EmailAddress'
  | 'Phone'
  | 'Decimal'
  | 'Locale';

export interface DeSoapFieldDef {
  name: string;
  fieldType: DeSoapFieldType;
  maxLength?: number;
  isPrimaryKey?: boolean;
  isRequired?: boolean;
  defaultValue?: string;
}

export interface DeSoapCreateBody {
  name: string;
  customerKey: string;
  description?: string;
  isSendable?: boolean;
  sendableDataExtensionField?: { name: string };
  sendableSubscriberField?: { name: string };
  categoryId?: number;
  fields: DeSoapFieldDef[];
}

const RESPONSE_KEYS = ['CreateResponse', 'UpdateResponse', 'DeleteResponse'] as const;

@Injectable()
export class DeSoapService {
  constructor(private readonly soap: SfmcSoapService) {}

  /**
   * Lista pastas de Data Extension via SOAP (ContentType = "dataextension").
   * @param parentId Opcional: filtra por pasta pai
   */
  async listDataExtensionFolders(parentId?: number): Promise<any[]> {
    const filter = parentId
      ? `<Filter xsi:type="SimpleFilterPart">
           <Property>ParentFolder.ID</Property>
           <SimpleOperator>equals</SimpleOperator>
           <Value>${parentId}</Value>
         </Filter>`
      : `<Filter xsi:type="SimpleFilterPart">
           <Property>ContentType</Property>
           <SimpleOperator>equals</SimpleOperator>
           <Value>dataextension</Value>
         </Filter>`;

    const bodyXml = `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <RetrieveRequest>
        <ObjectType>Folder</ObjectType>
        <Properties>ID</Properties>
        <Properties>Name</Properties>
        <Properties>ContentType</Properties>
        <Properties>ParentFolder.ID</Properties>
        <Properties>Description</Properties>
        ${filter}
      </RetrieveRequest>
    </RetrieveRequestMsg>`;

    const response = await this.soap.soapRequest('Retrieve', bodyXml);
    return (response?.Results as any[]) ?? [];
  }

  async createDataExtension(body: DeSoapCreateBody): Promise<unknown> {
    const xml = this.buildCreateXml(body);
    const response = await this.soap.soapRequest('Create', xml);
    return this.parseResponse(response);
  }

  async updateDataExtension(customerKey: string, body: Partial<Omit<DeSoapCreateBody, 'customerKey'>>): Promise<unknown> {
    const xml = this.buildUpdateXml(customerKey, body);
    const response = await this.soap.soapRequest('Update', xml);
    return this.parseResponse(response);
  }

  async deleteDataExtension(customerKey: string): Promise<unknown> {
    const xml = this.buildDeleteXml(customerKey);
    const response = await this.soap.soapRequest('Delete', xml);
    return this.parseResponse(response);
  }

  private buildCreateXml(body: DeSoapCreateBody): string {
    const optionals = [
      body.description ? `<Description>${escapeXml(body.description)}</Description>` : '',
      body.isSendable !== undefined ? `<IsSendable>${body.isSendable}</IsSendable>` : '',
      body.sendableDataExtensionField
        ? `<SendableDataExtensionField><Name>${escapeXml(body.sendableDataExtensionField.name)}</Name></SendableDataExtensionField>`
        : '',
      body.sendableSubscriberField
        ? `<SendableSubscriberField><Name>${escapeXml(body.sendableSubscriberField.name)}</Name></SendableSubscriberField>`
        : '',
      body.categoryId !== undefined ? `<CategoryID>${body.categoryId}</CategoryID>` : '',
    ].filter(Boolean).join('');

    const fieldsXml = body.fields.map((f) => this.buildFieldXml(f)).join('');

    return `<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="DataExtension" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <Name>${escapeXml(body.name)}</Name>
    <CustomerKey>${escapeXml(body.customerKey)}</CustomerKey>
    ${optionals}
    <Fields>${fieldsXml}</Fields>
  </Objects>
</CreateRequest>`;
  }

  private buildUpdateXml(customerKey: string, body: Partial<Omit<DeSoapCreateBody, 'customerKey'>>): string {
    const optionals = [
      body.name ? `<Name>${escapeXml(body.name)}</Name>` : '',
      body.description ? `<Description>${escapeXml(body.description)}</Description>` : '',
      body.isSendable !== undefined ? `<IsSendable>${body.isSendable}</IsSendable>` : '',
    ].filter(Boolean).join('');

    const fieldsXml = body.fields?.map((f) => this.buildFieldXml(f)).join('') ?? '';

    return `<UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="DataExtension" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <CustomerKey>${escapeXml(customerKey)}</CustomerKey>
    ${optionals}
    ${fieldsXml ? `<Fields>${fieldsXml}</Fields>` : ''}
  </Objects>
</UpdateRequest>`;
  }

  private buildDeleteXml(customerKey: string): string {
    return `<DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="DataExtension" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <CustomerKey>${escapeXml(customerKey)}</CustomerKey>
  </Objects>
</DeleteRequest>`;
  }

  private buildFieldXml(f: DeSoapFieldDef): string {
    return `<Field>${[
      `<Name>${escapeXml(f.name)}</Name>`,
      `<FieldType>${escapeXml(f.fieldType)}</FieldType>`,
      f.maxLength !== undefined ? `<MaxLength>${f.maxLength}</MaxLength>` : '',
      f.isPrimaryKey !== undefined ? `<IsPrimaryKey>${f.isPrimaryKey}</IsPrimaryKey>` : '',
      f.isRequired !== undefined ? `<IsRequired>${f.isRequired}</IsRequired>` : '',
      f.defaultValue !== undefined ? `<DefaultValue>${escapeXml(f.defaultValue)}</DefaultValue>` : '',
    ].filter(Boolean).join('')}</Field>`;
  }

  private parseResponse(body: Record<string, unknown>): unknown {
    let response: Record<string, unknown> = body;
    for (const key of RESPONSE_KEYS) {
      if (body[key]) {
        response = body[key] as Record<string, unknown>;
        break;
      }
    }

    const overallStatus = String(response['OverallStatus'] ?? '');
    if (overallStatus === 'Error' || overallStatus === 'HasErrors') {
      const results = (
        Array.isArray(response['Results']) ? response['Results'] : [response['Results']]
      ) as Array<Record<string, unknown>>;
      const errorResult = results.find((r) => r && String(r['StatusCode']) === 'Error');
      const msg = errorResult
        ? `${errorResult['StatusMessage']} (ErrorCode: ${errorResult['ErrorCode']})`
        : `SOAP operação falhou: ${overallStatus}`;
      throw new SfmcApiError(400, msg);
    }

    return {
      overallStatus,
      requestId: response['RequestID'],
      results: response['Results'],
    };
  }
}
