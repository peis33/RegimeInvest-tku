export function judgeConsistencyFailed(data) {
  const status = data?.discussion_status;
  return status?.status === 'failed' && (
    status.failure_code === 'judge_order_inconsistent' ||
    status.progress?.validation_errors?.includes('judge_order_inconsistent')
  );
}

export const JUDGE_CONSISTENCY_FAILURE_MESSAGE = '本次裁決未通過一致性檢查，兩次配置不同，未採用任何一次結果，原配置保持不變。';
