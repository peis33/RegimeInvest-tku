import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AppSettingsContext = createContext(null);

const PERSISTED_STATE_STORAGE_KEY = 'stockapp.persistentState.v1';
// Keep the old key readable so users do not lose their previously selected
// default group when upgrading from the earlier localStorage-only version.
const LEGACY_DEFAULT_STOCK_GROUP_STORAGE_KEY = 'stockapp.defaultStockGroup';

function createDefaultCompareGroup(id = 'compare-group-0') {
  return { id, slots: ['', ''] };
}

function createDefaultTriggerRule(id = 'trigger-rule-1') {
  return {
    id,
    alertEnabled: true,
    highPrice: '',
    lowPrice: '',
    highVolume: '',
    lowVolume: '',
    year: '',
    month: '',
    day: '',
    selectedCompany: '',
  };
}

function normalizeTriggerRules(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [createDefaultTriggerRule()];
  }

  return value.map((rule, index) => ({
    ...createDefaultTriggerRule(
      rule?.id ?? `trigger-rule-restored-${index + 1}`,
    ),
    alertEnabled: rule?.alertEnabled !== false,
    highPrice: String(rule?.highPrice || ''),
    lowPrice: String(rule?.lowPrice || ''),
    highVolume: String(rule?.highVolume || ''),
    lowVolume: String(rule?.lowVolume || ''),
    year: String(rule?.year || ''),
    month: String(rule?.month || ''),
    day: String(rule?.day || ''),
    selectedCompany: String(rule?.selectedCompany || ''),
  }));
}

function normalizeCustomGroups(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((group, index) => ({
    id: String(group?.id || `custom-group-restored-${index + 1}`),
    name: String(group?.name || '').trim(),
    symbols: Array.from(
      new Set(
        (Array.isArray(group?.symbols) ? group.symbols : [])
          .map((symbol) => String(symbol).trim())
          .filter(Boolean),
      ),
    ),
  }));
}

function normalizeCompareGroups(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [createDefaultCompareGroup()];
  }

  return value.map((group, index) => {
    const slots = Array.isArray(group?.slots) ? group.slots : [];
    return {
      id: group?.id ?? `compare-group-restored-${index + 1}`,
      slots: [String(slots[0] || ''), String(slots[1] || '')],
    };
  });
}

