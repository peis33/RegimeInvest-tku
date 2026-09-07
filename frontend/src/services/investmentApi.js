import { Platform } from 'react-native';

const configuredBaseUrl =
  typeof process !== 'undefined' && process.env
    ? process.env.EXPO_PUBLIC_API_BASE_URL
    : undefined;

const defaultBaseUrl =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://localhost:8000';

export const API_BASE_URL = (
  configuredBaseUrl || defaultBaseUrl
).replace(/\/+$/, '');

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      typeof body.detail === 'string'
        ? body.detail
        : JSON.stringify(body.detail || body);
    throw new Error(detail || `後端回應錯誤（${response.status}）`);
  }

  return body;
}

export async function fetchLatestInvestment() {
  const response = await fetch(`${API_BASE_URL}/api/investment/latest`);
  return parseResponse(response);
}

export async function fetchLatestStockDetail(stockId) {
  if (!stockId) {
    throw new Error('缺少股票代號');
  }

  const response = await fetch(
    `${API_BASE_URL}/api/stocks/${encodeURIComponent(stockId)}/detail`,
  );
  return parseResponse(response);
}

export async function runInvestment(profile) {
  const response = await fetch(`${API_BASE_URL}/api/investment/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profile),
  });

  return parseResponse(response);
}
