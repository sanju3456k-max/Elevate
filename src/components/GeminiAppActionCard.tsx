import React from 'react';
import { 
  Play, 
  Sparkles, 
  BarChart2, 
  Scan, 
  FileText, 
  ArrowRight, 
  Layers, 
  Download, 
  Target, 
  Settings,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { ParsedAppAction, MathTest, ActiveTab } from '../types';
import { APP_STYLES } from './ui/AppStyles';

interface GeminiAppActionCardProps {
  actionData: ParsedAppAction;
  existingTests?: MathTest[];
  onNavigateTab?: (tab: ActiveTab) => void;
  onStartTest?: (test: MathTest, mode: 'timed' | 'practice') => void;
  onEditTest?: (test: MathTest, options?: { openAiPrompt?: boolean }) => void;
  onExportData?: () => void;
  isDarkMode?: boolean;
}

export const GeminiAppActionCard: React.FC<GeminiAppActionCardProps> = ({
  actionData,
  existingTests = [],
  onNavigateTab,
  onStartTest,
  onEditTest,
  onExportData,
  isDarkMode
}) => {
  const { type, title, description, targetTab, payload } = actionData;

  // Resolve matching test if a testId or testTitle is provided
  const matchingTest = payload?.testId 
    ? existingTests.find((t) => t.id === payload.testId)
    : payload?.testTitle 
      ? existingTests.find((t) => t.title?.trim().toLowerCase() === payload.testTitle?.trim().toLowerCase())
      : undefined;

  const handleExecuteAction = () => {
    switch (type) {
      case 'LAUNCH_TEST':
        if (matchingTest && onStartTest) {
          onStartTest(matchingTest, payload?.mode || 'timed');
        } else if (targetTab && onNavigateTab) {
          onNavigateTab(targetTab);
        } else if (onNavigateTab) {
          onNavigateTab('tests');
        }
        break;

      case 'OPEN_CUSTOM_BUILDER':
        if (onNavigateTab) {
          onNavigateTab('custom-builder');
        }
        break;

      case 'OPEN_STUDIO':
        if (targetTab === 'custom-builder' && onNavigateTab) {
          onNavigateTab('custom-builder');
        } else if (matchingTest && onEditTest) {
          onEditTest(matchingTest, { openAiPrompt: true });
        } else if (targetTab && onNavigateTab) {
          onNavigateTab(targetTab);
        } else if (onNavigateTab) {
          onNavigateTab('create');
        }
        break;

      case 'OPEN_OMR':
        if (onNavigateTab) {
          onNavigateTab('omr-test');
        }
        break;

      case 'OPEN_ANALYTICS':
        if (onNavigateTab) {
          onNavigateTab('analytics');
        }
        break;

      case 'EXPORT_DATA':
        if (onExportData) {
          onExportData();
        } else {
          // Trigger standard export
          try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(existingTests, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `math_tests_backup_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
          } catch (e) {
            console.error('Export error:', e);
          }
        }
        break;

      case 'OPEN_HTML_NOTES':
        if (onNavigateTab) {
          onNavigateTab('html-notes');
        }
        break;

      case 'OPEN_NOTES':
        if (onNavigateTab) {
          onNavigateTab('notes-repository');
        }
        break;

      case 'NAVIGATE':
      default:
        if (targetTab && onNavigateTab) {
          onNavigateTab(targetTab);
        }
        break;
    }
  };

  const getActionTheme = () => {
    switch (type) {
      case 'LAUNCH_TEST':
        return {
          icon: Play,
          color: 'text-[#0b57d0] dark:text-[#a8c7fa] bg-[#d3e3fd] dark:bg-[#004a77]',
          btnBg: 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]',
          badge: 'Test Runner',
          badgeColor: 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]',
          defaultTitle: matchingTest ? `Launch "${matchingTest.title}"` : 'Launch Test',
          defaultDesc: `Start practicing with ${matchingTest?.questions?.length || 'all'} questions in ${payload?.mode || 'timed'} mode.`
        };

      case 'OPEN_CUSTOM_BUILDER':
        return {
          icon: Target,
          color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/70',
          btnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs',
          badge: 'Custom Studio',
          badgeColor: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-200',
          defaultTitle: 'Launch Custom Test Studio',
          defaultDesc: 'Create tests with custom questions, marks, and manual timer settings.'
        };

      case 'OPEN_STUDIO':
        return {
          icon: Sparkles,
          color: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-950/70',
          btnBg: 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs',
          badge: 'Test Studio',
          badgeColor: 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-200',
          defaultTitle: 'Open Test Creator Studio',
          defaultDesc: 'Create or refine questions, LaTeX equations, and custom test layouts.'
        };

      case 'OPEN_OMR':
        return {
          icon: Scan,
          color: 'text-[#ea580c] dark:text-[#ff9d5c] bg-[#ffe8d9] dark:bg-[#432313]',
          btnBg: 'bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-xs',
          badge: 'OMR Scanner',
          badgeColor: 'bg-[#ffe8d9] text-[#ea580c] dark:bg-[#432313] dark:text-[#ff9d5c]',
          defaultTitle: 'Open OMR Bubble Scanner',
          defaultDesc: 'Scan paper answer sheets via camera or file upload for instant AI grading.'
        };

      case 'OPEN_ANALYTICS':
      case 'DIAGNOSE_WEAKNESSES':
        return {
          icon: BarChart2,
          color: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70',
          btnBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs',
          badge: 'Analytics Hub',
          badgeColor: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200',
          defaultTitle: 'View Performance Analytics',
          defaultDesc: 'Analyze your score trends, accuracy by topic, and time management.'
        };

      case 'EXPORT_DATA':
        return {
          icon: Download,
          color: 'text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-950/70',
          btnBg: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-xs',
          badge: 'Data Backup',
          badgeColor: 'bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-200',
          defaultTitle: 'Export Tests Backup (JSON)',
          defaultDesc: 'Download an offline copy of all your tests and question banks.'
        };

      case 'OPEN_HTML_NOTES':
        return {
          icon: FileText,
          color: 'text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/70',
          btnBg: 'bg-violet-600 hover:bg-violet-700 text-white shadow-xs',
          badge: 'HTML Notes',
          badgeColor: 'bg-violet-100 dark:bg-violet-950/70 text-violet-800 dark:text-violet-200',
          defaultTitle: title || 'Open HTML Notes Studio',
          defaultDesc: description || 'Inspect and edit your HTML slide decks, KaTeX formulas, and chapter notes.'
        };

      case 'OPEN_NOTES':
        return {
          icon: Layers,
          color: 'text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-950/70',
          btnBg: 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs',
          badge: 'Formula Notes',
          badgeColor: 'bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-200',
          defaultTitle: title || 'Open Formula Notes Studio',
          defaultDesc: description || 'Access your saved mathematical formulas, mistake notes, and exam tricks.'
        };

      case 'NAVIGATE':
      default:
        return {
          icon: ArrowRight,
          color: 'text-[#0b57d0] dark:text-[#a8c7fa] bg-[#d3e3fd] dark:bg-[#004a77]',
          btnBg: 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]',
          badge: 'Quick Navigation',
          badgeColor: 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]',
          defaultTitle: title || `Go to ${targetTab || 'App'}`,
          defaultDesc: description || `Navigate directly to the ${targetTab} section in the app.`
        };
    }
  };

  const theme = getActionTheme();
  const IconComp = theme.icon;

  return (
    <div className="my-3 w-full max-w-xl p-4 sm:p-5 rounded-[26px] sm:rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3 transition-all text-[#1f1f1f] dark:text-[#e3e3e3]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 border-0 shadow-none ${theme.color}`}>
            <IconComp className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className={`text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border-0 shadow-none ${theme.badgeColor}`}>
                {theme.badge}
              </span>
              {matchingTest && (
                <span className="text-[10px] sm:text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-[#edf2f9] dark:bg-[#26282e] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-none truncate">
                  {matchingTest.topic}
                </span>
              )}
            </div>
            <h4 className="text-[15px] sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight mt-1 truncate">
              {title || theme.defaultTitle}
            </h4>
          </div>
        </div>
      </div>

      <p className="text-xs sm:text-[12.5px] text-[#5e5e5e] dark:text-[#c4c7c5] leading-relaxed font-normal">
        {description || theme.defaultDesc}
      </p>

      {/* Horizontal Light Partition Line */}
      <div className="w-full h-px bg-slate-100 dark:bg-zinc-800/80 !mt-2.5 !mb-2.5" />

      <div className="flex items-center gap-2 pt-0.5 flex-wrap">
        <button
          type="button"
          onClick={handleExecuteAction}
          className={`h-9 px-4 sm:px-5 rounded-full text-xs sm:text-[13px] font-bold transition-all active:scale-95 cursor-pointer border-0 inline-flex items-center gap-1.5 ${theme.btnBg}`}
        >
          <span>{type === 'LAUNCH_TEST' ? 'Start Test' : type === 'EXPORT_DATA' ? 'Download Backup' : 'Open Now'}</span>
          <ArrowRight className="w-4 h-4 stroke-[2.2]" />
        </button>

        {targetTab && onNavigateTab && type !== 'NAVIGATE' && (
          <button
            type="button"
            onClick={() => onNavigateTab(targetTab)}
            className="h-9 px-4 rounded-full text-xs sm:text-[13px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] bg-[#edf2f9] hover:bg-[#e1e9f5] dark:bg-[#26282e] dark:hover:bg-[#30333b] transition-all cursor-pointer border-0 shadow-none active:scale-95"
          >
            Go to tab
          </button>
        )}
      </div>
    </div>
  );
};
