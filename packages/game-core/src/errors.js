export class GameCoreError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'GameCoreError';
    this.code = code;
    this.details = details;
  }
}
