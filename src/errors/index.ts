export enum ExitCode {
  Success = 0,
  ApiError = 1,
  ConfigError = 2,
  AuthError = 3,
  RateLimited = 4,
  NoResults = 5,
}

export class WitError extends Error {
  constructor(
    message: string,
    public readonly code: ExitCode,
    public readonly provider?: string,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = 'WitError';
  }

  toJSON() {
    return {
      code: ExitCode[this.code].toLowerCase(),
      message: this.message,
      suggestion: this.suggestion ?? '',
      provider: this.provider,
    };
  }
}

export function mapHttpStatus(status: number, provider: string): WitError {
  switch (status) {
    case 401:
    case 403:
      return new WitError(
        `Authentication failed for ${provider}`,
        ExitCode.AuthError,
        provider,
        `Check your API key. Run: wit config check`,
      );
    case 402:
      return new WitError(
        `Billing/credits exhausted for ${provider}`,
        ExitCode.ApiError,
        provider,
        `Top up your ${provider} account`,
      );
    case 429:
      return new WitError(
        `Rate limited by ${provider}`,
        ExitCode.RateLimited,
        provider,
        `Wait and retry, or reduce request frequency`,
      );
    default:
      if (status >= 500) {
        return new WitError(
          `Server error from ${provider} (${status})`,
          ExitCode.ApiError,
          provider,
          `Retry in a moment`,
        );
      }
      return new WitError(
        `HTTP ${status} from ${provider}`,
        ExitCode.ApiError,
        provider,
      );
  }
}
