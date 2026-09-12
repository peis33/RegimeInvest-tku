import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AssetSvg from '../components/AssetSvg';
import { useAppSettings } from '../context/AppSettingsContext';
import useViewportDimensions from '../hooks/useViewportDimensions';

const LOGIN_BACKGROUND = '#282828';
const FIELD_BACKGROUND = '#7B828B';
const FIELD_TEXT = 'rgba(46, 46, 46, 0.6)';
const FIELD_SELECTED_TEXT = '#FFFFFF';
const NUMBER_OPTION_TEXT = '#979797';
const ENTER_BACKGROUND = '#88A2BD';
const ENTER_TEXT = '#E8EDF3';
const MENU_BACKGROUND = '#AFB7BF';
const MENU_DIVIDER = '#5E6E7F';
const NOTICE_IMAGE = require('../assets/image/notice.svg');

export const IDENTITY_OPTIONS = [
  { label: '小股民', value: 'small' },
  { label: '中間戶', value: 'normal' },
  { label: '大戶', value: 'large' },
];
export const ALLOCATION_OPTIONS = [
  { label: '平均分散', value: 'balanced', zipfS: 0.9 },
  { label: '略為集中', value: 'moderate', zipfS: 1.2 },
  { label: '高度集中', value: 'concentrated', zipfS: 1.8 },
];
export const RISK_OPTIONS = [
  { label: '積極派', value: 'aggressive' },
  { label: '中立派', value: 'neutral' },
  { label: '保守派', value: 'conservative' },
];
const BUDGET_OPTIONS = [
  [
    { label: '10,000', value: '10000', width: 78 },
    { label: '預設 50,000', value: '50000', width: 112 },
    { label: '100,000', value: '100000', width: 85 },
  ],
  [
    { label: '300,000', value: '300000', width: 96 },
    { label: '500,000', value: '500000', width: 96 },
  ],
];

function getFieldShadow(scale) {
  return [
    `inset ${-4 * scale}px ${-4 * scale}px ${4 * scale}px rgba(255, 255, 255, 0.25)`,
    `inset ${6 * scale}px ${6 * scale}px ${4 * scale}px rgba(0, 0, 0, 0.25)`,
  ].join(', ');
}

function getEnterShadow(scale) {
  return [
    `inset ${6 * scale}px ${6 * scale}px ${4 * scale}px rgba(255, 255, 255, 0.25)`,
    `${6 * scale}px ${6 * scale}px ${4 * scale}px rgba(0, 0, 0, 0.25)`,
  ].join(', ');
}

function GridBackdrop({ screenWidth, screenHeight }) {
  const columnGap = Math.min(64, Math.max(45, screenWidth * 0.103));
  const rowGap = Math.min(57, Math.max(42, screenWidth * 0.093));
  const columnOffset = columnGap * 0.6;
  const rowOffset = rowGap * 0.64;
  const lineWidth = Math.max(1, Math.min(2.5, screenWidth / 300));
  const columns = Math.max(
    1,
    Math.floor((screenWidth - columnOffset - lineWidth) / columnGap) + 1,
  );
  const rows = Math.max(
    1,
    Math.floor((screenHeight - rowOffset - lineWidth) / rowGap) + 1,
  );

  return (
    <View pointerEvents="none" style={styles.gridBackdrop}>
      {Array.from({ length: columns }).map((_, index) => (
        <View
          key={`login-column-${index}`}
          style={[
            styles.gridLineVertical,
            { left: columnOffset + index * columnGap, width: lineWidth },
          ]}
        />
      ))}
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={`login-row-${index}`}
          style={[
            styles.gridLineHorizontal,
            { top: rowOffset + index * rowGap, height: lineWidth },
          ]}
        />
      ))}
    </View>
  );
}

function Chevron({ scale }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.chevron,
        {
          width: 16 * scale,
          height: 16 * scale,
          right: 23 * scale,
          borderBottomWidth: 2 * scale,
          borderRightWidth: 2 * scale,
        },
      ]}
    />
  );
}

function Toggle({ value, onPress, scale }) {
  const width = 72 * scale;
  const height = 37 * scale;
  const thumbSize = 25 * scale;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="允許零股"
      accessibilityState={{ checked: value }}
      onPress={onPress}
      style={[
        styles.toggle,
        {
          right: 18 * scale,
          width,
          height,
          borderRadius: height / 2,
        },
        value ? styles.toggleOn : styles.toggleOff,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.toggleThumb,
          {
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            marginTop: -thumbSize / 2,
          },
          value
            ? { marginLeft: 4 * scale }
            : { alignSelf: 'flex-end', marginRight: 4 * scale },
        ]}
      />
    </Pressable>
  );
}

