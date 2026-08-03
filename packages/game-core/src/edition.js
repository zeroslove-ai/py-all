import { GameCoreError } from './errors.js';

const REQUIRED_FIELDS = [
  'editionId',
  'contentVersion',
  'organization',
  'map',
  'characters',
  'generalNpcs',
  'csaPresets'
];

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, field) {
  if (!isPlainObject(value)) {
    throw new GameCoreError('INVALID_EDITION_ADAPTER', `${field} must be a plain object`, { field });
  }
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GameCoreError('INVALID_EDITION_ADAPTER', `${field} must be a non-empty string`, { field });
  }
}

export function validateEditionAdapter(adapter) {
  assertPlainObject(adapter, 'edition adapter');

  for (const field of REQUIRED_FIELDS) {
    if (!(field in adapter)) {
      throw new GameCoreError('INVALID_EDITION_ADAPTER', `Missing required field: ${field}`, { field });
    }
  }

  assertNonEmptyString(adapter.editionId, 'editionId');
  assertNonEmptyString(adapter.contentVersion, 'contentVersion');

  for (const field of REQUIRED_FIELDS.slice(2)) {
    assertPlainObject(adapter[field], field);
  }

  return adapter;
}

export function createEditionAdapter(adapter) {
  return validateEditionAdapter(adapter);
}
