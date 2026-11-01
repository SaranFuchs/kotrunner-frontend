import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { JSDOM } from 'jsdom';
// Node 26's experimental global storage shadows jsdom's browser storage.
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new JSDOM('', { url: 'http://localhost' }).window.localStorage });
afterEach(cleanup);
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
