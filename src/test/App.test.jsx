import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App, { Results } from '../App.jsx';
import { readGuest, saveGuest } from '../storage.js';

vi.mock('@uiw/react-codemirror', () => ({ default: ({ value, onChange, editable }) => <textarea aria-label="Kotlin code editor" value={value} onChange={e => onChange(e.target.value)} disabled={!editable} /> }));
const category = { id: 'warmup-1', name: 'Warmup-1', description: 'Small expressions.', total: 2 };
const starter = 'fun tileArea(width: Int, height: Int): Int {\n    TODO("Write your solution")\n}';
const source = 'fun tileArea(width: Int, height: Int): Int = width * height';
const problem = { id: 'tileArea', category: 'warmup-1', ordinal: 1, title: 'Tile area', statement: 'Return the rectangular area.', constraints: 'Inputs are small.', hint: 'Combine both dimensions.', starterCode: starter, examples: [{ call: 'tileArea(3, 4)', expected: 12 }] };
const next = { ...problem, id: 'nextPair', ordinal: 2, title: 'Next even stop' };
const passed = { problemId: 'tileArea', status: 'passed', summary: 'All tests passed.', visible: [{ call: 'tileArea(3, 4)', expected: 12, actual: 12, passed: true }], hidden: { passed: 3, total: 3 }, allPassed: true, saved: false };
let runResult, runCalls, session, accountRecords;

beforeEach(() => {
  localStorage.clear(); runResult = passed; runCalls = 0; session = null; accountRecords = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    const path = url.replace('/api/v1', '');
    let data;
    if (path === '/categories') data = [category];
    else if (path === '/categories/warmup-1/problems') data = [problem, next];
    else if (path === '/auth/me') data = { user: session, accountsAvailable: true };
    else if (path === '/progress') data = { records: accountRecords };
    else if (path === '/auth/logout') { session = null; data = {}; }
    else if (path === '/auth/login' || path === '/auth/register') { session = { username: JSON.parse(options.body).username }; data = session; }
    else if (path === '/progress/import-guest') {
      const record = JSON.parse(options.body).candidates[0];
      accountRecords = [{ ...record, completedAt: new Date().toISOString() }];
      data = { outcomes: [{ problemId: record.problemId, status: 'imported' }] };
    }
    else if (path.endsWith('/run')) { runCalls++; data = typeof runResult === 'function' ? await runResult() : runResult; }
    else data = path.endsWith('nextPair') ? next : problem;
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

const open = (path = '/problem/tileArea') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
async function editor() { const input = await screen.findByLabelText('Kotlin code editor'); await waitFor(() => expect(screen.getByRole('button', { name: 'Go' })).toBeEnabled()); return input; }

it('opens the starter, hides the one hint and keeps navigation ordered', async () => {
  open(); expect(await editor()).toHaveValue(starter);
  expect(screen.queryByText(problem.hint)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /nudge/ }));
  expect(screen.getByText(problem.hint)).toBeVisible();
  expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
  expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/problem/nextPair');
});

it('saves only fully passing source and Reset retains it for reopen', async () => {
  open(); fireEvent.change(await editor(), { target: { value: source } });
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
  await screen.findByText(/Verified by KotRunner/);
  expect(readGuest().records.tileArea.successfulSolution).toBe(source);
  await userEvent.click(screen.getByRole('button', { name: /Reset Code/ }));
  expect(screen.getByLabelText('Kotlin code editor')).toHaveValue(starter);
  expect(readGuest().records.tileArea.successfulSolution).toBe(source);
  await userEvent.click(screen.getByRole('link', { name: 'Warmup-1' }));
  await userEvent.click(await screen.findByRole('link', { name: /Tile area/ }));
  expect(await editor()).toHaveValue(source);
});

it('failed reruns and unfinished edits never overwrite a previous successful solution', async () => {
  saveGuest('tileArea', source);
  runResult = { ...passed, status: 'failed', summary: 'Some tests failed.', allPassed: false, hidden: { passed: 1, total: 3 } };
  open(); expect(await editor()).toHaveValue(source);
  fireEvent.change(screen.getByLabelText('Kotlin code editor'), { target: { value: 'incorrect draft' } });
  expect(readGuest().records.tileArea.successfulSolution).toBe(source);
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
  await screen.findByText('Some tests failed.');
  expect(readGuest().records.tileArea.successfulSolution).toBe(source);
});

it('disables duplicate submissions and reports network failures', async () => {
  let finish; runResult = () => new Promise(resolve => { finish = resolve; });
  open(); await editor();
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
  expect(screen.getByRole('button', { name: /Running/ })).toBeDisabled();
  expect(runCalls).toBe(1);
  finish({ ...passed, allPassed: false });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Go' })).toBeEnabled());
  globalThis.fetch.mockRejectedValueOnce(new TypeError('network'));
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach');
});

it('shows visible actual expected and calls with only a hidden aggregate', () => {
  render(<Results result={passed} />);
  expect(screen.getByText('tileArea(3, 4)')).toBeVisible();
  expect(screen.getByRole('columnheader', { name: 'Expected' })).toBeVisible();
  expect(screen.getByRole('columnheader', { name: 'Actual' })).toBeVisible();
  expect(screen.getByText('3 / 3 passed')).toBeVisible();
  expect(screen.getAllByRole('row')).toHaveLength(2);
});

it('registration displays validation and no recovery before input', async () => {
  open('/');
  await userEvent.click(await screen.findByRole('button', { name: /Log in/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  expect(screen.getByText(/There is no password recovery/)).toBeVisible();
  expect(screen.getByText(/72 UTF-8 bytes/)).toBeVisible();
  expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument();
});

it('login transfers verified guest records and logout never turns account records into guest records', async () => {
  saveGuest('tileArea', source); open('/');
  await userEvent.click(await screen.findByRole('button', { name: /Log in/ }));
  await userEvent.type(screen.getByLabelText('Username'), 'Alex');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Log in/ }));
  await screen.findByText(/1 browser solutions transferred/);
  expect(readGuest().records).toEqual({});
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await screen.findByText('Guest mode');
  expect(readGuest().records).toEqual({});
  expect(screen.queryByText('Alex')).not.toBeInTheDocument();
});

it('loads an existing account solution after logging in from an open guest editor', async () => {
  open(); await editor();
  accountRecords = [{ problemId: 'tileArea', successfulSolution: source, completedAt: new Date().toISOString() }];
  await userEvent.click(screen.getByRole('button', { name: /Log in/ }));
  await userEvent.type(screen.getByLabelText('Username'), 'Alex');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Log in/ }));
  await waitFor(() => expect(screen.getByLabelText('Kotlin code editor')).toHaveValue(source));
});
