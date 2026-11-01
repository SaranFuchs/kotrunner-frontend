import { beforeEach, describe, expect, it } from 'vitest';
import { clearTransferred, readGuest, saveGuest, STORAGE_KEY } from '../storage.js';

describe('successful guest storage', () => {
  beforeEach(() => localStorage.clear());
  it('persists successful code with a versioned schema and reopens it', () => {
    const source = 'fun tileArea(width: Int, height: Int) = width * height';
    saveGuest('tileArea', source);
    expect(readGuest().records.tileArea.successfulSolution).toBe(source);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).schemaVersion).toBe(1);
  });
  it.each(['{broken', '{"schemaVersion":99,"completedProblems":{}}', '{"schemaVersion":1,"completedProblems":[]}'])('retains unreadable or future data: %s', raw => {
    localStorage.setItem(STORAGE_KEY, raw);
    expect(readGuest().warning).not.toBe('');
    expect(() => saveGuest('tileArea', 'source')).toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it('does not trust malformed completion records', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, completedProblems: { bad: { completed: true }, tileArea: { successfulSolution: 'code', completedAt: 'invalid' } } }));
    expect(readGuest().records).toEqual({});
  });
  it('clears only a server-confirmed snapshot and preserves concurrent changes', () => {
    saveGuest('tileArea', 'old successful source');
    saveGuest('tileArea', 'new successful source');
    clearTransferred('tileArea', 'old successful source');
    expect(readGuest().records.tileArea.successfulSolution).toBe('new successful source');
    clearTransferred('tileArea', 'new successful source');
    expect(readGuest().records).toEqual({});
  });
  it('reports denied or full storage clearly', () => {
    expect(() => saveGuest('tileArea', 'source', { getItem: () => null, setItem: () => { throw Error('quota'); } })).toThrow('could not save');
  });
  it('handles unavailable browser storage without crashing', () => {
    const state = readGuest({ getItem: () => { throw Error('denied'); } });
    expect(state.records).toEqual({});
    expect(state.warning).toContain('could not be read');
  });
});
