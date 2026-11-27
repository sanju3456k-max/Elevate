import React, { useState } from 'react';
import { ArrowLeft, Link2, Play } from 'lucide-react';
import { MultiSourceVideoPlayer } from './MultiSourceVideoPlayer';

interface PlayerLabPageProps {
  onBack: () => void;
}

const SAMPLE_SOURCES = [
  {
    label: 'MP4 Direct',
    title: 'MDN Flower Sample (MP4)',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
  {
    label: 'HLS (.m3u8)',
    title: 'Mux Test Stream (HLS)',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    label: 'Vimeo',
    title: 'Vimeo Sample Video',
    url: 'https://vimeo.com/76979871',
  },
  {
    label: 'YouTube',
    title: 'YouTube Embed Test',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  },
];

export const PlayerLabPage: React.FC<PlayerLabPageProps> = ({ onBack }) => {
  const [inputUrl, setInputUrl] = useState(SAMPLE_SOURCES[0].url);
  const [activeUrl, setActiveUrl] = useState(SAMPLE_SOURCES[0].url);
  const [activeTitle, setActiveTitle] = useState(SAMPLE_SOURCES[0].title);

  const handleLoad = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    setActiveUrl(inputUrl.trim());
    setActiveTitle('Custom Pasted Video');
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 rounded-full bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back Home</span>
          </button>
          <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#0b57d0] text-[11px] font-bold">
            Isolated Player Lab (Zero Impact on App)
          </span>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Multi-Source Video Player Lab</h1>
            <p className="text-xs text-slate-500 mt-1">
              Paste any .mp4, .m3u8 (HLS), YouTube, Vimeo, Dailymotion, Google Drive, Loom, or embeddable site URL to test playback.
            </p>
          </div>

          <form onSubmit={handleLoad} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Paste video or site URL here..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0b57d0]"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#0b57d0] hover:bg-[#0947a8] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 border-0 cursor-pointer shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Load Video</span>
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {SAMPLE_SOURCES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => {
                  setInputUrl(sample.url);
                  setActiveUrl(sample.url);
                  setActiveTitle(sample.title);
                }}
                className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border-0 cursor-pointer"
              >
                {sample.label}
              </button>
            ))}
          </div>

          <MultiSourceVideoPlayer url={activeUrl} title={activeTitle} />
        </div>
      </div>
    </div>
  );
};
