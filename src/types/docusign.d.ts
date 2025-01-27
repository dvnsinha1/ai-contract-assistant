declare module 'docusign-esign' {
  export class ApiClient {
    constructor();
    setBasePath(basePath: string): void;
    addDefaultHeader(header: string, value: string): void;
  }

  export class EnvelopesApi {
    constructor(apiClient: ApiClient);
    getDocument(
      accountId: string,
      envelopeId: string,
      documentId: string
    ): Promise<any>;
  }
} 