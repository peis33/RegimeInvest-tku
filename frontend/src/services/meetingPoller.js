// Read-only polling continues after completion so externally started runs appear.
export function startMeetingPolling({ fetchLatest, onData, onError, schedule = setTimeout, cancel = clearTimeout }) {
  let active = true;
  let timer;
  let delay = 10000;
  const poll = async () => {
    try {
      const data = await fetchLatest();
      if (!active) return;
      delay = ['queued', 'running'].includes(data?.discussion_status?.status) ? 3000 : 10000;
      onData(data);
    } catch (error) {
      if (active) onError(error);
    }
    if (active) timer = schedule(poll, delay);
  };
  poll();
  return () => { active = false; cancel(timer); };
}
