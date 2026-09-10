import { Platform } from 'react-native';

const configuredBaseUrl =
  typeof process !== 'undefined' && process.env
    ? process.env.EXPO_PUBLIC_API_BASE_URL
    : undefined;

const webHostBaseUrl =
  typeof window !== 'undefined' && window.location?.hostname
    ? `${window.location.protocol || 'http:'}//${window.location.hostname}:8000`
    : 'http://localhost:8000';

const defaultBaseUrl =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : Platform.OS === 'web'
      ? webHostBaseUrl
      : 'http://localhost:8000';

export const API_BASE_URL = (
  configuredBaseUrl || defaultBaseUrl
).replace(/\/+$/, '');

const OPTIONAL_REQUEST_TIMEOUT_MS = 15000;
// The login flow now runs Model 1/2 only, so this should fail promptly if the
// lightweight portfolio pipeline is unavailable.
const INVESTMENT_RUN_TIMEOUT_MS = 5 * 60 * 1000;
// Model 3 is an optional local-LLM discussion and may take considerably
// longer on a CPU-only machine.
const DISCUSSION_RUN_TIMEOUT_MS = 35 * 60 * 1000;

async function fetchWithTimeout(url, options = {}, timeoutMs = OPTIONAL_REQUEST_TIMEOUT_MS) {
  if (typeof AbortController === 'undefined') {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = body.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : detail?.user_message || detail?.message || JSON.stringify(detail || body);
    throw new Error(message || `後端回應錯誤（${response.status}）`);
  }

  return body;
}

export async function fetchLatestInvestment() {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/investment/latest`, {
    cache: 'no-store',
  });
  return parseResponse(response);
}

export async function fetchLatestStockDetail(stockId) {
  if (!stockId) {
    throw new Error('缺少股票代號');
  }

  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/stocks/${encodeURIComponent(stockId)}/detail`,
    { cache: 'no-store' },
  );
  return parseResponse(response);
}

export async function fetchLatestStockCharts(stockId, limit = 90) {
  if (!stockId) {
    throw new Error('缺少股票代號');
  }

  const query = `?limit=${encodeURIComponent(limit)}`;
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/stocks/${encodeURIComponent(stockId)}/charts${query}`,
    { cache: 'no-store' },
  );
  return parseResponse(response);
}

export async function runInvestment(profile) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/investment/run`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profile),
    },
    INVESTMENT_RUN_TIMEOUT_MS,
  );

  return parseResponse(response);
}

export async function runDiscussion() {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/investment/discussion`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
    DISCUSSION_RUN_TIMEOUT_MS,
  );

  return parseResponse(response);
}