function LoginField({ children, scale, top, zIndex = 1 }) {
  return (
    <View
      style={[
        styles.field,
        {
          top,
          height: 69 * scale,
          borderRadius: 34.5 * scale,
          zIndex,
          boxShadow: getFieldShadow(scale),
        },
      ]}
    >
      {children}
    </View>
  );
}

function DropdownMenu({ options, scale, top, onSelect }) {
  return (
    <View
      style={[
        styles.dropdown,
        {
          top,
          width: 230 * scale,
          left: 36 * scale,
          borderRadius: 14 * scale,
        },
      ]}
    >
      {options.map((option, index) => (
        <Pressable
          key={option.value}
          accessibilityRole="menuitem"
          accessibilityLabel={option.label}
          onPress={() => onSelect(option.value)}
          style={({ pressed }) => [
            styles.dropdownOption,
            {
              height: 64 * scale,
              borderBottomWidth: index === options.length - 1 ? 0 : 3 * scale,
              borderBottomColor: MENU_DIVIDER,
            },
            pressed && styles.dropdownOptionPressed,
          ]}
        >
          <Text
            style={[
              styles.dropdownOptionText,
              {
                fontSize: 22 * scale,
                lineHeight: 28 * scale,
              },
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ChoiceChip({ label, selected, scale, width, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceChip,
        {
          width: width * scale,
          height: 42 * scale,
          borderRadius: 21 * scale,
        },
        selected && styles.choiceChipSelected,
        pressed && styles.choiceChipPressed,
      ]}
    >
      <Text
        pointerEvents="none"
        style={[
          styles.choiceChipText,
          selected && styles.choiceChipTextSelected,
          {
            fontSize: label.length > 2 ? 14 * scale : 16 * scale,
            lineHeight: 20 * scale,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function getOptionLabel(options, value, fallback) {
  return options.find((option) => option.value === value)?.label || fallback;
}

export default function Login({ onEnter }) {
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const { allowFractional, setAllowFractional } = useAppSettings();
  const [budget, setBudget] = useState('');
  const [identity, setIdentity] = useState('');
  const [allocationPreference, setAllocationPreference] = useState('');
  const [riskPreference, setRiskPreference] = useState('');
  const [topN, setTopN] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The reference layout is based on the 430 × 907 login canvas. Keep the
  // same proportions on a phone and scale it down when the available height
  // is shorter.
  const scale = Math.min(
    1,
    screenWidth / 600,
    (screenHeight - 20) / 1080,
  );
  const formWidth = 290 * scale;
  const fieldHeight = 69 * scale;
  const fieldStep = 110 * scale;
  const fractionalFieldTop = 225 * scale;
  const identityFieldTop = 335 * scale;
  const allocationFieldTop = identityFieldTop + fieldStep;
  const riskFieldTop = allocationFieldTop + fieldStep;
  const topNFieldTop = riskFieldTop + fieldStep;
  const topNDefaultTop = topNFieldTop + fieldHeight - 42 * scale;
  const budgetTop = 775 * scale;
  const budgetFirstRowTop = budgetTop + fieldHeight + 28 * scale;
  const budgetSecondRowTop = budgetFirstRowTop + 54 * scale;
  const enterTop = 1060 * scale;
  const formHeight = 1140 * scale;
  const formTop = 0;
  const identityLabel = getOptionLabel(IDENTITY_OPTIONS, identity, '身分選擇');
  const allocationLabel = getOptionLabel(
    ALLOCATION_OPTIONS,
    allocationPreference,
    '資金分配偏好',
  );
  const riskLabel = getOptionLabel(RISK_OPTIONS, riskPreference, '風險偏好');

  const selectIdentity = (value) => {
    setIdentity(value);
    setOpenMenu(null);
  };

  const selectAllocationPreference = (value) => {
    setAllocationPreference(value);
    setOpenMenu(null);
  };

  const selectRiskPreference = (value) => {
    setRiskPreference(value);
    setOpenMenu(null);
  };

  const submit = async () => {
    if (isSubmitting) return;

    const selectedAllocation = ALLOCATION_OPTIONS.find(
      (option) => option.value === allocationPreference,
    );
    const budgetValue = budget.replace(/,/g, '');
    const identityValue = identity || 'normal';
    const riskValue = riskPreference || 'neutral';

    setIsSubmitting(true);
    try {
      await onEnter?.({
        identity: identityValue,
        identityLabel: getOptionLabel(IDENTITY_OPTIONS, identity, '中間戶'),
        allocationPreference: allocationPreference || 'moderate',
        allocation_preference: allocationPreference || 'moderate',
        allocationPreferenceLabel: allocationLabel,
        riskPreference: riskLabel === '風險偏好' ? '中立派' : riskLabel,
        risk_preference: riskValue,
        investorType: getOptionLabel(IDENTITY_OPTIONS, identity, '中間戶'),
        investor_type: identityValue,
        fractionalShare: allowFractional,
        allowFractional,
        // Backend InvestmentProfile uses snake_case. Keep the UI state
        // camelCase fields for compatibility, but send the canonical API key
        // so the default-enabled toggle is actually applied by Model 2.
        allow_fractional: allowFractional,
        budget: budgetValue || '50000',
        topN: Number(topN || 5),
        top_n: Number(topN || 5),
        preferred_stock_class: 'auto',
        zipf_s: selectedAllocation?.zipfS || 1.2,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { width: screenWidth }]}>
      <GridBackdrop screenWidth={screenWidth} screenHeight={screenHeight} />
      {!allowFractional ? (
        <View
          style={[
            styles.fractionalWarning,
            {
              top: 88 * scale,
              width: Math.min(516 * scale, screenWidth - 40 * scale),
              height: 88 * scale,
              left: Math.max(20 * scale, (screenWidth - 516 * scale) / 2),
              borderRadius: 12 * scale,
              paddingHorizontal: 16 * scale,
            },
          ]}
        >
          <AssetSvg
            asset={NOTICE_IMAGE}
            width={46 * scale}
            height={46 * scale}
          />
          <View
            style={[
              styles.fractionalWarningText,
              { marginLeft: 17 * scale },
            ]}
          >
            <Text
              style={[
                styles.fractionalWarningTitle,
                { fontSize: 20 * scale, lineHeight: 25 * scale },
              ]}
            >
              關閉零股
            </Text>
            <Text
              numberOfLines={2}
              style={[
                styles.fractionalWarningMessage,
                { fontSize: 15 * scale, lineHeight: 20 * scale },
              ]}
            >
              預算不足整張的股票將從組合中移除，資金自動轉入現金
            </Text>
          </View>
        </View>
      ) : null}
      <View
        style={[
          styles.form,
          {
            width: formWidth,
            height: formHeight,
            left: Math.max(0, (screenWidth - formWidth) / 2 - 5 * scale),
            top: formTop,
          },
        ]}
      >
        <LoginField
          top={fractionalFieldTop}
          scale={scale}
          zIndex={5}
        >
          <Text
            pointerEvents="none"
            style={[
              styles.fieldLabel,
              {
                left: 25 * scale,
                right: 100 * scale,
                top: '50%',
                transform: [{ translateY: -14.5 * scale }],
                fontSize: 22 * scale,
                lineHeight: 29 * scale,
              },
            ]}
          >
            允許零股
          </Text>
          <Toggle
            value={allowFractional}
            onPress={() => setAllowFractional((value) => !value)}
            scale={scale}
          />
        </LoginField>

        <LoginField
          top={identityFieldTop}
          scale={scale}
          zIndex={openMenu === 'identity' ? 8 : 4}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={identityLabel}
            onPress={() => setOpenMenu((value) => (value === 'identity' ? null : 'identity'))}
            style={styles.dropdownFieldButton}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.fieldLabel,
                identity && styles.fieldLabelSelected,
                {
                  left: 25 * scale,
                  right: 50 * scale,
                  top: '50%',
                  transform: [{ translateY: -14.5 * scale }],
                  fontSize: 22 * scale,
                  lineHeight: 29 * scale,
                },
              ]}
            >
              {identityLabel}
            </Text>
            <Chevron scale={scale} />
          </Pressable>
        </LoginField>

        <LoginField
          top={allocationFieldTop}
          scale={scale}
          zIndex={openMenu === 'allocation' ? 7 : 4}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={allocationLabel}
            onPress={() => setOpenMenu((value) => (value === 'allocation' ? null : 'allocation'))}
            style={styles.dropdownFieldButton}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.fieldLabel,
                allocationPreference && styles.fieldLabelSelected,
                {
                  left: 25 * scale,
                  right: 50 * scale,
                  top: '50%',
                  transform: [{ translateY: -14.5 * scale }],
                  fontSize: 22 * scale,
                  lineHeight: 29 * scale,
                },
              ]}
            >
              {allocationLabel}
            </Text>
            <Chevron scale={scale} />
          </Pressable>
        </LoginField>

        <LoginField
          top={riskFieldTop}
          scale={scale}
          zIndex={openMenu === 'risk' ? 7 : 3}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={riskLabel}
            onPress={() => setOpenMenu((value) => (value === 'risk' ? null : 'risk'))}
            style={styles.dropdownFieldButton}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.fieldLabel,
                riskPreference && styles.fieldLabelSelected,
                {
                  left: 25 * scale,
                  right: 50 * scale,
                  top: '50%',
                  transform: [{ translateY: -14.5 * scale }],
                  fontSize: 22 * scale,
                  lineHeight: 29 * scale,
                },
              ]}
            >
              {riskLabel}
            </Text>
            <Chevron scale={scale} />
          </Pressable>
        </LoginField>

        <LoginField top={topNFieldTop} scale={scale} zIndex={2}>
          <TextInput
            accessibilityLabel="輸入股票最多持有數"
            value={topN}
            onChangeText={(value) => {
              const digits = value.replace(/[^0-9]/g, '');
              if (!digits) {
                setTopN('');
                return;
              }
              setTopN(String(Math.min(20, Math.max(1, Number(digits)))));
            }}
            placeholder="股票最多持有數"
            placeholderTextColor={FIELD_TEXT}
            keyboardType="numeric"
            maxLength={2}
            style={[
              styles.topNInput,
              topN && styles.inputFilled,
              {
                left: 25 * scale,
                right: 60 * scale,
                top: 0,
                height: 69 * scale,
                padding: 0,
                fontSize: 22 * scale,
                lineHeight: 29 * scale,
              },
            ]}
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.stepper,
              {
                right: 15 * scale,
                width: 30 * scale,
                height: fieldHeight,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="增加最多持有股票數"
              onPress={() => {
                const current = Number(topN || 5);
                setTopN(String(Math.min(20, current + 1)));
              }}
              style={styles.stepperButton}
            >
              <View
                style={[
                  styles.stepperTriangleUp,
                  {
                    borderLeftWidth: 10 * scale,
                    borderRightWidth: 10 * scale,
                    borderBottomWidth: 12 * scale,
                  },
                ]}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="減少最多持有股票數"
              onPress={() => {
                const current = Number(topN || 5);
                setTopN(String(Math.max(1, current - 1)));
              }}
              style={styles.stepperButton}
            >
              <View
                style={[
                  styles.stepperTriangleDown,
                  {
                    borderLeftWidth: 10 * scale,
                    borderRightWidth: 10 * scale,
                    borderTopWidth: 12 * scale,
                  },
                ]}
              />
            </Pressable>
          </View>
        </LoginField>

        <View
          style={[
            styles.defaultStockCountChip,
            {
              top: topNDefaultTop,
              left: 304 * scale,
            },
          ]}
        >
          <ChoiceChip
            label="預設5"
            selected={topN === '5'}
            scale={scale}
            width={67}
            onPress={() => setTopN('5')}
          />
        </View>

        <LoginField top={budgetTop} scale={scale} zIndex={1}>
          <TextInput
            accessibilityLabel="輸入預算"
            value={budget}
            onChangeText={(value) => setBudget(value.replace(/[^0-9,]/g, ''))}
            onSubmitEditing={submit}
            placeholder="投入預算"
            placeholderTextColor={FIELD_TEXT}
            keyboardType="numeric"
            returnKeyType="done"
            style={[
              styles.input,
              budget && styles.inputFilled,
              {
                paddingHorizontal: 25 * scale,
                fontSize: 22 * scale,
                lineHeight: 29 * scale,
              },
            ]}
          />
        </LoginField>

        {BUDGET_OPTIONS.map((row, rowIndex) => (
          <View
            key={`budget-row-${rowIndex}`}
            style={[
              styles.chipRow,
              styles.budgetChipRow,
              {
                top: rowIndex === 0 ? budgetFirstRowTop : budgetSecondRowTop,
                width: rowIndex === 0 ? 295 * scale : 202 * scale,
                left: rowIndex === 0 ? -0.5 * scale : 46 * scale,
              },
            ]}
          >
            {row.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                selected={budget.replace(/,/g, '') === option.value}
                scale={scale}
                width={option.width}
                onPress={() => setBudget(option.value)}
              />
            ))}
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter"
          onPress={submit}
          disabled={isSubmitting}
          style={({ pressed }) => [
            styles.enterButton,
            {
              left: -7 * scale,
              right: -6 * scale,
              top: enterTop,
              height: fieldHeight,
              borderRadius: fieldHeight / 2,
              boxShadow: getEnterShadow(scale),
            },
            pressed && styles.enterPressed,
          ]}
        >
          <Text
            pointerEvents="none"
            style={[
              styles.enterText,
              {
                fontSize: 21 * scale,
                lineHeight: 28 * scale,
              },
            ]}
          >
            {isSubmitting ? '分析中…' : 'Enter'}
          </Text>
        </Pressable>

        {openMenu === 'identity' ? (
          <DropdownMenu
            options={IDENTITY_OPTIONS}
            scale={scale}
            top={identityFieldTop + fieldHeight}
            onSelect={selectIdentity}
          />
        ) : null}
        {openMenu === 'allocation' ? (
          <DropdownMenu
            options={ALLOCATION_OPTIONS}
            scale={scale}
            top={allocationFieldTop + fieldHeight}
            onSelect={selectAllocationPreference}
          />
        ) : null}
        {openMenu === 'risk' ? (
          <DropdownMenu
            options={RISK_OPTIONS}
            scale={scale}
            top={riskFieldTop + fieldHeight}
            onSelect={selectRiskPreference}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    backgroundColor: LOGIN_BACKGROUND,
    overflow: 'hidden',
  },
  gridBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: LOGIN_BACKGROUND,
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(217, 217, 217, 0.18)',
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(217, 217, 217, 0.18)',
  },
  form: {
    position: 'absolute',
    alignSelf: 'center',
  },
  field: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FIELD_BACKGROUND,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    elevation: 4,
  },
  fieldLabel: {
    position: 'absolute',
    color: FIELD_TEXT,
    fontFamily: 'Goldman',
    fontWeight: '400',
  },
  fieldLabelSelected: {
    color: FIELD_SELECTED_TEXT,
  },
  input: {
    width: '100%',
    height: '100%',
    color: FIELD_TEXT,
    fontFamily: 'Goldman',
    fontWeight: '400',
    outlineStyle: 'none',
  },
  topNInput: {
    position: 'absolute',
    color: FIELD_TEXT,
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'left',
    outlineStyle: 'none',
  },
  inputFilled: {
    color: FIELD_SELECTED_TEXT,
  },
  toggle: {
    position: 'absolute',
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: '#20B735',
  },
  toggleOff: {
    backgroundColor: 'rgba(46, 47, 46, 0.24)',
  },
  toggleThumb: {
    position: 'absolute',
    top: '50%',
    backgroundColor: '#E0E0E0',
  },
  stepper: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButton: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperTriangleUp: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#20262D',
    borderStyle: 'solid',
  },
  stepperTriangleDown: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#20262D',
    borderStyle: 'solid',
  },
  defaultStockCountChip: {
    position: 'absolute',
  },
  fractionalWarning: {
    position: 'absolute',
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#607285',
    borderWidth: 1,
    borderColor: '#D9D9D9',
    elevation: 5,
    boxShadow: '4px 4px 4px rgba(0, 0, 0, 0.22)',
  },
  fractionalWarningText: {
    flex: 1,
    justifyContent: 'center',
  },
  fractionalWarningTitle: {
    color: '#F2F2F2',
    fontFamily: 'Goldman',
    fontWeight: '400',
  },
  fractionalWarningMessage: {
    color: '#E0E5EA',
    fontFamily: 'Goldman',
    fontWeight: '400',
  },
  dropdownFieldButton: {
    width: '100%',
    height: '100%',
  },
  chipRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budgetChipRow: {
    justifyContent: 'space-between',
  },
  choiceChip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(217, 217, 217, 0.78)',
    backgroundColor: 'rgba(46, 47, 46, 0.2)',
  },
  choiceChipSelected: {
    backgroundColor: 'rgba(101, 122, 143, 0.92)',
    borderColor: '#FFFFFF',
  },
  choiceChipPressed: {
    opacity: 0.78,
  },
  choiceChipText: {
    color: NUMBER_OPTION_TEXT,
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  choiceChipTextSelected: {
    color: FIELD_SELECTED_TEXT,
  },
  chevron: {
    position: 'absolute',
    top: '50%',
    marginTop: -10,
    borderColor: 'rgba(255, 255, 255, 0.78)',
    transform: [{ rotate: '45deg' }],
  },
  dropdown: {
    position: 'absolute',
    zIndex: 20,
    overflow: 'hidden',
    backgroundColor: MENU_BACKGROUND,
  },
  dropdownOption: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownOptionText: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  dropdownOptionPressed: {
    backgroundColor: 'rgba(94, 110, 127, 0.22)',
  },
  enterButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ENTER_BACKGROUND,
    borderWidth: 1,
    borderColor: 'rgba(217, 217, 217, 0.3)',
    elevation: 5,
  },
  enterText: {
    color: ENTER_TEXT,
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  enterPressed: {
    opacity: 0.78,
  },
});
