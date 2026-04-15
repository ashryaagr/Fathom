import type { LensApi } from './index';

declare global {
  interface Window {
    lens: LensApi;
  }
}

export {};
