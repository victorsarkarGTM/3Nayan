/** Thrown by provider adapters when the outside service is unavailable or errors. */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}
