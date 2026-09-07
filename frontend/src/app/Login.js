import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

const LOGIN_BACKGROUND = '#282828';
const FIELD_BACKGROUND = '#6E747C';
const FIELD_TEXT = '#5D6266';
const ENTER_BACKGROUND = '#546372';
const ENTER_TEXT = 'rgba(217, 217, 217, 0.5)';
const MENU_BACKGROUND = '#AFB7BF';
const MENU_DIVIDER = '#5E6E7F';

const ALLOCATION_OPTIONS = [
  { label: '小股民', value: 'small' },
  { label: '中間戶', value: 'normal' },
  { label: '大戶', value: 'large' },
];
const RISK_OPTIONS = [
  { label: '積極派', value: 'aggressive' },
  { label: '中立派', value: 'neutral' },
  { label: '保守派', value: 'conservative' },
];
const STOCK_COUNT_OPTIONS = [
  ['1', '2', '3', '4', '5'],
  ['6', '7', '8', '9', '10'],
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
  const columns = Math.ceil((screenWidth - columnOffset) / columnGap) + 1;
  const rows = Math.ceil((screenHeight - rowOffset) / rowGap) + 1;

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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [budget, setBudget] = useState('');
  const [allocationPreference, setAllocationPreference] = useState('');
  const [riskPreference, setRiskPreference] = useState('');
  const [topN, setTopN] = useState('');
  const [openMenu, setOpenMenu] = useState(null);

  // The reference layout is based on a 600 × 1290 canvas. Scale the entire
  // form down on shorter screens so the Enter button remains reachable.
  const scale = Math.min(
    1,
    screenWidth / 600,
    (screenHeight - 32) / 811,
  );
  const formWidth = 301 * scale;
  const fieldHeight = 72 * scale;
  const fieldStep = 124 * scale;
  const topNFieldTop = fieldStep * 2;
  const topNFirstRowTop = topNFieldTop + fieldHeight + 15 * scale;
  const topNSecondRowTop = topNFirstRowTop + 52 * scale;
  const budgetTop = 481 * scale;
  const budgetFirstRowTop = budgetTop + fieldHeight + 17 * scale;
  const budgetSecondRowTop = budgetFirstRowTop + 52 * scale;
  const enterTop = 759 * scale;
  const formHeight = 811 * scale;
  const verticalSpace = screenHeight - formHeight;
  const verticalBias = Math.min(
    25 * scale,
    Math.max(0, verticalSpace / 2 - 12 * scale),
  );
  const formTop = Math.max(
    12 * scale,
    verticalSpace / 2 + verticalBias,
  );
  const allocationLabel = getOptionLabel(
    ALLOCATION_OPTIONS,
    allocationPreference,
    '資金分配偏好',
  );
  const riskLabel = getOptionLabel(RISK_OPTIONS, riskPreference, '風險偏好');

  const selectAllocationPreference = (value) => {
    setAllocationPreference(value);
    setOpenMenu(null);
  };

  const selectRiskPreference = (value) => {
    setRiskPreference(value);
    setOpenMenu(null);
  };

  const submit = () => {
    onEnter?.({
      // Keep the old camelCase fields and expose the backend-compatible names
      // for the new stock-count and allocation controls.
      fractionalShare: true,
      allowFractional: true,
      budget: budget.replace(/,/g, ''),
      riskPreference: riskLabel === '風險偏好' ? '' : riskLabel,
      risk_preference: riskPreference || 'neutral',
      investorType: allocationLabel === '資金分配偏好' ? '' : allocationLabel,
      investor_type: allocationPreference || 'normal',
      topN: Number(topN || 5),
      top_n: Number(topN || 5),
      preferred_stock_class: 'auto',
    });
  };

  return (
    <View style={styles.container}>
      <GridBackdrop screenWidth={screenWidth} screenHeight={screenHeight} />
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
        <LoginField top={0} scale={scale} zIndex={openMenu === 'allocation' ? 6 : 4}>
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

        <LoginField top={fieldStep} scale={scale} zIndex={openMenu === 'risk' ? 6 : 3}>
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
          <Text
            pointerEvents="none"
            style={[
              styles.fieldLabel,
              {
                left: 25 * scale,
                top: '50%',
                transform: [{ translateY: -14.5 * scale }],
                fontSize: 22 * scale,
                lineHeight: 29 * scale,
              },
            ]}
          >
            股票最多持有數
          </Text>
        </LoginField>

        {STOCK_COUNT_OPTIONS.map((row, rowIndex) => (
          <View
            key={`stock-count-row-${rowIndex}`}
            style={[
              styles.chipRow,
              {
                top: rowIndex === 0 ? topNFirstRowTop : topNSecondRowTop,
                width: 275 * scale,
                left: 9.5 * scale,
              },
            ]}
          >
            {row.map((value) => (
              <ChoiceChip
                key={value}
                label={value === '5' ? '預設5' : value}
                selected={topN === value}
                scale={scale}
                width={value === '5' ? 67 : 42}
                onPress={() => setTopN(value)}
              />
            ))}
          </View>
        ))}

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
          style={({ pressed }) => [
            styles.enterButton,
            {
              left: 0,
              right: -14 * scale,
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
            Enter
          </Text>
        </Pressable>

        {openMenu === 'allocation' ? (
          <DropdownMenu
            options={ALLOCATION_OPTIONS}
            scale={scale}
            top={fieldHeight}
            onSelect={selectAllocationPreference}
          />
        ) : null}
        {openMenu === 'risk' ? (
          <DropdownMenu
            options={RISK_OPTIONS}
            scale={scale}
            top={fieldStep + fieldHeight}
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
  input: {
    width: '100%',
    height: '100%',
    color: FIELD_TEXT,
    fontFamily: 'Goldman',
    fontWeight: '400',
    outlineStyle: 'none',
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
    marginTop: -12.5,
    backgroundColor: '#E0E0E0',
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
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
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
