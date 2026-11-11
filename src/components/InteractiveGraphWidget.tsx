import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  Maximize2, 
  Download, 
  Sliders, 
  RotateCcw, 
  FunctionSquare, 
  Activity, 
  Sparkles,
  Zap,
  Check,
  BarChart3
} from 'lucide-react';
import { APP_STYLES } from './ui/AppStyles';

export interface FunctionPlotConfig {
  formula: string; // e.g., "x^2 - 4*x + 3" or "sin(x)" or "a*x^2 + b*x + c"
  title?: string;
  xDomain?: [number, number];
  a?: number;
  b?: number;
  c?: number;
  showDerivative?: boolean;
  showIntegralArea?: boolean;
}

export interface ChartDataSeries {
  type: 'line' | 'bar' | 'area' | 'pie';
  title: string;
  data: Array<Record<string, any>>;
  xKey: string;
  yKeys: string[];
  colors?: string[];
}

export interface GraphWidgetProps {
  type?: 'function' | 'chart';
  functionConfig?: FunctionPlotConfig;
  chartConfig?: ChartDataSeries;
  onExpandToCanvas?: () => void;
  isDarkMode?: boolean;
}

const DEFAULT_COLORS = ['#0084ff', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

/**
 * Safely evaluates mathematical functions f(x) for x values
 */
function evaluateMathFunction(exprStr: string, xVal: number, params: { a: number; b: number; c: number }): number | null {
  try {
    const { a, b, c } = params;
    let sanitized = (exprStr || '')
      .toLowerCase()
      .trim()
      // Remove f(x)= or y=
      .replace(/^(?:f\s*\(\s*x\s*\)|y)\s*=\s*/i, '')
      // Remove LaTeX backslashes e.g. \tan -> tan, \sin -> sin, \pi -> pi
      .replace(/\\(sin|cos|tan|cot|sec|csc|exp|ln|log|sqrt|pi)/gi, '$1')
      .replace(/\\cdot/gi, '*')
      .replace(/\s+/g, '')
      // Implicit multiplication
      .replace(/(\d)x/g, '$1*x')
      .replace(/(\d)a/g, '$1*a')
      .replace(/(\d)b/g, '$1*b')
      .replace(/(\d)c/g, '$1*c')
      .replace(/\)\(/g, ')*(')
      .replace(/(\d)\(/g, '$1*(')
      .replace(/\)(x|[a-c])/g, ')*$1')
      // Functions without parentheses e.g. tanx, sinx, cosx, secx, cscx, cotx
      .replace(/\btanx\b/g, 'tan(x)')
      .replace(/\bsinx\b/g, 'sin(x)')
      .replace(/\bcosx\b/g, 'cos(x)')
      .replace(/\bcotx\b/g, 'cot(x)')
      .replace(/\bsecx\b/g, 'sec(x)')
      .replace(/\bcscx\b/g, 'csc(x)')
      // Powers
      .replace(/x\^(\d+|\([^\)]+\))/g, 'Math.pow(x, $1)')
      .replace(/\^/g, '**')
      // JS Math functions
      .replace(/\bsin\(/g, 'Math.sin(')
      .replace(/\bcos\(/g, 'Math.cos(')
      .replace(/\btan\(/g, 'Math.tan(')
      .replace(/\bcot\(/g, '(1/Math.tan(')
      .replace(/\bsec\(/g, '(1/Math.cos(')
      .replace(/\bcsc\(/g, '(1/Math.sin(')
      .replace(/\bexp\(/g, 'Math.exp(')
      .replace(/e\^x/g, 'Math.exp(x)')
      .replace(/\blog\(/g, 'Math.log10(')
      .replace(/\bln\(/g, 'Math.log(')
      .replace(/\bsqrt\(/g, 'Math.sqrt(')
      .replace(/\babs\(/g, 'Math.abs(')
      .replace(/\bpi\b/g, 'Math.PI');

    // Replace parameter variables
    sanitized = sanitized
      .replace(/\ba\b/g, `(${a})`)
      .replace(/\bb\b/g, `(${b})`)
      .replace(/\bc\b/g, `(${c})`);

    // Use Function constructor with isolated scope
    const fn = new Function('x', `return ${sanitized};`);
    const val = fn(xVal);

    if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
      const isAsymptotic = /tan|sec|csc|cot/i.test(exprStr);
      if (isAsymptotic && Math.abs(val) > 20) {
        return null;
      }
      if (Math.abs(val) > 5000) return null;
      return val;
    }
    return null;
  } catch {
    return null;
  }
}

export const InteractiveGraphWidget: React.FC<GraphWidgetProps & Record<string, any>> = (props) => {
  const {
    type = 'function',
    functionConfig,
    chartConfig,
    onExpandToCanvas,
    isDarkMode = false
  } = props;

  // Seamlessly support either functionConfig object OR root props (formula, title, xDomain, etc.)
  const effectiveFunctionConfig: FunctionPlotConfig = functionConfig || {
    formula: props.formula || 'x^2 - 4',
    title: props.title,
    xDomain: props.xDomain,
    a: props.a,
    b: props.b,
    c: props.c,
    showDerivative: props.showDerivative,
    showIntegralArea: props.showIntegralArea
  };

  // Interactive sliders state for function parameters
  const [paramA, setParamA] = useState<number>(effectiveFunctionConfig?.a ?? 1);
  const [paramB, setParamB] = useState<number>(effectiveFunctionConfig?.b ?? 0);
  const [paramC, setParamC] = useState<number>(effectiveFunctionConfig?.c ?? 0);
  const [showDerivative, setShowDerivative] = useState<boolean>(effectiveFunctionConfig?.showDerivative ?? false);
  const [showIntegralArea, setShowIntegralArea] = useState<boolean>(effectiveFunctionConfig?.showIntegralArea ?? false);
  const [xMin, setXMin] = useState<number>(effectiveFunctionConfig?.xDomain?.[0] ?? -10);
  const [xMax, setXMax] = useState<number>(effectiveFunctionConfig?.xDomain?.[1] ?? 10);

  const formula = effectiveFunctionConfig?.formula || 'x^2 - 4';

  const isAsymptotic = useMemo(() => {
    return /tan|sec|csc|cot/i.test(formula);
  }, [formula]);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Generate dataset for function plot
  const plotData = useMemo(() => {
    if (type !== 'function') return [];
    
    const points: Array<{ x: number; y: number | null; dy?: number | null; yZero?: number }> = [];
    const step = (xMax - xMin) / 100;

    for (let x = xMin; x <= xMax + 0.0001; x += step) {
      const roundedX = Math.round(x * 100) / 100;
      const yVal = evaluateMathFunction(formula, roundedX, { a: paramA, b: paramB, c: paramC });

      let dyVal: number | null = null;
      if (showDerivative && yVal !== null) {
        const h = 0.001;
        const yPlus = evaluateMathFunction(formula, roundedX + h, { a: paramA, b: paramB, c: paramC });
        const yMinus = evaluateMathFunction(formula, roundedX - h, { a: paramA, b: paramB, c: paramC });
        if (yPlus !== null && yMinus !== null) {
          dyVal = Math.round(((yPlus - yMinus) / (2 * h)) * 100) / 100;
        }
      }

      points.push({
        x: roundedX,
        y: yVal !== null ? Math.round(yVal * 100) / 100 : null,
        dy: dyVal,
        yZero: 0
      });
    }
    return points;
  }, [type, formula, paramA, paramB, paramC, showDerivative, xMin, xMax]);

  // Derived properties of the function (zeros, min/max)
  const functionMetrics = useMemo(() => {
    if (plotData.length === 0) return null;
    let minY = Infinity;
    let maxY = -Infinity;
    let zeros: number[] = [];

    for (let i = 0; i < plotData.length; i++) {
      const { x, y } = plotData[i];
      if (y === null) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (i > 0 && plotData[i - 1].y !== null) {
        const prevY = plotData[i - 1].y!;
        // Don't register asymptotic jump as zero crossing
        if (!isAsymptotic && ((prevY <= 0 && y >= 0) || (prevY >= 0 && y <= 0))) {
          zeros.push(x);
        }
      }
    }

    return {
      minY: isFinite(minY) ? minY : 0,
      maxY: isFinite(maxY) ? maxY : 0,
      zerosCount: zeros.length,
      sampleZeros: zeros.slice(0, 3)
    };
  }, [plotData, isAsymptotic]);

  const resetParams = () => {
    setParamA(effectiveFunctionConfig?.a ?? 1);
    setParamB(effectiveFunctionConfig?.b ?? 0);
    setParamC(effectiveFunctionConfig?.c ?? 0);
    setXMin(effectiveFunctionConfig?.xDomain?.[0] ?? -10);
    setXMax(effectiveFunctionConfig?.xDomain?.[1] ?? 10);
  };

  const axisStroke = isDarkMode ? '#64748b' : '#94a3b8';
  const gridStroke = isDarkMode ? '#272932' : '#e2e8f0';

  return (
    <div className={`${APP_STYLES.widgets.container} rounded-[24px] shadow-xs flex flex-col my-3 transition-all`}>
      {/* Widget Header */}
      <div className="px-4 py-3 bg-[#f1f5f9] dark:bg-black border-b border-[#e2e8f0] dark:border-zinc-800/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#0084ff]/10 dark:bg-[#0084ff]/25 text-[#0084ff] dark:text-[#339dff] flex items-center justify-center shrink-0">
            {type === 'function' ? (
              <FunctionSquare className="w-4 h-4" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 truncate flex items-center gap-2">
              {type === 'function' 
                ? (effectiveFunctionConfig?.title || `Interactive Function Plot: f(x) = ${formula}`)
                : (chartConfig?.title || 'Data Visualization')
              }
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#0084ff]/10 dark:bg-[#0084ff]/20 text-[#0084ff] dark:text-[#339dff] shrink-0">
                Interactive Graph
              </span>
            </h4>
          </div>
        </div>

        {/* Header Tools */}
        <div className="flex items-center gap-1.5 shrink-0">
          {type === 'function' && (
            <button
              type="button"
              onClick={resetParams}
              className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-[#282a39] text-slate-500 dark:text-zinc-400 transition-colors cursor-pointer"
              title="Reset Parameters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {onExpandToCanvas && (
            <button
              type="button"
              onClick={onExpandToCanvas}
              className="px-3 py-1.5 rounded-full bg-[#0084ff] hover:bg-[#0073e6] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
              title="Expand into Gemini AI Canvas Workspace"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Canvas Mode</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Plot/Chart Body */}
      <div className="p-4 space-y-4">
        {type === 'function' ? (
          <div className="space-y-3">
            {/* Recharts Function Plot */}
            <div className="h-64 sm:h-72 w-full pt-2 min-h-[260px]">
              <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                <AreaChart data={plotData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorY" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0084ff" stopOpacity={showIntegralArea ? 0.35 : 0.08} />
                      <stop offset="95%" stopColor="#0084ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorDy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.6} />
                  <XAxis 
                    dataKey="x" 
                    stroke={axisStroke} 
                    fontSize={11} 
                    tickLine={false}
                    domain={[xMin, xMax]}
                  />
                  <YAxis 
                    stroke={axisStroke} 
                    fontSize={11} 
                    tickLine={false} 
                    domain={isAsymptotic ? [-12, 12] : ['auto', 'auto']}
                    allowDataOverflow={isAsymptotic}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#1e202e' : '#ffffff',
                      borderColor: isDarkMode ? '#272932' : '#cbd5e1',
                      borderRadius: '16px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                      fontSize: '12px',
                      color: isDarkMode ? '#f1f5f9' : '#0f172a'
                    }}
                    formatter={(val: any, name: any) => [
                      val, 
                      name === 'y' ? 'f(x)' : name === 'dy' ? "f'(x) Derivative" : name
                    ]}
                    labelFormatter={(label) => `x = ${label}`}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle"
                    formatter={(val) => (val === 'y' ? 'f(x)' : "f'(x) Derivative")}
                  />

                  {/* Main curve */}
                  <Area
                    type="monotone"
                    dataKey="y"
                    stroke="#0084ff"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorY)"
                    connectNulls={false}
                    activeDot={{ r: 6, stroke: '#0084ff', strokeWidth: 2, fill: '#ffffff' }}
                  />

                  {/* Derivative curve if enabled */}
                  {showDerivative && (
                    <Line
                      type="monotone"
                      dataKey="dy"
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Interactive Controls & Parameters Bar */}
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-black border border-slate-200 dark:border-zinc-800/60 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-zinc-200">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#0084ff]" />
                  Parameter Controls
                </span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={showDerivative}
                      onChange={(e) => setShowDerivative(e.target.checked)}
                      className="rounded text-[#0084ff] focus:ring-0 cursor-pointer"
                    />
                    <span>Show f'(x) Derivative</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={showIntegralArea}
                      onChange={(e) => setShowIntegralArea(e.target.checked)}
                      className="rounded text-[#0084ff] focus:ring-0 cursor-pointer"
                    />
                    <span>Integral Area</span>
                  </label>
                </div>
              </div>

              {/* Sliders Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                    <span>Parameter a:</span>
                    <span className="font-bold text-[#0084ff]">{paramA}</span>
                  </div>
                  <input
                    type="range"
                    min="-5"
                    max="5"
                    step="0.5"
                    value={paramA}
                    onChange={(e) => setParamA(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-300 dark:bg-[#222634] rounded-lg appearance-none cursor-pointer accent-[#0084ff]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                    <span>Parameter b:</span>
                    <span className="font-bold text-[#0084ff]">{paramB}</span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="1"
                    value={paramB}
                    onChange={(e) => setParamB(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-300 dark:bg-[#222634] rounded-lg appearance-none cursor-pointer accent-[#0084ff]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                    <span>Parameter c:</span>
                    <span className="font-bold text-[#0084ff]">{paramC}</span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="1"
                    value={paramC}
                    onChange={(e) => setParamC(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-300 dark:bg-[#222634] rounded-lg appearance-none cursor-pointer accent-[#0084ff]"
                  />
                </div>
              </div>

              {/* Quick Function Metrics */}
              {functionMetrics && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200 dark:border-zinc-800/60 text-[10px] text-slate-600 dark:text-zinc-400">
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-[#222634] font-mono">
                    Min Y: {functionMetrics.minY}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-[#222634] font-mono">
                    Max Y: {functionMetrics.maxY}
                  </span>
                  {functionMetrics.sampleZeros.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-mono font-bold">
                      Roots at x ≈ [{functionMetrics.sampleZeros.join(', ')}]
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* General Chart Mode */
          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartConfig?.type === 'bar' ? (
                <BarChart data={chartConfig.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.6} />
                  <XAxis dataKey={chartConfig.xKey} stroke={axisStroke} fontSize={11} tickLine={false} />
                  <YAxis 
                    stroke={axisStroke} 
                    fontSize={11} 
                    tickLine={false} 
                    domain={isAsymptotic ? [-12, 12] : ['auto', 'auto']}
                    allowDataOverflow={isAsymptotic}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#1e202e' : '#ffffff',
                      borderColor: isDarkMode ? '#272932' : '#cbd5e1',
                      borderRadius: '16px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  {chartConfig.yKeys.map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      fill={chartConfig.colors?.[i] || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                      radius={[6, 6, 0, 0]}
                    />
                  ))}
                </BarChart>
              ) : chartConfig?.type === 'pie' ? (
                <PieChart>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#1e202e' : '#ffffff',
                      borderColor: isDarkMode ? '#272932' : '#cbd5e1',
                      borderRadius: '16px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                  <Pie
                    data={chartConfig.data}
                    dataKey={chartConfig.yKeys[0] || 'value'}
                    nameKey={chartConfig.xKey || 'name'}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {chartConfig.data.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartConfig.colors?.[index] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              ) : (
                /* Default Line Chart */
                <LineChart data={chartConfig?.data || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.6} />
                  <XAxis dataKey={chartConfig?.xKey || 'name'} stroke={axisStroke} fontSize={11} tickLine={false} />
                  <YAxis 
                    stroke={axisStroke} 
                    fontSize={11} 
                    tickLine={false} 
                    domain={isAsymptotic ? [-12, 12] : ['auto', 'auto']}
                    allowDataOverflow={isAsymptotic}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#1e202e' : '#ffffff',
                      borderColor: isDarkMode ? '#272932' : '#cbd5e1',
                      borderRadius: '16px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  {(chartConfig?.yKeys || ['value']).map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={chartConfig?.colors?.[i] || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
