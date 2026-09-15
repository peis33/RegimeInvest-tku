// Retry only explicit busy responses; never hide validation/network failures.
export async function waitForConfiguration(read, { pause = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 600 } = {}) {
  for (let i = 0; ; i += 1) {
    try { return await read(); }
    catch (error) {
      if (error.code !== 'configuration_busy' || i >= attempts) throw error;
      await pause(3000);
    }
  }
}

export async function submitConfiguration(profile, submit, read, options) {
  return waitForConfiguration(async () => {
    try { return await submit(profile); }
    catch (error) {
      if (error.code !== 'configuration_busy') throw error;
      let latest;
      try { latest = await waitForConfiguration(read, options); }
      catch (readError) {
        if (readError.code === 'configuration_unavailable') throw error;
        throw readError;
      }
      if (Object.entries(profile).every(([key, value]) => JSON.stringify(latest?.profile?.[key]) === JSON.stringify(value))) return latest;
      throw error;
    }
  }, options);
}
