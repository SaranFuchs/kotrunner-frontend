export const STORAGE_KEY = 'kotrunner.progress.v1';
const ID = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const bytes = text => new TextEncoder().encode(text).length;

export function readGuest(storage) {
  try {
    storage ??= globalThis.localStorage;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { records: {}, warning: '' };
    const data = JSON.parse(raw);
    if (data.schemaVersion !== 1 || !data.completedProblems || Array.isArray(data.completedProblems) || typeof data.completedProblems !== 'object') {
      return { records: {}, warning: 'Saved browser progress has an unsupported format. The original data has been retained.' };
    }
    const records = {};
    let invalid = false;
    for (const [id, record] of Object.entries(data.completedProblems)) {
      if (!ID.test(id) || !record || typeof record.successfulSolution !== 'string' || bytes(record.successfulSolution) > 32768 || !record.successfulSolution.trim() || typeof record.completedAt !== 'string' || !Number.isFinite(Date.parse(record.completedAt))) {
        invalid = true; continue;
      }
      records[id] = { problemId: id, successfulSolution: record.successfulSolution, completedAt: record.completedAt };
    }
    return { records, warning: invalid ? 'Some saved browser records could not be read. Their original data has been retained.' : '' };
  } catch {
    return { records: {}, warning: 'Browser progress could not be read. Existing data has been retained. Check your browser storage settings.' };
  }
}

function write(records, storage) {
  try { (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, completedProblems: records })); }
  catch { throw new Error('Tests passed, but this browser could not save progress. Allow local storage and run Go again to retry.'); }
  return records;
}

export function saveGuest(problemId, source, storage) {
  const { records, warning } = readGuest(storage);
  // Do not overwrite corrupt or future-version data silently.
  if (warning) throw new Error('Browser progress needs attention before a new solution can be saved. Existing data has been retained.');
  if (!ID.test(problemId) || !source.trim() || bytes(source) > 32768) throw new Error('Invalid successful solution.');
  records[problemId] = { problemId, successfulSolution: source, completedAt: new Date().toISOString() };
  return write(records, storage);
}

export function clearTransferred(problemId, verifiedSource, storage) {
  const { records, warning } = readGuest(storage);
  if (warning) throw new Error('The account received your solution, but browser storage could not be updated. A retry will preserve the account solution.');
  if (records[problemId]?.successfulSolution === verifiedSource) delete records[problemId];
  return write(records, storage);
}