function parseStoredState(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function AppSettingsProvider({
  children,
  investmentResult = null,
  investmentRunPending = false,
  investmentRunError = null,
  discussionRunPending = false,
  discussionRunError = null,
  startDiscussion = null,
  rerunInvestment = null,
  investmentProfile = null,
  initialAllowFractional = true,
}) {
  const [actionWindowEnabled, setActionWindowEnabled] = useState(true);
  const [allowFractional, setAllowFractional] = useState(Boolean(initialAllowFractional));
  const initialAllowFractionalRef = useRef(Boolean(initialAllowFractional));
  const [defaultStockGroup, setDefaultStockGroupState] = useState(null);
  const [customGroups, setCustomGroups] = useState([]);
  const [profileName, setProfileNameState] = useState('');
  const [profileImageUri, setProfileImageUriState] = useState(null);
  const [compareGroups, setCompareGroups] = useState(() => [createDefaultCompareGroup()]);
  const [triggerRules, setTriggerRules] = useState(() => [createDefaultTriggerRule()]);
  const [persistentStateReady, setPersistentStateReady] = useState(false);
  const customGroupSequence = useRef(0);
  const compareGroupSequence = useRef(0);
  const triggerRuleSequence = useRef(0);

  useEffect(() => {
    let active = true;

    Promise.all([
      AsyncStorage.getItem(PERSISTED_STATE_STORAGE_KEY),
      AsyncStorage.getItem(LEGACY_DEFAULT_STOCK_GROUP_STORAGE_KEY),
    ])
      .then(([rawState, legacyDefaultStockGroup]) => {
        if (!active) return;

        const storedState = parseStoredState(rawState);
        if (storedState) {
          if (typeof storedState.actionWindowEnabled === 'boolean') {
            setActionWindowEnabled(storedState.actionWindowEnabled);
          }
          if (typeof storedState.allowFractional === 'boolean') {
            setAllowFractional(storedState.allowFractional);
          }
          setDefaultStockGroupState(
            storedState.defaultStockGroup === undefined
              ? null
              : storedState.defaultStockGroup || null,
          );
          setCustomGroups(normalizeCustomGroups(storedState.customGroups));
          setProfileNameState(String(storedState.profileName || '').trim());
          setProfileImageUriState(storedState.profileImageUri || null);
          setCompareGroups(normalizeCompareGroups(storedState.compareGroups));
          setTriggerRules(normalizeTriggerRules(storedState.triggerRules));
        } else if (legacyDefaultStockGroup) {
          setDefaultStockGroupState(legacyDefaultStockGroup);
        }
      })
      .catch((error) => {
        console.warn('無法讀取 StockApp 儲存設定', error);
      })
      .finally(() => {
        if (active) {
          setPersistentStateReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!persistentStateReady) {
      return;
    }

    const stateToPersist = {
      version: 1,
      actionWindowEnabled,
      allowFractional,
      defaultStockGroup,
      customGroups,
      profileName,
      profileImageUri,
      compareGroups,
      triggerRules,
    };

    AsyncStorage.setItem(
      PERSISTED_STATE_STORAGE_KEY,
      JSON.stringify(stateToPersist),
    ).catch((error) => {
      console.warn('無法儲存 StockApp 設定', error);
    });

    // Keep the previous Web key in sync for compatibility with older builds.
    const legacyWrite = defaultStockGroup
      ? AsyncStorage.setItem(
          LEGACY_DEFAULT_STOCK_GROUP_STORAGE_KEY,
          String(defaultStockGroup),
        )
      : AsyncStorage.removeItem(LEGACY_DEFAULT_STOCK_GROUP_STORAGE_KEY);
    legacyWrite.catch((error) => {
      console.warn('無法儲存預設股票群組', error);
    });
  }, [
    actionWindowEnabled,
    allowFractional,
    compareGroups,
    customGroups,
    defaultStockGroup,
    persistentStateReady,
    profileImageUri,
    profileName,
    triggerRules,
  ]);

  const setDefaultStockGroup = useCallback((value) => {
    const nextValue = value === undefined || value === null || value === ''
      ? null
      : String(value);

    setDefaultStockGroupState(nextValue);
  }, []);

  const setProfileName = useCallback((value) => {
    setProfileNameState(String(value || '').trim());
  }, []);

  const setProfileImageUri = useCallback((value) => {
    setProfileImageUriState(value || null);
  }, []);

  useEffect(() => {
    const nextValue = Boolean(initialAllowFractional);
    if (initialAllowFractionalRef.current === nextValue) {
      return;
    }

    initialAllowFractionalRef.current = nextValue;
    setAllowFractional(nextValue);
  }, [initialAllowFractional]);

  const addCustomGroup = useCallback((symbols, name = '') => {
    const normalizedName = String(name || '').trim();
    if (
      normalizedName
      && customGroups.some(
        (group) => String(group?.name || '').trim() === normalizedName,
      )
    ) {
      return null;
    }

    customGroupSequence.current += 1;
    const id = `custom-group-${Date.now()}-${customGroupSequence.current}`;
    const group = {
      id,
      name: normalizedName,
      symbols: Array.from(new Set((symbols || []).map((symbol) => String(symbol)))),
    };

    setCustomGroups((current) => [...current, group]);
    return id;
  }, [customGroups]);

  const updateCustomGroup = useCallback((groupId, changes = {}) => {
    const nextChanges = changes && typeof changes === 'object' ? changes : {};

    setCustomGroups((current) => {
      const normalizedName = typeof nextChanges.name === 'string'
        ? nextChanges.name.trim()
        : null;
      const hasDuplicateName = Boolean(normalizedName)
        && current.some(
          (group) => group.id !== groupId
            && String(group?.name || '').trim() === normalizedName,
        );

      if (hasDuplicateName) {
        return current;
      }

      return current.map((group) => (
        group.id === groupId
          ? {
              ...group,
              ...nextChanges,
              ...(nextChanges.symbols
                ? { symbols: Array.from(new Set(nextChanges.symbols.map((symbol) => String(symbol)))) }
                : {}),
              ...(typeof nextChanges.name === 'string'
                ? { name: normalizedName }
                : {}),
            }
          : group
      ));
    });
  }, []);

  const renameCustomGroup = useCallback((groupId, name) => {
    updateCustomGroup(groupId, { name });
  }, [updateCustomGroup]);

  const addCompareGroup = useCallback(() => {
    compareGroupSequence.current += 1;
    const id = `compare-group-${Date.now()}-${compareGroupSequence.current}`;
    setCompareGroups((current) => [
      ...current,
      createDefaultCompareGroup(id),
    ]);
  }, []);

  const updateCompareGroupSlot = useCallback((groupId, slotIndex, value) => {
    setCompareGroups((current) => current.map((group) => (
      group.id === groupId
        ? {
            ...group,
            slots: group.slots.map((slot, currentSlotIndex) => (
              currentSlotIndex === slotIndex ? String(value || '') : slot
            )),
          }
        : group
    )));
  }, []);

  const removeCompareGroup = useCallback((groupId) => {
    setCompareGroups((current) => {
      const remaining = current.filter((group) => group.id !== groupId);
      return remaining.length
        ? remaining
        : [createDefaultCompareGroup(`compare-group-${Date.now()}`)];
    });
  }, []);

  const addTriggerRule = useCallback(() => {
    triggerRuleSequence.current += 1;
    const id = `trigger-rule-${Date.now()}-${triggerRuleSequence.current}`;
    setTriggerRules((current) => [
      ...current,
      createDefaultTriggerRule(id),
    ]);
  }, []);

  const updateTriggerRule = useCallback((ruleId, changes) => {
    setTriggerRules((current) => current.map((rule) => (
      rule.id === ruleId
        ? { ...rule, ...changes }
        : rule
    )));
  }, []);

  const removeTriggerRule = useCallback((ruleId) => {
    setTriggerRules((current) => {
      const remaining = current.filter((rule) => rule.id !== ruleId);
      return remaining.length
        ? remaining
        : [createDefaultTriggerRule()];
    });
  }, []);

  const value = useMemo(
    () => ({
      actionWindowEnabled,
      setActionWindowEnabled,
      allowFractional,
      setAllowFractional,
      defaultStockGroup,
      setDefaultStockGroup,
      profileName,
      setProfileName,
      profileImageUri,
      setProfileImageUri,
      persistentStateReady,
      investmentResult,
      investmentProfile,
      investmentRunPending,
      investmentRunError,
      discussionRunPending,
      discussionRunError,
      startDiscussion,
      rerunInvestment,
      customGroups,
      addCustomGroup,
      updateCustomGroup,
      renameCustomGroup,
      compareGroups,
      addCompareGroup,
      updateCompareGroupSlot,
      removeCompareGroup,
      triggerRules,
      addTriggerRule,
      updateTriggerRule,
      removeTriggerRule,
    }),
    [
      actionWindowEnabled,
      allowFractional,
      defaultStockGroup,
      setDefaultStockGroup,
      profileName,
      setProfileName,
      profileImageUri,
      setProfileImageUri,
      persistentStateReady,
      investmentResult,
      investmentProfile,
      investmentRunPending,
      investmentRunError,
      discussionRunPending,
      discussionRunError,
      startDiscussion,
      rerunInvestment,
      customGroups,
      addCustomGroup,
      updateCustomGroup,
      renameCustomGroup,
      compareGroups,
      addCompareGroup,
      updateCompareGroupSlot,
      removeCompareGroup,
      triggerRules,
      addTriggerRule,
      updateTriggerRule,
      removeTriggerRule,
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
