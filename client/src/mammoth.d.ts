declare module 'mammoth' {
  interface ConvertToHtmlResult { value: string; messages: any[]; }
  function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<ConvertToHtmlResult>;
}
