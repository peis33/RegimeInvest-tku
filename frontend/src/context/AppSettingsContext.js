import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

const AppSettingsContext = createContext(null);

export function AppSettingsProvider({
  children,
  investmentResult = null,
  investmentRunPending = false,
  investmentRunError = null,
  discussionRunPending = false,
  discussionRunError = null,
  startDiscussion = null,
}) {
  const [actionWindowEnabled, setActionWindowEnabled] = useState(true);
  const [customGroups, setCustomGroups] = useState([]);
  const customGroupSequence = useRef(0);

  const addCustomGroup = useCallback((symbols, name = '') => {
    customGroupSequence.current += 1;
    const id = `custom-group-${Date.now()}-${customGroupSequence.current}`;
    const group = {
      id,
      name: String(name || '').trim(),
      symbols: Array.from(new Set((symbols || []).map((symbol) => String(symbol)))),
    };

    setCustomGroups((current) => [...current, group]);
    return id;
  }, []);

  const updateCustomGroup = useCallback((groupId, changes) => {
    setCustomGroups((current) => current.map((group) => (
      group.id === groupId
        ? {
            ...group,
            ...changes,
            ...(changes.symbols
              ? { symbols: Array.from(new Set(changes.symbols.map((symbol) => String(symbol)))) }
              : {}),
            ...(typeof changes.name === 'string'
              ? { name: changes.name.trim() }
              : {}),
          }
        : group
    )));
  }, []);

  const renameCustomGroup = useCallback((groupId, name) => {
    updateCustomGroup(groupId, { name });
  }, [updateCustomGroup]);

  const value = useMemo(
    () => ({
      actionWindowEnabled,
      setActionWindowEnabled,
      investmentResult,
      investmentRunPending,
      investmentRunError,
      discussionRunPending,
      discussionRunError,
      startDiscussion,
      customGroups,
      addCustomGroup,
      updateCustomGroup,
      renameCustomGroup,
    }),
    [
      actionWindowEnabled,
      investmentResult,
      investmentRunPending,
      investmentRunError,
      discussionRunPending,
      discussionRunError,
      startDiscussion,
      customGroups,
      addCustomGroup,
      updateCustomGroup,
      renameCustomGroup,
    ],
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);

  if (!context) {
    throw new Error('useAppSettings 必須在 AppSettingsProvider 內使用');
  }

  return context;
}
