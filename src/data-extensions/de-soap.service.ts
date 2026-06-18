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
  /**
   * Cria uma pasta de Data Extension via SOAP.
   * @param name Nome da pasta
   * @param parentId ID da pasta pai (opcional)
   * @param description Descrição (opcional)
   */
  async createDataExtensionFolder({ name, parentId, description }: { name: string; parentId?: number; description?: string }): Promise<any> {
    const bodyXml = `<CreateRequest xmlns=\"http://exacttarget.com/wsdl/partnerAPI\">
      <Objects xsi:type=\"DataFolder\">
        <Name>${escapeXml(name)}</Name>
        <ContentType>dataextension</ContentType>
        <IsEditable>true</IsEditable>
        <AllowChildren>true</AllowChildren>
        ${parentId !== undefined ? `<ParentFolder><ID>${parentId}</ID></ParentFolder>` : ''}
        ${description ? `<Description>${escapeXml(description)}</Description>` : ''}
      </Objects>
    </CreateRequest>`;
    const response = await this.soap.soapRequest('Create', bodyXml);
    return response;
  }

  constructor(private readonly soap: SfmcSoapService) {}

  /**
   * Lista pastas via SOAP. Sem parentId, filtra por ContentType = "dataextension";
   * com parentId, lista os filhos diretos dessa pasta. O ObjectType correto é
   * "DataFolder" ("Folder" é inválido na API). Paginação tratada pelo retrieve().
   * @param parentId Opcional: filtra por pasta pai
   */
  async listDataExtensionFolders(parentId?: number): Promise<Array<Record<string, unknown>>> {
    const filterXml =
      parentId !== undefined
        ? `<Filter xsi:type="SimpleFilterPart"><Property>ParentFolder.ID</Property><SimpleOperator>equals</SimpleOperator><Value>${parentId}</Value></Filter>`
        : `<Filter xsi:type="SimpleFilterPart"><Property>ContentType</Property><SimpleOperator>equals</SimpleOperator><Value>dataextension</Value></Filter>`;

    const { results } = await this.soap.retrieve(
      'DataFolder',
      ['ID', 'Name', 'ContentType', 'ParentFolder.ID', 'Description'],
      filterXml,
    );

    return results.map((f) => ({
      id: f['ID'],
      name: f['Name'],
      contentType: f['ContentType'],
      parentId: (f['ParentFolder'] as Record<string, unknown> | undefined)?.['ID'],
      description: f['Description'],
    }));
  }

  /**
   * Lista Data Extensions via SOAP (Retrieve). Suporta filtros opcionais e
   * agnósticos: nameFilter (contains, via operador `like`) e categoryId (pasta).
   * Sem filtro, lista todas (paginação automática no retrieve, com teto).
   */
  async listDataExtensions(
    options: { nameFilter?: string; categoryId?: number } = {},
  ): Promise<{ count: number; truncated: boolean; items: Array<Record<string, unknown>> }> {
    const { results, truncated } = await this.soap.retrieve(
      'DataExtension',
      ['Name', 'CustomerKey', 'CategoryID', 'Description', 'IsSendable', 'IsTestable'],
      this.buildDeListFilter(options),
    );

    const items = results.map((d) => ({
      name: d['Name'],
      externalKey: d['CustomerKey'],
      categoryId: d['CategoryID'] !== undefined ? Number(d['CategoryID']) : undefined,
      description: d['Description'],
      isSendable: this.toBool(d['IsSendable']),
      isTestable: this.toBool(d['IsTestable']),
    }));

    return { count: items.length, truncated, items };
  }

  private toBool(v: unknown): boolean | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    return String(v).toLowerCase() === 'true';
  }

  private simpleFilter(property: string, op: string, value: string): string {
    return `<Property>${property}</Property><SimpleOperator>${op}</SimpleOperator><Value>${value}</Value>`;
  }

  /** Monta o filtro SOAP: combina categoryId (equals) e nameFilter (like) com AND quando ambos. */
  private buildDeListFilter(options: { nameFilter?: string; categoryId?: number }): string {
    const conds: Array<{ p: string; op: string; v: string }> = [];
    if (options.categoryId !== undefined) {
      conds.push({ p: 'CategoryID', op: 'equals', v: String(options.categoryId) });
    }
    if (options.nameFilter) {
      conds.push({ p: 'Name', op: 'like', v: `%${escapeXml(options.nameFilter)}%` });
    }

    if (conds.length === 0) return '';
    if (conds.length === 1) {
      const c = conds[0];
      return `<Filter xsi:type="SimpleFilterPart">${this.simpleFilter(c.p, c.op, c.v)}</Filter>`;
    }
    const [a, b] = conds;
    return (
      `<Filter xsi:type="ComplexFilterPart">` +
      `<LeftOperand xsi:type="SimpleFilterPart">${this.simpleFilter(a.p, a.op, a.v)}</LeftOperand>` +
      `<LogicalOperator>AND</LogicalOperator>` +
      `<RightOperand xsi:type="SimpleFilterPart">${this.simpleFilter(b.p, b.op, b.v)}</RightOperand>` +
      `</Filter>`
    );
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
